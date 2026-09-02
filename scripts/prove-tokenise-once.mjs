// One-shot proof that scripts/tokenise-once.mjs changed nothing a browser
// resolves. Not part of the build.
//
//   node scripts/prove-tokenise-once.mjs <before-root> <after-root> [page …]
//
// <before-root> is a built checkout from before the swap, <after-root> one
// from after. For each page (default: index.html, contact.html,
// work/opt/index.html) every element is walked in document order and each
// inline style / style-<pseudo> attribute is resolved, var(--x) replaced by
// the :root value in <after-root>/css/tokens.css, and compared declaration by
// declaration. Every rule in every <style> block is compared the same way,
// and every [style*="…"] selector that was rewritten must select exactly the
// same elements as before. Finally the whole documents are compared after
// resolution, so nothing outside styles moved either. Exits 1 on any
// difference.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [beforeRoot, afterRoot, ...named] = process.argv.slice(2);
if (!beforeRoot || !afterRoot) { console.error('usage: prove-tokenise-once.mjs <before-root> <after-root> [page …]'); process.exit(2); }
const pages = named.length ? named : ['index.html', 'contact.html', 'work/opt/index.html'];

const tokensCss = readFileSync(join(afterRoot, 'css/tokens.css'), 'utf8');
const rootBlock = tokensCss.match(/:root\s*\{([\s\S]*?)\}/)[1];
const tokens = new Map([...rootBlock.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const VAR = new RegExp('var\\(--(' + [...tokens.keys()].join('|') + ')\\)', 'g');

const resolve = (s) => s.replace(VAR, (m, n) => tokens.get(n));
const normalise = (s) => resolve(s)
  .replace(/(?<![\w.])\.(\d)/g, '0.$1')                       // .42 → 0.42
  .replace(/#([0-9a-f]{6})\b/gi, (m, h) => '#' + h.toUpperCase())
  .replace(/\[style\*="#/g, '[style*="')                        // bare 67655D selector form
  .replace(/\?v=[0-9a-f]{8}/g, '')                              // asset stamps
  .replace(/\s+/g, ' ');
function decls(css) {
  const out = [];
  let start = 0, depth = 0, quote = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; }
    else if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ';' && depth === 0) { out.push(css.slice(start, i)); start = i + 1; }
  }
  out.push(css.slice(start));
  return out.map((d) => d.trim()).filter(Boolean).map((d) => {
    const at = d.indexOf(':');
    return normalise(d.slice(0, at)).trim() + ':' + normalise(d.slice(at + 1)).trim();
  });
}
function rules(css, base = 0, out = []) {
  let i = 0, pos = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { i = css.indexOf('*/', i + 2) + 2; if (i < 2) break; continue; }
    if (c === '"' || c === "'") { i = css.indexOf(c, i + 1) + 1; if (i < 1) break; continue; }
    if (c === '{') {
      let depth = 1, j = i + 1;
      while (j < css.length && depth) {
        const d = css[j];
        if (d === '/' && css[j + 1] === '*') { j = css.indexOf('*/', j + 2) + 2; continue; }
        if (d === '"' || d === "'") { j = css.indexOf(d, j + 1) + 1; continue; }
        if (d === '{') depth++; else if (d === '}') depth--;
        j++;
      }
      const body = css.slice(i + 1, j - 1);
      if (body.includes('{')) rules(body, base + i + 1, out);
      else out.push({ prelude: css.slice(pos, i).replace(/\/\*[\s\S]*?\*\//g, '').trim(), body });
      pos = j; i = j; continue;
    }
    i++;
  }
  return out;
}
// Elements in document order with their attributes; <style>/<script> bodies
// are not elements' children here, so their content is compared separately.
function elements(html) {
  const out = [];
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => m.slice(0, m.indexOf('>') + 1));
  for (const m of stripped.matchAll(/<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
    const attrs = new Map();
    for (const a of m[2].matchAll(/([^\s=]+)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/g)) attrs.set(a[1], a[2] === undefined ? null : a[2].replace(/^["']|["']$/g, ''));
    out.push({ tag: m[1].toLowerCase(), attrs, at: m.index });
  }
  return out.filter((el) => !(el.tag === 'link' && /^\/?css\/tokens\.css/.test(el.attrs.get('href') || '')));
}
const styleBlocks = (html) => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let problems = 0;
const fail = (page, what) => { problems++; console.log(`  ✗ ${page}: ${what}`); };

for (const page of pages) {
  const before = readFileSync(join(beforeRoot, page), 'utf8');
  const after = readFileSync(join(afterRoot, page), 'utf8');
  const A = elements(before), B = elements(after);
  let inline = 0;
  if (A.length !== B.length) fail(page, `${A.length} elements before, ${B.length} after`);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const a = A[i], b = B[i];
    if (a.tag !== b.tag) { fail(page, `element ${i} is <${a.tag}> before and <${b.tag}> after`); break; }
    const names = new Set([...a.attrs.keys(), ...b.attrs.keys()]);
    for (const n of names) {
      const x = a.attrs.get(n), y = b.attrs.get(n);
      if (x === undefined || y === undefined) { fail(page, `<${a.tag}> #${i}: attribute ${n} only ${x === undefined ? 'after' : 'before'}`); continue; }
      if (x === null || y === null) { if (x !== y) fail(page, `<${a.tag}> #${i}: ${n} differs`); continue; }
      if (/^style(-[a-z]+)?$/.test(n)) {
        inline++;
        if (!same(decls(x), decls(y))) fail(page, `<${a.tag}> #${i} ${n}:\n      before ${decls(x).join('; ')}\n      after  ${decls(y).join('; ')}`);
      } else if (normalise(x) !== normalise(y)) fail(page, `<${a.tag}> #${i} ${n}: "${x}" → "${y}"`);
    }
  }
  // <style> blocks, rule by rule.
  const SA = styleBlocks(before), SB = styleBlocks(after);
  let ruleCount = 0, selectorChecks = 0;
  if (SA.length !== SB.length) fail(page, `${SA.length} <style> blocks before, ${SB.length} after`);
  for (let k = 0; k < Math.min(SA.length, SB.length); k++) {
    const RA = rules(SA[k]), RB = rules(SB[k]);
    if (RA.length !== RB.length) fail(page, `<style> #${k}: ${RA.length} rules before, ${RB.length} after`);
    for (let r = 0; r < Math.min(RA.length, RB.length); r++) {
      ruleCount++;
      const pa = RA[r].prelude, pb = RB[r].prelude;
      if (normalise(pa) !== normalise(pb)) fail(page, `<style> #${k} rule ${r} selector: "${pa}" → "${pb}"`);
      if (!same(decls(RA[r].body), decls(RB[r].body))) fail(page, `<style> #${k} rule ${r} "${pb.slice(0, 60)}":\n      before ${decls(RA[r].body).join('; ')}\n      after  ${decls(RB[r].body).join('; ')}`);
      // A rewritten [style*="…"] must select the same elements as before.
      const subA = [...pa.matchAll(/\[style\*="([^"]*)"\]/g)].map((m) => m[1]);
      const subB = [...pb.matchAll(/\[style\*="([^"]*)"\]/g)].map((m) => m[1]);
      for (let s = 0; s < subA.length; s++) {
        if (subA[s] === subB[s]) continue;
        selectorChecks++;
        const hits = (els, sub) => els.map((el, i) => (el.attrs.get('style') || '').includes(sub) ? i : -1).filter((i) => i >= 0);
        const ha = hits(A, subA[s]), hb = hits(B, subB[s]);
        if (!same(ha, hb)) fail(page, `[style*="${subA[s]}"] matched ${ha.length} elements, [style*="${subB[s]}"] matches ${hb.length}`);
      }
    }
  }
  // The whole document, resolved: nothing else moved.
  const wa = normalise(before.replace(/<!--[\s\S]*?-->/g, ''));
  const wb = normalise(after.replace(/<!--[\s\S]*?-->/g, '').replace(/<link rel="stylesheet" href="\/?css\/tokens\.css[^"]*">\s*/, ''));
  if (wa !== wb) {
    let i = 0; while (i < wa.length && wa[i] === wb[i]) i++;
    fail(page, `documents differ at offset ${i}:\n      before …${wa.slice(Math.max(0, i - 80), i + 120)}…\n      after  …${wb.slice(Math.max(0, i - 80), i + 120)}…`);
  }
  console.log(`${page}: ${A.length} elements, ${inline} inline styles, ${ruleCount} rules, ${selectorChecks} rewritten selectors — ${problems ? 'see above' : 'identical when resolved'}`);
}
console.log(problems ? `${problems} difference(s)` : 'zero differences');
process.exit(problems ? 1 : 0);

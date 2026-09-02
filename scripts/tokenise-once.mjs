// One-shot: rewrite the off-white colour literals in src/*.html as the tokens
// declared in css/tokens.css. Kept in the repository as the record of how the
// swap was made; it is not part of the build and is not meant to run again.
//
//   node scripts/tokenise-once.mjs            rewrite src/ in place
//   node scripts/tokenise-once.mjs --dry-run  report only
//
// What changes: every #171613 / #F3F1EA / #E8E5DC / #67655D / #A6A399 /
// #E17B3E / #F5F3EC / #121110 / #C0431F (any case) and every
// rgba(23,22,19,0.NN) inside style="", style-<pseudo>="" and <style> blocks
// becomes var(--name). The whole-string colour literals in the pages'
// data-page-script blocks (the values the render step interpolates into
// style="" templates) are rewritten the same way, so the built inline styles
// they produce read like the authored ones.
//
// What is skipped, so no ground can change: html.dm / html.dmwarm / html.dmred
// override rules, rules that set a filter, the --dm-bg fallbacks, JSON-LD and
// <meta name="theme-color">. Each skipped range that still holds a literal is
// listed in the report.
//
// The [style*="…#67655D…"] selectors (and the bare [style*="67655D"] form)
// must keep matching inline styles that now say var(--muted), so every such
// selector's substring is rewritten to the var() form, including inside the
// skipped override rules and in js/chrome-bar.js.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dry = process.argv.includes('--dry-run');

const HEX = {
  '171613': 'ink',
  'F3F1EA': 'ground',
  'E8E5DC': 'plate',
  '67655D': 'muted',
  'A6A399': 'faint',
  'E17B3E': 'accent',
  'F5F3EC': 'chrome-ink',
  '121110': 'charcoal',
  'C0431F': 'burnt',
};
const HEX_RE = new RegExp('(?<!--dm-bg,\\s*)#(' + Object.keys(HEX).join('|') + ')(?![0-9A-Fa-f])', 'gi');
const RULE_RE = /rgba\(\s*23\s*,\s*22\s*,\s*19\s*,\s*(0?\.\d+|0)\s*\)/g;
const HEX_ANY = new RegExp('#(' + Object.keys(HEX).join('|') + ')(?![0-9A-Fa-f])', 'gi');

const tokens = readFileSync(join(root, 'css/tokens.css'), 'utf8');
const declared = new Set([...tokens.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const used = new Map();

function ruleToken(alpha) {
  if (alpha === '0') return null;                 // rgba(23,22,19,0): transparent, not a rule
  const digits = alpha.replace(/^0?\./, '');
  if (digits.length > 2) throw new Error(`alpha ${alpha} has more than two decimals; add a token by hand`);
  return 'rule-' + digits.padEnd(2, '0');
}
function use(name) {
  if (!declared.has(name)) throw new Error(`--${name} is not declared in css/tokens.css`);
  used.set(name, (used.get(name) || 0) + 1);
  return `var(--${name})`;
}
// Declarations: literals become tokens; a --dm-bg fallback is left alone.
function tokenise(css) {
  return css
    .replace(HEX_RE, (m, hex) => use(HEX[hex.toUpperCase()]))
    .replace(RULE_RE, (m, alpha) => { const t = ruleToken(alpha); return t ? use(t) : m; });
}
// Selector substrings: same mapping, no --dm-bg exemption, and the bare
// "67655D" spelling (no #) is honoured too.
function tokeniseSelector(text) {
  return text
    .replace(new RegExp('#?(' + Object.keys(HEX).join('|') + ')(?![0-9A-Fa-f])', 'g'), (m, hex) => use(HEX[hex]))
    .replace(RULE_RE, (m, alpha) => { const t = ruleToken(alpha); return t ? use(t) : m; });
}
function rewriteSelectors(text) {
  return text.replace(/\[style\*="([^"]*)"\]/g, (m, inner) => `[style*="${tokeniseSelector(inner)}"]`);
}

// ------------------------------------------------------------ css parsing
// Returns every declaration block in css as {preludeStart, bodyStart, bodyEnd}
// with absolute offsets; group rules (@media, @keyframes…) are descended.
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
      else out.push({ preludeStart: base + pos, bodyStart: base + i + 1, bodyEnd: base + j - 1 });
      pos = j; i = j; continue;
    }
    i++;
  }
  return out;
}

const lineOf = (text, at) => text.slice(0, at).split('\n').length;
const literals = (s) => (s.match(HEX_ANY) || []).length + (s.match(RULE_RE) || []).filter((m) => !/,\s*0\s*\)$/.test(m)).length;

function processStyleBlock(css, base, whole, skipped) {
  const edits = [];
  for (const r of rules(css)) {
    const prelude = css.slice(r.preludeStart, r.bodyStart - 1);
    const body = css.slice(r.bodyStart, r.bodyEnd);
    const line = lineOf(whole, base + r.preludeStart + (prelude.length - prelude.trimStart().length));
    if (/html\.dm/.test(prelude)) { if (literals(body)) skipped.push(`${line}: html.dm override rule (${literals(body)})`); continue; }
    if (/(^|[^-\w])filter\s*:/.test(body)) { if (literals(body)) skipped.push(`${line}: filter rule (${literals(body)})`); continue; }
    const fallbacks = (body.match(/var\(--dm-bg,\s*#[0-9A-Fa-f]{6}\)/g) || []).length;
    if (fallbacks) skipped.push(`${line}: --dm-bg fallback (${fallbacks})`);
    const next = tokenise(body);
    if (next !== body) edits.push([r.bodyStart, r.bodyEnd, next]);
  }
  let out = css;
  for (const [s, e, t] of edits.reverse()) out = out.slice(0, s) + t + out.slice(e);
  for (const c of out.matchAll(/\/\*[\s\S]*?\*\//g)) {
    for (const m of c[0].matchAll(HEX_ANY)) skipped.push(`${lineOf(whole, base + c.index + m.index)}: comment in <style> (${m[0]})`);
  }
  return out;
}

function processPage(html) {
  const skipped = [];
  const segments = /<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>|<meta\b[^>]*>/gi;
  let out = '';
  let last = 0;
  const markup = (text, base) => afterMarkup(text.replace(/\bstyle(?:-[a-z]+)?="([^"]*)"/g, (m, value, at) => {
    const fallbacks = (value.match(/var\(--dm-bg,\s*#[0-9A-Fa-f]{6}\)/g) || []).length;
    if (fallbacks) skipped.push(`${lineOf(html, base + at)}: --dm-bg fallback in inline style (${fallbacks})`);
    return m.slice(0, m.indexOf('"') + 1) + tokenise(value) + '"';
  }), base);
  const afterMarkup = (text, base) => {
    for (const m of text.matchAll(new RegExp(HEX_ANY.source + '|' + RULE_RE.source, 'gi'))) {
      if (/,\s*0\s*\)$/.test(m[0])) continue;
      skipped.push(`${lineOf(html, base + m.index)}: attribute other than style (${m[0]})`);
    }
    return text;
  };
  for (const m of html.matchAll(segments)) {
    out += markup(html.slice(last, m.index), last);
    const seg = m[0];
    const line = lineOf(html, m.index);
    if (/^<style/i.test(seg)) {
      const open = seg.indexOf('>') + 1;
      const close = seg.lastIndexOf('</');
      out += seg.slice(0, open) + processStyleBlock(seg.slice(open, close), m.index + open, html, skipped) + seg.slice(close);
    } else if (/^<script[^>]*data-page-script/i.test(seg)) {
      // Whole-string colour literals only: the values that land in style="".
      const next = seg.replace(/(['"])(#[0-9A-Fa-f]{6}|rgba\(23,22,19,0?\.\d+\))\1/g, (m, q, lit) => q + tokenise(lit) + q);
      if (literals(next)) skipped.push(`${line}: comments in data-page-script (${literals(next)})`);
      out += next;
    } else if (/^<script[^>]*application\/ld\+json/i.test(seg)) {
      if (literals(seg)) skipped.push(`${line}: JSON-LD (${literals(seg)})`);
      out += seg;
    } else if (/^<meta[^>]*theme-color/i.test(seg)) {
      if (literals(seg)) skipped.push(`${line}: <meta theme-color> (${literals(seg)})`);
      out += seg;
    } else {
      if (literals(seg)) skipped.push(`${line}: inline script left alone (${literals(seg)})`);
      out += seg;
    }
    last = m.index + seg.length;
  }
  out += markup(html.slice(last), last);
  return { html: rewriteSelectors(out), skipped };
}

const pages = readdirSync(join(root, 'src')).filter((f) => f.endsWith('.html')).map((f) => 'src/' + f);
for (const page of pages) {
  const before = readFileSync(join(root, page), 'utf8');
  const { html, skipped } = processPage(before);
  console.log(`${page}: ${literals(before)} literals before, ${literals(html)} after${skipped.length ? '; skipped:' : ''}`);
  for (const s of skipped) console.log('    ' + s);
  if (!dry && html !== before) writeFileSync(join(root, page), html);
}
const bar = 'js/chrome-bar.js';
const barBefore = readFileSync(join(root, bar), 'utf8');
const barAfter = rewriteSelectors(barBefore);
console.log(`${bar}: ${barBefore === barAfter ? 'no' : 'selector'} change`);
if (!dry && barAfter !== barBefore) writeFileSync(join(root, bar), barAfter);
console.log('tokens used: ' + [...used].map(([k, v]) => `--${k}×${v}`).join(' '));

// Renders an authored page under src/ to plain HTML at build time.
//
// A source page is an ordinary document whose <body> is a template and whose
// <script data-page-script> block defines the Component class that supplies
// the template's values through renderVals(). This evaluates that class once,
// in Node, and writes the body out with every binding resolved, wrapped in
// <div id="page">. It implements only the dialect the site's pages use: {{ }}
// paths, <sc-for>, <sc-if> and style-<pseudo> attributes. Anything else
// throws, so an unsupported construct cannot reach production half-rendered.
//
// The dialect and the resolve() rules below are inherited from the Design
// Component runtime the pages were once rendered by in the browser; the
// runtime is gone and this is the only thing that reads them now.
import vm from 'node:vm';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

// ------------------------------------------------------------ expressions
// A port of the runtime's resolve(): dotted paths, [index] access, literals,
// ! and the four equality operators. Same code path, same answers.
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function resolve(vals, src) {
  const expr = String(src).trim();
  if (!expr) return undefined;
  if (expr[0] === '(' && expr[expr.length - 1] === ')' && parensWrapWhole(expr)) return resolve(vals, expr.slice(1, -1));
  const eq = findTopLevelEquality(expr);
  if (eq) {
    const lv = resolve(vals, expr.slice(0, eq.index));
    const rv = resolve(vals, expr.slice(eq.index + eq.op.length));
    switch (eq.op) {
      case '===': return lv === rv;
      case '!==': return lv !== rv;
      case '==': return lv == rv; // eslint-disable-line eqeqeq
      default: return lv != rv; // eslint-disable-line eqeqeq
    }
  }
  if (expr[0] === '!') return !resolve(vals, expr.slice(1));
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null') return null;
  if (expr === 'undefined') return undefined;
  if (NUMBER_RE.test(expr)) return Number(expr);
  if (expr.length >= 2 && (expr[0] === '"' || expr[0] === "'") && expr[expr.length - 1] === expr[0]) return expr.slice(1, -1);
  return resolvePath(vals, expr);
}

function parensWrapWhole(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length - 1; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')' && --depth === 0) return false;
  }
  return true;
}

function findTopLevelEquality(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (depth === 0 && (c === '=' || c === '!') && expr[i + 1] === '=') {
      if (i > 0 && (expr[i - 1] === '=' || expr[i - 1] === '!')) continue;
      if (!expr.slice(0, i).trim()) continue;
      return { index: i, op: expr[i + 2] === '=' ? c + '==' : c + '=' };
    }
  }
  return null;
}

function resolvePath(vals, expr) {
  const head = expr.match(IDENT_RE);
  if (!head) return undefined;
  let cur = vals == null ? undefined : vals[head[0]];
  let i = head[0].length;
  while (i < expr.length) {
    if (expr[i] === '.') {
      const m = expr.slice(i + 1).match(IDENT_RE) || expr.slice(i + 1).match(/^\d+/);
      if (!m) return undefined;
      cur = cur == null ? undefined : cur[m[0]];
      i += 1 + m[0].length;
    } else if (expr[i] === '[') {
      let depth = 1, j = i + 1;
      while (j < expr.length && depth > 0) {
        if (expr[j] === '[') depth++;
        else if (expr[j] === ']' && --depth === 0) break;
        j++;
      }
      if (depth !== 0) return undefined;
      cur = cur == null ? undefined : cur[resolve(vals, expr.slice(i + 1, j))];
      i = j + 1;
    } else return undefined;
  }
  return cur;
}

// ----------------------------------------------------------------- escaping
// Text is written with the three entities the DOM serialises; attributes
// additionally need the quote.
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

// ------------------------------------------------------------------ parsing
// A small tokenizer for the site's own hand-written template: elements,
// quoted or bare attributes, comments, raw-text elements and void tags.
function parse(html) {
  const root = { children: [] };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { top().children.push({ type: 'text', text: html.slice(i) }); break; }
    if (lt > i) top().children.push({ type: 'text', text: html.slice(i, lt) });
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      if (end < 0) throw new Error('render-page: unterminated comment');
      i = end + 3;
      continue;
    }
    if (html[lt + 1] === '/') {
      const end = html.indexOf('>', lt);
      const tag = html.slice(lt + 2, end).trim().toLowerCase();
      const open = top();
      if (open === root || open.tag !== tag) throw new Error(`render-page: unexpected </${tag}> (open element is <${open.tag || 'root'}>)`);
      stack.pop();
      i = end + 1;
      continue;
    }
    const m = /^<([A-Za-z][^\s/>]*)/.exec(html.slice(lt));
    if (!m) { top().children.push({ type: 'text', text: '<' }); i = lt + 1; continue; }
    const tag = m[1].toLowerCase();
    const el = { type: 'el', tag, attrs: [], children: [] };
    let j = lt + m[0].length;
    let selfClosing = false;
    for (;;) {
      while (j < html.length && /\s/.test(html[j])) j++;
      if (html[j] === '>') { j++; break; }
      if (html[j] === '/' && html[j + 1] === '>') { selfClosing = true; j += 2; break; }
      if (j >= html.length) throw new Error(`render-page: unterminated <${tag}>`);
      const nm = /^[^\s=/>]+/.exec(html.slice(j));
      if (!nm) throw new Error(`render-page: bad attribute in <${tag}> near ${html.slice(j, j + 30)}`);
      const name = nm[0];
      j += name.length;
      while (j < html.length && /\s/.test(html[j])) j++;
      if (html[j] !== '=') { el.attrs.push({ name, value: null }); continue; }
      j++;
      while (j < html.length && /\s/.test(html[j])) j++;
      const q = html[j];
      let value;
      if (q === '"' || q === "'") {
        const end = html.indexOf(q, j + 1);
        if (end < 0) throw new Error(`render-page: unterminated attribute ${name} in <${tag}>`);
        value = html.slice(j + 1, end);
        j = end + 1;
      } else {
        const v = /^[^\s>]+/.exec(html.slice(j));
        value = v ? v[0] : '';
        j += value.length;
      }
      el.attrs.push({ name, value });
    }
    top().children.push(el);
    i = j;
    if (selfClosing || VOID.has(tag)) continue;
    if (RAW_TEXT.has(tag)) {
      const end = html.toLowerCase().indexOf(`</${tag}>`, i);
      if (end < 0) throw new Error(`render-page: unterminated <${tag}>`);
      el.children.push({ type: 'raw', text: html.slice(i, end) });
      i = end + tag.length + 3;
      continue;
    }
    stack.push(el);
  }
  if (stack.length > 1) throw new Error(`render-page: <${top().tag}> is never closed`);
  return root.children;
}

// ---------------------------------------------------------------- pseudo
// Mirrors the runtime's pseudo sheet: one class per distinct (pseudo, css)
// pair, named scp0, scp1 ... in order of first use, every declaration made
// !important so it wins over the element's inline style, except for
// ::before/::after which have no inline style to beat.
function importantify(css) {
  const decls = [];
  let start = 0, depth = 0, quote = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; }
    else if (c === "'" || c === '"') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) { decls.push(css.slice(start, i)); start = i + 1; }
  }
  decls.push(css.slice(start));
  return decls.map((d) => d.trim()).filter(Boolean).map((d) => (/!\s*important$/i.test(d) ? d : d + ' !important')).join(';');
}

function createPseudoSheet() {
  const cache = new Map();
  const rules = [];
  return {
    rules,
    className(pseudo, css) {
      const k = pseudo + '|' + css;
      if (cache.has(k)) return cache.get(k);
      const cls = 'scp' + cache.size.toString(36);
      const element = pseudo === 'before' || pseudo === 'after';
      rules.push('.' + cls + (element ? '::' : ':') + pseudo + '{' + (element ? css : importantify(css)) + '}');
      cache.set(k, cls);
      return cls;
    },
  };
}

// --------------------------------------------------------------- rendering
function interpolate(raw, vals, where) {
  const whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
  if (whole) return lookup(vals, whole[1], where);
  if (!raw.includes('{{')) return raw;
  return raw.split(/\{\{([\s\S]+?)\}\}/g).map((s, i) => (i & 1 ? lookup(vals, s, where) ?? '' : s)).join('');
}

function lookup(vals, path, where) {
  const v = resolve(vals, path);
  if (v === undefined) throw new Error(`render-page: {{ ${path.trim()} }} did not resolve (${where})`);
  return v;
}

function renderNodes(nodes, vals, sheet) {
  return nodes.map((n) => renderNode(n, vals, sheet)).join('');
}

function renderNode(node, vals, sheet) {
  if (node.type === 'raw') return node.text;
  if (node.type === 'text') return renderText(node.text, vals);
  const { tag } = node;
  if (tag === 'sc-for') {
    const list = interpolate(attr(node, 'list') || '', vals, '<sc-for>');
    if (!Array.isArray(list)) throw new Error(`render-page: <sc-for list="${attr(node, 'list')}"> is not an array`);
    const as = attr(node, 'as') || 'item';
    return list.map((item, i) => renderNodes(node.children, { ...vals, [as]: item, $index: i }, sheet)).join('');
  }
  if (tag === 'sc-if') {
    return interpolate(attr(node, 'value') || '', vals, '<sc-if>') ? renderNodes(node.children, vals, sheet) : '';
  }
  const out = [];
  const classes = [];
  let classAt = -1;
  for (const { name, value } of node.attrs) {
    if (name.startsWith('style-')) {
      classes.push(sheet.className(name.slice(6), interpolate(value || '', vals, name)));
      continue;
    }
    if (value === null) { out.push(name); continue; }
    if (!value.includes('{{')) {
      if (name === 'class') classAt = out.length;
      out.push(`${name}="${value}"`);
      continue;
    }
    if (/^on[A-Z]/.test(name) || /^on[a-z]+$/.test(name)) throw new Error(`render-page: ${name} handler on <${tag}> cannot be rendered statically`);
    const where = `${name} on <${tag}>`;
    let text;
    if (/^\s*\{\{[\s\S]+?\}\}\s*$/.test(value)) {
      const v = interpolate(value, vals, where);
      if (typeof v === 'function') throw new Error(`render-page: ${where} resolved to a function`);
      if (v === null || v === false) continue;
      if (v === true) { out.push(`${name}=""`); continue; }
      text = escAttr(v);
    } else {
      // Only the bound values are escaped: the template's own text is already
      // attribute-safe HTML and may hold entities of its own.
      text = value.split(/\{\{([\s\S]+?)\}\}/g).map((s, i) => (i & 1 ? escAttr(lookup(vals, s, where) ?? '') : s)).join('');
    }
    if (name === 'class') classAt = out.length;
    out.push(`${name}="${text}"`);
  }
  if (classes.length) {
    if (classAt >= 0) out[classAt] = out[classAt].replace(/"$/, ' ' + classes.join(' ') + '"');
    else out.push(`class="${classes.join(' ')}"`);
  }
  const open = '<' + tag + (out.length ? ' ' + out.join(' ') : '') + '>';
  if (VOID.has(tag)) return open;
  return open + renderNodes(node.children, vals, sheet) + '</' + tag + '>';
}

function attr(node, name) {
  const a = node.attrs.find((x) => x.name === name);
  return a ? a.value : null;
}

function renderText(txt, vals) {
  // Whitespace-only text that holds no ordinary space is dropped, as the
  // pages' original renderer dropped it; the rendered files depend on that.
  if (!txt.includes('{{')) return !txt.trim() && !txt.includes(' ') ? '' : txt;
  return txt.split(/\{\{([\s\S]+?)\}\}/g).map((p, i) => {
    if (!(i & 1)) return p;
    const v = lookup(vals, p, 'text');
    if (v === null || typeof v === 'boolean') return '';
    if (typeof v === 'object' || typeof v === 'function') throw new Error(`render-page: {{ ${p.trim()} }} is not text`);
    return escText(v);
  }).join('');
}

// --------------------------------------------------------------- the page
const SCRIPT_RE = /<script\b[^>]*\bdata-page-script\b[^>]*>([\s\S]*?)<\/script>[ \t]*\r?\n?/;

// The page's Component, evaluated the way lib/content-model.mjs evaluates its
// literals: in a bare vm context, with nothing of the browser in scope.
export function evaluateComponent(source) {
  const m = SCRIPT_RE.exec(source);
  if (!m) throw new Error('render-page: no <script data-page-script> in the page');
  const ctx = vm.createContext(Object.create(null));
  const Component = vm.runInContext(m[1] + '\n;Component', ctx, { timeout: 1000 });
  if (typeof Component !== 'function') throw new Error('render-page: the page script does not define class Component');
  const logic = new Component();
  // Copied into this realm: the vm's objects carry their own Object prototype.
  return typeof logic.renderVals === 'function' ? { ...(logic.renderVals() || {}) } : {};
}

export function renderPage(source, { vals } = {}) {
  const open = /<body(?:\s[^>]*)?>/.exec(source);
  const close = source.lastIndexOf('</body>');
  if (!open || close < 0 || close < open.index) throw new Error('render-page: no <body> in the page');
  let head = source.slice(0, open.index + open[0].length);
  const template = source.slice(open.index + open[0].length, close).replace(SCRIPT_RE, '');
  const tail = source.slice(close);

  const sheet = createPseudoSheet();
  const body = renderNodes(parse(template), vals || evaluateComponent(source), sheet);

  // The pseudo sheet, and a full-height frame for the field the body is
  // wrapped in, go into the head's last style block, or a new one.
  const extra = [...sheet.rules, 'html,body{height:100%;margin:0}#page{height:100%}'].join('\n');
  const headEnd = head.lastIndexOf('</head>');
  if (headEnd < 0) throw new Error('render-page: no </head> in the page');
  const styleAt = head.lastIndexOf('</style>', headEnd);
  head = styleAt >= 0
    ? head.slice(0, styleAt) + extra + '\n' + head.slice(styleAt)
    : head.slice(0, headEnd) + '<style>\n' + extra + '\n</style>\n' + head.slice(headEnd);

  return head + '\n<div id="page">' + body + '</div>\n' + tail;
}

// Reading and writing the site's own source files.
//
// SuDu has no content database. The projects live in `static DATA` inside
// project.html, their reading order lives in `static EDITORIAL` beside it,
// image proportions in `static DIMS`, and work.html carries an index order
// plus a small mirror of each project's name, category, location and
// thumbnail. Control edits those files in place.
//
// Two rules follow from that, and both are the reason this module exists
// rather than a JSON round-trip:
//
//   Only the object being changed may move. project.html is 900 lines of
//   hand-authored template around these objects, and a whole-file reserialise
//   would rewrite all of it. Every write here splices exactly one balanced
//   brace range and leaves every byte outside it alone.
//
//   A project's own shape is preserved. Some projects carry `groups`, others
//   a flat `gallery`; an editor that normalised them would silently delete
//   whichever it did not know about. Updates merge into the existing record
//   and never drop a key they were not asked about.
import vm from 'node:vm';

export const PROJECT_FILE = 'project.html';
export const WORK_FILE = 'work.html';
export const MEDIA_DIR = 'images/';

// ---------------------------------------------------------------- locating

// Walk a balanced brace/bracket range from the first opener after `prefix`,
// skipping anything inside a string so a brace in prose cannot end the object.
function bounds(source, prefix, opener) {
  const closer = opener === '{' ? '}' : ']';
  const at = source.indexOf(prefix);
  if (at < 0) throw new Error(`content-model: could not find ${prefix.trim()}`);
  const open = source.indexOf(opener, at);
  if (open < 0) throw new Error(`content-model: ${prefix.trim()} has no ${opener}`);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === opener) depth++;
    else if (c === closer && --depth === 0) return { open, end: i + 1 };
  }
  throw new Error(`content-model: ${prefix.trim()} is unterminated`);
}

// The literals are the site's own source, not user input, but they are still
// evaluated — so it happens in a context with no globals at all rather than
// with Function(), which would hand them this module's scope.
function evaluate(literal) {
  const value = vm.runInNewContext('(' + literal + ')', Object.create(null), { timeout: 1000 });
  // The sandbox has its own realm, so what comes back carries that realm's
  // prototypes. Everything in these objects is JSON-shaped, and bringing it
  // across keeps callers comparing plain values rather than foreign ones.
  return JSON.parse(JSON.stringify(value));
}

export function readLiteral(source, prefix, opener = '{') {
  const b = bounds(source, prefix, opener);
  return evaluate(source.slice(b.open, b.end));
}

// ---------------------------------------------------------------- writing

const quoteKey = (k) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : quoteStr(k));
const quoteStr = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

// The site's own hand: single quotes, two-space steps, short objects on one
// line. Written out rather than JSON.stringify'd so a Control edit reads like
// the rest of the file in a diff and a human can still review it.
function format(value, indent) {
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return quoteStr(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const parts = value.map((v) => format(v, indent + 1));
    const flat = '[' + parts.join(', ') + ']';
    if (flat.length + pad.length <= 96 && !flat.includes('\n')) return flat;
    return '[\n' + parts.map((p) => inner + p).join(',\n') + '\n' + pad + ']';
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined);
  if (!keys.length) return '{}';
  const parts = keys.map((k) => quoteKey(k) + ': ' + format(value[k], indent + 1));
  const flat = '{ ' + parts.join(', ') + ' }';
  if (flat.length + pad.length <= 96 && !flat.includes('\n')) return flat;
  return '{\n' + parts.map((p) => inner + p).join(',\n') + '\n' + pad + '}';
}

export function writeLiteral(source, prefix, value, indent = 1, opener = '{') {
  const b = bounds(source, prefix, opener);
  return source.slice(0, b.open) + format(value, indent) + source.slice(b.end);
}

// Find one key's value inside an already-located object, so a change to a
// single project rewrites that project and leaves the other eighteen exactly
// as they were. Rewriting the whole object instead produced a 764-line diff
// for a one-word edit, which is not something anyone can review before
// publishing it.
function entryBounds(source, container, key) {
  const c = bounds(source, container, '{');
  const re = new RegExp("(^|[{,\\s])(?:'" + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                        "'|\"" + key + "\"|" + key + ")\\s*:", 'm');
  const slice = source.slice(c.open, c.end);
  const m = re.exec(slice);
  if (!m) return null;
  const colon = c.open + m.index + m[0].length;
  let i = colon;
  while (i < source.length && /\s/.test(source[i])) i++;
  const opener = source[i];
  if (opener !== '{' && opener !== '[') return null;
  const closer = opener === '{' ? '}' : ']';
  let depth = 0, quote = '', escaped = false;
  for (let j = i; j < source.length; j++) {
    const ch = source[j];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === opener) depth++;
    else if (ch === closer && --depth === 0) return { open: i, end: j + 1 };
  }
  return null;
}

// Replace only the entries whose value actually changed.
export function writeEntries(source, container, before, after, indent = 2) {
  let out = source;
  const keys = Object.keys(after);
  // work back to front so earlier offsets stay valid
  const targets = [];
  for (const key of keys) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    const b = entryBounds(out, container, key);
    if (!b) return null;               // new key, or a shape this cannot address
    targets.push({ key, ...b });
  }
  if (!targets.length) return source;
  targets.sort((a, b) => b.open - a.open);
  for (const t of targets) {
    out = out.slice(0, t.open) + format(after[t.key], indent) + out.slice(t.end);
  }
  return out;
}

// ---------------------------------------------------------------- reading

export function readSite(projectSrc, workSrc) {
  const DATA = readLiteral(projectSrc, 'static DATA =');
  const EDITORIAL = readLiteral(projectSrc, 'static EDITORIAL =');
  const DIMS = readLiteral(projectSrc, 'static DIMS =');
  const order = readLiteral(workSrc, 'const order =', '[');
  const names = readLiteral(workSrc, 'const names =');
  return { DATA, EDITORIAL, DIMS, order, names };
}

// Whichever shape a project uses, this is the list the gallery would show and
// the list EDITORIAL indexes into.
export function projectMedia(project) {
  if (project.groups) return project.groups.reduce((all, g) => all.concat(g.images || []), []);
  return (project.gallery || []).slice();
}

export function listProjects(site) {
  return site.order
    .filter((slug) => site.DATA[slug])
    .map((slug) => {
      const p = site.DATA[slug];
      return {
        slug,
        title: p.title || '',
        eyebrow: p.eyebrow || '',
        location: p.location || '',
        scope: p.scope || '',
        status: p.status || '',
        lede: p.lede || '',
        body: p.body || '',
        heroSrc: p.heroSrc || '',
        next: p.next || '',
        counter: p.counter || '',
        shape: p.groups ? 'groups' : (p.gallery ? 'gallery' : 'hero-only'),
        media: projectMedia(p),
        groups: (p.groups || []).map((g) => ({ head: g.head || '', sub: g.sub || '', small: !!g.small, images: (g.images || []).slice() })),
        related: (p.related || []).map((r) => ({ name: r.name || '', meta: r.meta || '', key: r.key || '' })),
        editorial: site.EDITORIAL[slug] ? JSON.parse(JSON.stringify(site.EDITORIAL[slug])) : null,
      };
    });
}

// ---------------------------------------------------------------- validation

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function safeMediaPath(path) {
  const p = String(path || '').trim().replace(/^\/+/, '');
  if (!p.startsWith(MEDIA_DIR)) return null;
  const rest = p.slice(MEDIA_DIR.length);
  // no traversal, no nesting, no hidden files, and an extension the site serves
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(rest)) return null;
  if (rest.includes('..')) return null;
  if (!/\.(jpg|jpeg|png|webp|svg)$/i.test(rest)) return null;
  return MEDIA_DIR + rest;
}

export function validate(site, { slug, project, editorial } = {}) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });

  if (slug !== undefined) {
    if (!SLUG_RE.test(slug)) add('slug', 'Use lower-case letters, numbers and single hyphens.');
  }
  if (project) {
    for (const [key, label] of [['title', 'Title'], ['eyebrow', 'Category'], ['location', 'Location']]) {
      if (!String(project[key] || '').trim()) add(key, label + ' is required.');
    }
    if (project.heroSrc && !safeMediaPath(project.heroSrc)) add('heroSrc', 'The hero image must be a file in images/.');
    for (const src of projectMedia(project)) {
      if (!safeMediaPath(src)) { add('media', `"${src}" is not an allowed image path.`); break; }
    }
    for (const r of project.related || []) {
      if (r.key && !site.DATA[r.key] && r.key !== slug) add('related', `Related project "${r.key}" does not exist.`);
    }
    if (project.next && !site.DATA[project.next] && project.next !== slug) {
      add('next', `Next project "${project.next}" does not exist.`);
    }
  }
  if (editorial && project) {
    const media = projectMedia(project);
    const groups = project.groups || [];
    for (const b of editorial.seq || []) {
      for (const i of b.i || []) {
        if (!media[i]) add('editorial', `Sequence refers to image ${i}, but this project has ${media.length}.`);
      }
      if (typeof b.g === 'number' && !groups[b.g]) add('editorial', `Sequence refers to group ${b.g}, which does not exist.`);
      if (b.t === 'p' && (b.i || []).length !== 2) add('editorial', 'A pair needs exactly two images.');
      if (b.t === 's' && (b.i || []).length !== 1) add('editorial', 'A single needs exactly one image.');
    }
  }
  return errors;
}

// ---------------------------------------------------------------- updating

// Merge rather than replace: a caller that knows nothing about `gallery` must
// not be able to delete it by omission.
export function applyProject(site, slug, patch) {
  const DATA = { ...site.DATA };
  const existing = DATA[slug] || {};
  const next = { ...existing };
  for (const key of ['eyebrow', 'title', 'location', 'scope', 'status', 'lede', 'body', 'heroSrc']) {
    if (patch[key] !== undefined) next[key] = String(patch[key]);
  }
  if (patch.groups !== undefined && existing.groups) next.groups = patch.groups;
  if (patch.gallery !== undefined && existing.gallery) next.gallery = patch.gallery;
  if (patch.related !== undefined) next.related = patch.related;
  DATA[slug] = next;
  return { ...site, DATA };
}

// counter and next are derived from the index order, never typed.
export function reindex(site) {
  const order = site.order.filter((s) => site.DATA[s]);
  const DATA = { ...site.DATA };
  const total = order.length;
  order.forEach((slug, i) => {
    DATA[slug] = {
      ...DATA[slug],
      counter: `${String(i + 1).padStart(2, '0')} / ${total}`,
      next: order[(i + 1) % total],
    };
  });
  const names = {};
  for (const slug of order) {
    const p = DATA[slug];
    names[slug] = { eyebrow: p.eyebrow, title: p.title, location: p.location, thumb: p.heroSrc };
  }
  return { ...site, DATA, order, names };
}

// Rewrite the least that will do: per-entry where the shape allows it, whole
// object only when an entry is new or has moved.
function narrow(source, container, before, after, indent) {
  const added = Object.keys(after).some((k) => !(k in before));
  const removed = Object.keys(before).some((k) => !(k in after));
  const reordered = Object.keys(before).join() !== Object.keys(after).join();
  if (!added && !removed && !reordered) {
    const out = writeEntries(source, container, before, after, indent);
    if (out !== null) return out;
  }
  return writeLiteral(source, container, after, indent - 1);
}

export function serialise(projectSrc, workSrc, site, previous) {
  const was = previous || readSite(projectSrc, workSrc);
  let project = narrow(projectSrc, 'static DATA =', was.DATA, site.DATA, 2);
  project = narrow(project, 'static EDITORIAL =', was.EDITORIAL, site.EDITORIAL, 2);
  project = narrow(project, 'static DIMS =', was.DIMS, site.DIMS, 2);
  let work = JSON.stringify(was.order) === JSON.stringify(site.order)
    ? workSrc : writeLiteral(workSrc, 'const order =', site.order, 2, '[');
  work = narrow(work, 'const names =', was.names, site.names, 3);
  return { project, work };
}

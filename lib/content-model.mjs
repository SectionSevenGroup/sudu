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

export const PROJECT_FILE = 'src/project.html';
export const WORK_FILE = 'src/work.html';
export const MEDIA_DIR = 'images/';

// The four pages whose authored copy Control edits, and the field order the
// editor shows them in. Each entry is [field, the label a person reads]. Only
// what is listed here is editable: nav labels, chrome, system text and the
// design constants are deliberately absent.
export const PAGES = {
  home: {
    file: 'src/index.html', title: 'Home',
    fields: [
      ['heroStatement', 'Hero statement', 'line'],
      ['heroIntro', 'Hero introduction', 'short'],
      ['offerArchitecture', 'Offering — Architecture', 'short'],
      ['offerInteriors', 'Offering — Interiors', 'short'],
      ['offerCommercial', 'Offering — Commercial', 'short'],
      ['offerAdvisory', 'Offering — Advisory', 'short'],
      ['experienceResidential', 'Experience — Residential & Private', 'short'],
      ['experienceHospitality', 'Experience — Hospitality, Retail & Experience', 'short'],
      ['experienceCommercial', 'Experience — Commercial & Community', 'short'],
      ['practiceStatement', 'Practice statement', 'line'],
      ['practiceBody', 'Practice description', 'long'],
    ],
  },
  work: {
    file: 'src/work.html', title: 'Work',
    fields: [['attribution', 'Attribution note', 'long']],
  },
  studio: {
    file: 'src/studio.html', title: 'Studio',
    fields: [
      ['heroLineOne', 'Hero, first line', 'line'],
      ['heroLineTwo', 'Hero, second line', 'line'],
      ['practiceIntro', 'Practice introduction', 'long'],
      ['mikeRole', 'Mike — role', 'line'],
      ['mikeBioOne', 'Mike — first paragraph', 'long'],
      ['mikeBioTwo', 'Mike — second paragraph', 'long'],
      ['jenniferRole', 'Jennifer — role', 'line'],
      ['jenniferBioOne', 'Jennifer — first paragraph', 'long'],
      ['jenniferBioTwo', 'Jennifer — second paragraph', 'long'],
      ['joeRole', 'Joe — role', 'line'],
      ['joeBioOne', 'Joe — first paragraph', 'long'],
      ['joeBioTwo', 'Joe — second paragraph', 'long'],
    ],
  },
  contact: {
    file: 'contact.html', title: 'Contact',
    fields: [
      ['openingLineOne', 'Opening, first line', 'line'],
      ['openingLineTwo', 'Opening, second line', 'line'],
      ['formNote', 'Note under the form', 'short'],
      ['mindMapNote', 'Interest map instruction', 'short'],
    ],
    faqs: true,
  },
};

export const pageFiles = () => Object.values(PAGES).map((p) => p.file);

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

// ------------------------------------------------------------- page copy

// `static COPY` in each page, read as data. The markup binds to these names
// and every editable node carries the matching data-i18n key, so an edit here
// changes the English without breaking the translation that key points at.
export function readPage(page, source) {
  const spec = PAGES[page];
  if (!spec) throw new Error('content-model: unknown page ' + page);
  return readLiteral(source, 'static COPY =');
}

export function writePage(page, source, copy, previous) {
  const spec = PAGES[page];
  if (!spec) throw new Error('content-model: unknown page ' + page);
  const was = previous || readLiteral(source, 'static COPY =');
  return narrow(source, 'static COPY =', was, copy, 2);
}

// Only the fields the editor offers, in the order it offers them. Anything
// else in a patch is not part of this page.
export function applyPage(page, copy, patch) {
  const spec = PAGES[page];
  const next = { ...copy };
  for (const [field] of spec.fields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) next[field] = String(patch[field]);
  }
  if (spec.faqs && Array.isArray(patch.faqs)) {
    next.faqs = patch.faqs.map((f) => ({ q: String(f.q || ''), a: String(f.a || '') }));
  }
  return next;
}

export function validatePage(page, copy) {
  const errors = [];
  for (const [field, label] of PAGES[page].fields) {
    if (!String(copy[field] || '').trim()) errors.push({ field, message: label + ' cannot be empty.' });
  }
  for (const [i, f] of (copy.faqs || []).entries()) {
    if (!String(f.q || '').trim()) errors.push({ field: `faq.${i}.q`, message: `Question ${i + 1} cannot be empty.` });
    if (!String(f.a || '').trim()) errors.push({ field: `faq.${i}.a`, message: `Answer ${i + 1} cannot be empty.` });
  }
  return errors;
}

// The stable identifier each field is translated by. It never contains the
// English, which is the whole point: editing the copy cannot orphan a
// translation.
export function copyKey(page, field, index) {
  return index === undefined ? `${page}.${field}` : `${page}.faq.${index}.${field}`;
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

// ------------------------------------------------------- project structure
//
// Each of these takes the site and returns a new site. None of them writes a
// counter, a next, or a work-index name: those are derived by reindex(), and
// typing them is how they drift.

const clone = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const put = (site, slug, project) => ({ ...site, DATA: { ...site.DATA, [slug]: project } });

// Moving one item of a list from one index to another, which is what every
// reorder in Control amounts to.
export function move(list, from, to) {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, item);
  return out;
}

// The hero, and the proportions the responsive markup needs for it. DIMS is
// keyed by image path, so a hero that is already used elsewhere keeps the
// dimensions it already had and nothing has to be measured twice.
export function setHero(site, slug, src, dims) {
  const path = safeMediaPath(src);
  if (!path) throw new Error('content-model: unsafe hero path');
  const next = put(site, slug, { ...site.DATA[slug], heroSrc: path });
  if (!dims || !dims.w || !dims.h) return next;
  return { ...next, DIMS: { ...next.DIMS, [path]: [Number(dims.w), Number(dims.h)] } };
}

export function setDims(site, src, dims) {
  const path = safeMediaPath(src);
  if (!path || !dims || !dims.w || !dims.h) return site;
  return { ...site, DIMS: { ...site.DIMS, [path]: [Number(dims.w), Number(dims.h)] } };
}

// Gallery work, in whichever shape the project already uses. A flat `gallery`
// project stays flat and a grouped project stays grouped: Control never
// converts one into the other behind the editor's back.
export function galleryAdd(site, slug, src, groupIndex) {
  const path = safeMediaPath(src);
  if (!path) throw new Error('content-model: unsafe image path');
  const p = { ...site.DATA[slug] };
  if (p.groups) {
    const g = typeof groupIndex === 'number' ? groupIndex : 0;
    if (!p.groups[g]) throw new Error('content-model: no such group');
    p.groups = p.groups.map((grp, i) => i === g ? { ...grp, images: (grp.images || []).concat([path]) } : grp);
  } else {
    p.gallery = (p.gallery || []).concat([path]);
  }
  return put(site, slug, p);
}

// Taking an image out shifts every image after it, and a reading order indexes
// into that same list. Refusing the removal because the sequence would dangle
// leaves the editor stuck on a project they cannot change, so the sequence is
// re-based instead: blocks that showed the removed image go, and the rest
// follow the images down.
export function galleryRemove(site, slug, index, groupIndex) {
  const p = { ...site.DATA[slug] };
  const before = projectMedia(p);
  let removedAt;
  if (p.groups) {
    const g = typeof groupIndex === 'number' ? groupIndex : 0;
    if (!p.groups[g]) throw new Error('content-model: no such group');
    const offset = p.groups.slice(0, g).reduce((n, grp) => n + (grp.images || []).length, 0);
    removedAt = offset + index;
    p.groups = p.groups.map((grp, i) =>
      i === g ? { ...grp, images: (grp.images || []).filter((_, j) => j !== index) } : grp);
  } else {
    removedAt = index;
    p.gallery = (p.gallery || []).filter((_, j) => j !== index);
  }
  let next = put(site, slug, p);
  if (next.EDITORIAL[slug] && removedAt < before.length) {
    const remap = new Map();
    let j = 0;
    before.forEach((_, i) => { if (i !== removedAt) remap.set(i, j++); });
    next = rebaseEditorial(next, slug, remap);
  }
  return next;
}

export function galleryMove(site, slug, from, to, groupIndex) {
  const p = { ...site.DATA[slug] };
  if (p.groups) {
    const g = typeof groupIndex === 'number' ? groupIndex : 0;
    if (!p.groups[g]) throw new Error('content-model: no such group');
    p.groups = p.groups.map((grp, i) => i === g ? { ...grp, images: move(grp.images || [], from, to) } : grp);
  } else {
    p.gallery = move(p.gallery || [], from, to);
  }
  return put(site, slug, p);
}

// Group headings and subheadings are ordinary copy, and they live in DATA
// because that is where the project's words live. EDITORIAL only ever refers
// to a group by index.
export function groupSet(site, slug, index, patch) {
  const p = { ...site.DATA[slug] };
  if (!p.groups || !p.groups[index]) throw new Error('content-model: no such group');
  p.groups = p.groups.map((g, i) => {
    if (i !== index) return g;
    const next = { ...g };
    if (patch.head !== undefined) next.head = String(patch.head);
    if (patch.sub !== undefined) next.sub = String(patch.sub);
    if (patch.small !== undefined) next.small = Boolean(patch.small);
    return next;
  });
  return put(site, slug, p);
}

export function groupAdd(site, slug, head) {
  const p = { ...site.DATA[slug] };
  if (!p.groups) throw new Error('content-model: this project does not use groups');
  p.groups = p.groups.concat([{ head: String(head || 'New group'), sub: '', images: [] }]);
  return put(site, slug, p);
}

// Removing a group removes its images from the gallery, so any EDITORIAL
// sequence that pointed past them would now be out of range. The sequence is
// re-based here rather than being left to fail validation.
export function groupRemove(site, slug, index) {
  const p = { ...site.DATA[slug] };
  if (!p.groups || !p.groups[index]) throw new Error('content-model: no such group');
  const before = projectMedia(p);
  const gone = new Set((p.groups[index].images || []));
  p.groups = p.groups.filter((_, i) => i !== index);
  const after = projectMedia(p);
  const remap = new Map();
  let j = 0;
  before.forEach((src, i) => { if (!gone.has(src) || after[j] === src) remap.set(i, j++); });
  let next = put(site, slug, p);
  if (next.EDITORIAL[slug]) next = rebaseEditorial(next, slug, remap, index);
  return next;
}

function rebaseEditorial(site, slug, remap, removedGroup) {
  const ed = site.EDITORIAL[slug];
  const seq = (ed.seq || [])
    .filter((b) => (b.i || []).every((i) => remap.has(i)))
    .filter((b) => typeof b.g !== 'number' || b.g !== removedGroup)
    .map((b) => {
      const out = { ...b, i: (b.i || []).map((i) => remap.get(i)) };
      if (typeof out.g === 'number' && removedGroup !== undefined && out.g > removedGroup) out.g -= 1;
      return out;
    });
  return { ...site, EDITORIAL: { ...site.EDITORIAL, [slug]: { ...ed, seq } } };
}

export function groupMove(site, slug, from, to) {
  const p = { ...site.DATA[slug] };
  if (!p.groups) throw new Error('content-model: this project does not use groups');
  p.groups = move(p.groups, from, to);
  return put(site, slug, p);
}

// Related projects carry their own display name and meta so the card can be
// drawn without loading the other project, but the key has to resolve.
export function relatedSet(site, slug, list) {
  const related = (list || [])
    .filter((r) => r && site.DATA[r.key] && r.key !== slug)
    .map((r) => ({
      name: String(r.name || site.DATA[r.key].title || ''),
      meta: String(r.meta || site.DATA[r.key].eyebrow || ''),
      key: r.key,
    }));
  return put(site, slug, { ...site.DATA[slug], related });
}

// EDITORIAL stores composition only: which image goes where, how wide, which
// side. Every word and every file path it displays is read from DATA.
const BLOCK_TYPES = new Set(['f', 'p', 's']);

export function editorialSet(site, slug, seq, rhythm) {
  const ed = site.EDITORIAL[slug];
  if (!ed) throw new Error('content-model: this project has no reading order');
  const cleaned = (seq || []).map((b) => {
    const out = { t: BLOCK_TYPES.has(b.t) ? b.t : 'f', i: (b.i || []).map((n) => Number(n)) };
    if (typeof b.g === 'number') out.g = b.g;
    if (b.t === 's') {
      out.w = Math.max(28, Math.min(92, Number(b.w) || 56));
      out.a = b.a === 'r' ? 'r' : 'l';
    }
    if (b.t === 'p' && b.r) out.r = String(b.r);
    return out;
  });
  return {
    ...site,
    EDITORIAL: {
      ...site.EDITORIAL,
      [slug]: { ...ed, seq: cleaned, ...(rhythm !== undefined ? { rhythm: String(rhythm) } : {}) },
    },
  };
}

export function setOrder(site, order) {
  const wanted = (order || []).filter((s) => site.DATA[s]);
  for (const slug of site.order) if (!wanted.includes(slug)) wanted.push(slug);
  return reindex({ ...site, order: wanted });
}

export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

// A new project is a DATA entry and a place in the order. Everything the Work
// index and the project page derive — counter, next, the index name row — is
// produced by reindex(), so a new project cannot arrive half-registered.
export function addProject(site, fields) {
  const slug = slugify(fields.slug || fields.title);
  if (!SLUG_RE.test(slug)) throw new Error('content-model: unusable slug');
  if (site.DATA[slug]) throw new Error('content-model: that slug is taken');
  const gallery = (fields.gallery || []).map(safeMediaPath).filter(Boolean);
  const hero = fields.heroSrc ? safeMediaPath(fields.heroSrc) : (gallery[0] || '');
  const project = {
    eyebrow: String(fields.eyebrow || ''),
    title: String(fields.title || ''),
    location: String(fields.location || ''),
    scope: String(fields.scope || ''),
    status: String(fields.status || ''),
    counter: '',
    lede: String(fields.lede || ''),
    body: String(fields.body || ''),
    heroSrc: hero || '',
    next: '',
    gallery,
    related: [],
  };
  const at = Number.isInteger(fields.position) ? fields.position : site.order.length;
  const order = site.order.slice();
  order.splice(Math.max(0, Math.min(order.length, at)), 0, slug);
  let next = reindex({ ...site, DATA: { ...site.DATA, [slug]: project }, order });
  if (fields.related) next = relatedSet(next, slug, fields.related);
  if (fields.rhythm) {
    next = {
      ...next,
      EDITORIAL: {
        ...next.EDITORIAL,
        [slug]: { rhythm: String(fields.rhythm), seq: gallery.map((_, i) => ({ t: 'f', i: [i] })) },
      },
    };
  }
  return { site: reindex(next), slug };
}

// Which projects a file is used by, so nothing is deleted out from under a page.
export function mediaUsage(site) {
  const used = new Map();
  const note = (src, slug) => {
    if (!src) return;
    if (!used.has(src)) used.set(src, []);
    if (!used.get(src).includes(slug)) used.get(src).push(slug);
  };
  for (const [slug, p] of Object.entries(site.DATA)) {
    note(p.heroSrc, slug);
    for (const src of projectMedia(p)) note(src, slug);
  }
  return used;
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

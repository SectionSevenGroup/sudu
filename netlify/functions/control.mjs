// The only privileged surface in SuDu Control.
//
// Everything the browser can do goes through one POST endpoint that checks the
// session cookie first. The GitHub token, the password and the signing secret
// are read from the environment here and never appear in a response, in the
// page, or in a log line.
//
// Failures follow the same rule. An exception is shown to the editor only
// where Control wrote the sentence and marked it with publicError(); anything
// else becomes one fixed line. See lib/public-error.mjs.
import * as session from '../../lib/session.mjs';
import * as model from '../../lib/content-model.mjs';
import { client } from '../../lib/github.mjs';
import { publicError, publicPartsOf, redactSecrets } from '../../lib/public-error.mjs';

const env = () => process.env;

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  },
});

// The upload arrives base64-encoded inside a JSON body the function buffers
// whole, so the ceiling is about what this architecture can hold, not about
// what an image might reasonably weigh.
const UPLOAD_LIMIT = 4 * 1024 * 1024;
const UPLOAD_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// What the browser calls a file is only a claim. These are the bytes each
// format actually begins with, and the claim has to match them.
const SIGNATURES = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,
  'image/png': (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])),
  'image/webp': (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

// The fields the project editor renders, in the order it renders them.
// Anything else in a patch is not part of this version of Control.
const EDITABLE = ['title', 'eyebrow', 'location', 'scope', 'status', 'lede', 'body'];

// A name Control chose, from a name a person typed. Never a path.
function mediaName(fileName, mime) {
  const ext = UPLOAD_TYPES[mime];
  if (!ext) throw publicError('Images must be JPEG, PNG or WebP.');
  const given = String(fileName || '');
  // Sanitising a hostile name into a safe one hides that it was hostile.
  // A filename with a path in it is refused and said so.
  if (/[\\/]/.test(given) || given.includes('..')) {
    throw publicError('Give the file a plain name, without any folders in it.');
  }
  const stem = given
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
  return `images/${stem}-${Date.now().toString(36)}.${ext}`;
}

// Read the site from one exact commit, and remember which one.
//
// Reading by branch name would mean the source could move between the read and
// the write, and the save would replay stale text over whatever arrived in
// between. Everything below is loaded from `parent`, and the save is offered
// back to GitHub against that same parent.
async function loadSite(gh) {
  const parent = await gh.resolveDraft();
  const [p, w] = await Promise.all([
    gh.getFile(model.PROJECT_FILE, parent),
    gh.getFile(model.WORK_FILE, parent),
  ]);
  return { parent, projectSrc: p.text, workSrc: w.text, site: model.readSite(p.text, w.text) };
}

// One page's authored copy, read from the same pinned commit as everything
// else so a page save is protected by the same expected-parent guard.
async function loadPage(gh, page) {
  const spec = model.PAGES[page];
  if (!spec) throw publicError('That page does not exist.', 404);
  const parent = await gh.resolveDraft();
  const f = await gh.getFile(spec.file, parent);
  return { parent, page, file: spec.file, src: f.text, copy: model.readPage(page, f.text) };
}

async function savePage(gh, before, copy, message) {
  const src = model.writePage(before.page, before.src, copy, before.copy);
  if (src === before.src) return { changed: false };
  const sha = await gh.commit([{ path: before.file, content: src }], message, before.parent);
  let review = 'ready';
  try {
    await gh.ensurePR();
  } catch (e) {
    console.error('control: page committed, review setup failed',
      e && e.status ? e.status : '', redactSecrets(e && e.message, env()));
    review = 'failed';
  }
  return { changed: true, files: [before.file], sha, review };
}

async function saveSite(gh, before, after, message) {
  const { project, work } = model.serialise(before.projectSrc, before.workSrc, after, before.site);
  const files = [];
  if (project !== before.projectSrc) files.push({ path: model.PROJECT_FILE, content: project });
  if (work !== before.workSrc) files.push({ path: model.WORK_FILE, content: work });
  if (!files.length) return { changed: false };
  // If the draft has moved since `before` was read, this refuses rather than
  // writing stale content forward.
  const sha = await gh.commit(files, message, before.parent);
  // Past this line the edit is on the branch. Opening the review pull request
  // is a separate step under a separate GitHub permission, and if it fails the
  // work is still saved — so it is reported, never turned into a failure that
  // tells the editor nothing happened. state() retries it on every read.
  let review = 'ready';
  try {
    await gh.ensurePR();
  } catch (e) {
    console.error('control: draft committed, review setup failed',
      e && e.status ? e.status : '', redactSecrets(e && e.message, env()));
    review = 'failed';
  }
  return { changed: true, files: files.map((f) => f.path), sha, review };
}

// Reading state back after a write is a convenience, not the write. If it
// fails, the editor still has to be told the truth about what was saved, so
// the missing state is reported as unknown rather than thrown.
async function stateAfterWrite(gh, written) {
  try {
    return await gh.state();
  } catch (e) {
    console.error('control: wrote the draft, could not read its state back',
      e && e.status ? e.status : '', redactSecrets(e && e.message, env()));
    return { unknown: true, review: written.review, hasChanges: true, canPublish: false };
  }
}

// Reading state back also retries the review, so it can heal what the write
// path could not. Its answer is the later one and therefore the true one.
async function settle(gh, written) {
  const state = await stateAfterWrite(gh, written);
  return { review: state.unknown ? written.review : state.review, state };
}

// Every project mutation runs the same way: read the site from one commit,
// transform it, validate, reindex, and offer it back against that commit. The
// transform is the only thing that differs, so none of them can accidentally
// skip validation or the stale-save guard.
async function editProject(gh, slug, message, transform) {
  const before = await loadSite(gh);
  if (!before.site.DATA[slug]) throw publicError('That project does not exist.', 404);
  let next = transform(before.site);
  const errors = model.validate(next, {
    slug,
    project: next.DATA[slug],
    editorial: next.EDITORIAL[slug],
  });
  if (errors.length) return { ok: false, errors };
  next = model.reindex(next);
  const result = await saveSite(gh, before, next, message);
  return { ok: true, ...result, ...(await settle(gh, result)) };
}

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

const actions = {
  async overview(gh) {
    const { site } = await loadSite(gh);
    return { state: await gh.state(), projects: model.listProjects(site).length };
  },

  async projects(gh) {
    const { site } = await loadSite(gh);
    return { projects: model.listProjects(site), state: await gh.state() };
  },

  async saveProject(gh, body) {
    const slug = String(body.slug || '');
    const before = await loadSite(gh);
    if (!before.site.DATA[slug]) throw publicError('That project does not exist.', 404);
    // The seven fields the editor actually shows, and nothing else. The
    // content model can write a hero, a gallery, groups and related projects
    // — it has to, for the features that come later — but none of those has
    // an editor in this version, so none of them is reachable from here.
    // EDITORIAL and the index order are read, displayed and validated, and
    // likewise not writable. What the server can change is what the interface
    // offers, and this is where the two are held together.
    const incoming = body.patch && typeof body.patch === 'object' ? body.patch : {};
    const patch = {};
    for (const key of EDITABLE) {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) patch[key] = incoming[key];
    }
    let next = model.applyProject(before.site, slug, patch);
    const errors = model.validate(next, {
      slug,
      project: next.DATA[slug],
      editorial: next.EDITORIAL[slug],
    });
    if (errors.length) return { ok: false, errors };
    next = model.reindex(next);
    const result = await saveSite(gh, before, next, `Update ${next.DATA[slug].title}`);
    return { ok: true, ...result, ...(await settle(gh, result)) };
  },

  // ---------------------------------------------------------------- pages

  async pages(gh) {
    const parent = await gh.resolveDraft();
    const out = [];
    for (const [page, spec] of Object.entries(model.PAGES)) {
      const f = await gh.getFile(spec.file, parent);
      const copy = model.readPage(page, f.text);
      out.push({
        page,
        title: spec.title,
        file: spec.file,
        fields: spec.fields.map(([field, label, size]) => ({
          field, label, size,
          key: model.copyKey(page, field),
          value: copy[field] || '',
        })),
        faqs: spec.faqs
          ? (copy.faqs || []).map((f2, i) => ({
              index: i, q: f2.q, a: f2.a,
              qKey: model.copyKey(page, 'question', i),
              aKey: model.copyKey(page, 'answer', i),
            }))
          : null,
      });
    }
    return { pages: out, state: await gh.state() };
  },

  async savePage(gh, body) {
    const page = String(body.page || '');
    const before = await loadPage(gh, page);
    const copy = model.applyPage(page, before.copy, body.patch && typeof body.patch === 'object' ? body.patch : {});
    const errors = model.validatePage(page, copy);
    if (errors.length) return { ok: false, errors };
    const result = await savePage(gh, before, copy, `Update the ${model.PAGES[page].title} page`);
    return { ok: true, ...result, ...(await settle(gh, result)) };
  },

  // ------------------------------------------------------------- projects

  hero: (gh, b) => editProject(gh, String(b.slug || ''), `Set the hero for ${b.slug}`,
    (site) => model.setHero(site, String(b.slug || ''), String(b.src || ''), b.dims)),

  addImage: (gh, b) => editProject(gh, String(b.slug || ''), `Add an image to ${b.slug}`,
    (site) => model.galleryAdd(site, String(b.slug || ''), String(b.src || ''),
      b.group === undefined ? undefined : num(b.group))),

  removeImage: (gh, b) => editProject(gh, String(b.slug || ''), `Remove an image from ${b.slug}`,
    (site) => model.galleryRemove(site, String(b.slug || ''), num(b.index),
      b.group === undefined ? undefined : num(b.group))),

  moveImage: (gh, b) => editProject(gh, String(b.slug || ''), `Reorder images in ${b.slug}`,
    (site) => model.galleryMove(site, String(b.slug || ''), num(b.from), num(b.to),
      b.group === undefined ? undefined : num(b.group))),

  saveGroup: (gh, b) => editProject(gh, String(b.slug || ''), `Update a group in ${b.slug}`,
    (site) => model.groupSet(site, String(b.slug || ''), num(b.index), b.patch || {})),

  addGroup: (gh, b) => editProject(gh, String(b.slug || ''), `Add a group to ${b.slug}`,
    (site) => model.groupAdd(site, String(b.slug || ''), b.head)),

  removeGroup: (gh, b) => editProject(gh, String(b.slug || ''), `Remove a group from ${b.slug}`,
    (site) => model.groupRemove(site, String(b.slug || ''), num(b.index))),

  moveGroup: (gh, b) => editProject(gh, String(b.slug || ''), `Reorder groups in ${b.slug}`,
    (site) => model.groupMove(site, String(b.slug || ''), num(b.from), num(b.to))),

  related: (gh, b) => editProject(gh, String(b.slug || ''), `Update related projects for ${b.slug}`,
    (site) => model.relatedSet(site, String(b.slug || ''), b.related || [])),

  editorial: (gh, b) => editProject(gh, String(b.slug || ''), `Update the reading order for ${b.slug}`,
    (site) => model.editorialSet(site, String(b.slug || ''), b.seq || [], b.rhythm)),

  async reorder(gh, body) {
    const before = await loadSite(gh);
    const next = model.setOrder(before.site, Array.isArray(body.order) ? body.order : []);
    const result = await saveSite(gh, before, next, 'Reorder the work index');
    return { ok: true, ...result, ...(await settle(gh, result)) };
  },

  async addProject(gh, body) {
    const before = await loadSite(gh);
    const fields = body.project && typeof body.project === 'object' ? body.project : {};
    const slug = model.slugify(fields.slug || fields.title);
    if (!slug) throw publicError('Give the project a title.', 400);
    if (before.site.DATA[slug]) throw publicError('A project with that address already exists.', 400);
    let made;
    try {
      made = model.addProject(before.site, fields);
    } catch (e) {
      throw publicError('That project could not be created. Check the title and the images.', 400);
    }
    const errors = model.validate(made.site, {
      slug: made.slug,
      project: made.site.DATA[made.slug],
    });
    if (errors.length) return { ok: false, errors };
    const result = await saveSite(gh, before, made.site, `Add ${made.site.DATA[made.slug].title}`);
    return { ok: true, slug: made.slug, ...result, ...(await settle(gh, result)) };
  },

  async media(gh) {
    const { site } = await loadSite(gh);
    const files = await gh.listMedia();
    const used = new Map();
    for (const [slug, p] of Object.entries(site.DATA)) {
      for (const src of [p.heroSrc, ...model.projectMedia(p)].filter(Boolean)) {
        if (!used.has(src)) used.set(src, []);
        used.get(src).push(slug);
      }
    }
    const known = new Set(files.map((f) => f.path));
    const heroes = new Set(Object.values(site.DATA).map((p) => p.heroSrc).filter(Boolean));
    return {
      files: files.map((f) => ({
        ...f,
        usedBy: used.get(f.path) || [],
        isHero: heroes.has(f.path),
        dims: site.DIMS[f.path] || null,
      })),
      missing: [...used.entries()].filter(([src]) => !known.has(src)).map(([src, slugs]) => ({ src, usedBy: slugs })),
      unused: files.filter((f) => !used.has(f.path)).map((f) => f.path),
      projects: model.listProjects(site).map((p) => ({ slug: p.slug, title: p.title })),
    };
  },

  // An image is only removed once nothing points at it, or once the editor has
  // said in as many words that they know what still does. Either way the
  // references are checked here, against the same commit the delete lands on.
  async removeMedia(gh, body) {
    const path = model.safeMediaPath(String(body.path || ''));
    if (!path) throw publicError('That is not an image this site owns.', 400);
    const before = await loadSite(gh);
    const usedBy = model.mediaUsage(before.site).get(path) || [];
    if (usedBy.length && !body.confirmed) {
      return { ok: false, blocked: true, usedBy, path };
    }
    if (usedBy.length) {
      throw publicError(
        path.replace('images/', '') + ' is still used by ' + usedBy.length +
        ' project' + (usedBy.length === 1 ? '' : 's') + '. Take it out of those projects first.',
        409);
    }
    const written = { changed: true, files: [path], review: 'ready' };
    written.sha = await gh.deleteFile(path, 'Remove ' + path.split('/').pop(), before.parent);
    try {
      await gh.ensurePR();
    } catch (e) {
      console.error('control: image removed, review setup failed',
        e && e.status ? e.status : '', redactSecrets(e && e.message, env()));
      written.review = 'failed';
    }
    return { ok: true, path, ...written, ...(await settle(gh, written)) };
  },

  // Reference only. Control shows what governs the site so it can be read,
  // and does not offer to change it: these are design decisions, not settings.
  design: () => ({
    design: {
      grounds: [
        { name: 'Off-white', value: '#F3F1EA', note: 'The default ground.' },
        { name: 'Charcoal', value: '#121110', note: 'Inverted, for night reading.' },
        { name: 'Burnt', value: '#C0431F', note: 'The studio colour.' },
      ],
      ink: { name: 'Ink', value: '#171613' },
      typeface: { name: 'Urbanist', weights: '400 \u00b7 500 \u00b7 600 \u00b7 700 \u00b7 800 \u00b7 900' },
      rail: { name: 'Rail', value: '1760px' },
      hairline: { name: 'Hairline', value: '0.5px' },
      themes: ['Off-white', 'Charcoal', 'Burnt'],
    },
  }),

  async upload(gh, body) {
    const file = body.file || {};
    if (!file.base64) throw publicError('No image was supplied.');
    const bytes = Buffer.from(String(file.base64), 'base64');
    if (!bytes.length) throw publicError('That image was empty.');
    if (bytes.length > UPLOAD_LIMIT) throw publicError('Images must be under 4 MB.');
    const looksRight = SIGNATURES[file.type];
    if (!looksRight) throw publicError('Images must be JPEG, PNG or WebP.');
    if (!looksRight(bytes)) throw publicError('The file contents do not match its image type.');
    const path = mediaName(file.name, file.type);
    // the name was built here, but check it against the same rule the rest of
    // Control uses before anything is written
    if (model.safeMediaPath(path) !== path) throw publicError('That filename cannot be used.');
    const parent = await gh.resolveDraft();
    const written = { changed: true, files: [path], review: 'ready' };
    written.sha = await gh.commit([{ path, content: bytes.toString('base64'), encoding: 'base64' }], `Add image ${path.split('/').pop()}`, parent);
    try {
      await gh.ensurePR();
    } catch (e) {
      console.error('control: image committed, review setup failed',
        e && e.status ? e.status : '', redactSecrets(e && e.message, env()));
      written.review = 'failed';
    }
    return { ok: true, path, ...written, ...(await settle(gh, written)) };
  },

  status: (gh) => gh.state().then((state) => ({ state })),
  reconcile: (gh) => gh.reconcile().then((state) => ({ ok: true, state })),
  publish: async (gh) => ({ ok: true, ...(await gh.publish()), state: await gh.state() }),
};

export default async function handler(request) {
  const env = process.env;

  if (request.method !== 'POST') return json(405, { error: 'Use POST.' }, { Allow: 'POST' });
  if (!session.configured(env)) {
    return json(503, { error: 'Control is installed but not connected. Set GITHUB_TOKEN, SUDU_CONTROL_PASSWORD and SUDU_CONTROL_SESSION_SECRET.' });
  }
  // A cross-origin form post cannot set this header, and SameSite=Strict means
  // it would not carry the cookie either. Two locks on the same door.
  if (request.headers.get('x-sudu-control') !== '1') return json(403, { error: 'Blocked.' });

  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'Malformed request.' }); }
  const action = String(body.action || '');

  if (action === 'signIn') {
    if (!session.secretEqual(body.password, env.SUDU_CONTROL_PASSWORD)) {
      return json(401, { error: 'That password is not right.' });
    }
    return json(200, { ok: true }, { 'Set-Cookie': session.grant(env) });
  }
  if (action === 'signOut') {
    return json(200, { ok: true }, { 'Set-Cookie': session.revoke() });
  }

  const token = session.readCookie(request.headers.get('cookie'));
  if (!session.verify(env, token)) {
    return json(401, { error: 'Your Control session has ended. Sign in again.' }, { 'Set-Cookie': session.revoke() });
  }
  if (action === 'session') return json(200, { ok: true });

  const run = actions[action];
  if (!run) return json(400, { error: 'Unknown action.' });

  try {
    return json(200, { ok: true, ...(await run(client(env), body)) });
  } catch (e) {
    // An exception is shown to the editor only where Control itself wrote the
    // sentence and marked it public. Everything unmarked — GitHub's API, a
    // failed fetch, the content-model parser, a bug in this file — becomes
    // one fixed line, whatever detail it happened to be carrying.
    const shown = publicPartsOf(e);
    // The detail goes to the function log instead, with the live secret
    // values, GitHub token shapes and Authorization headers struck out first.
    console.error('control:', action, e && e.name ? e.name : 'Error',
      e && e.code ? e.code : '', e && e.status ? e.status : '',
      shown ? '(public)' : redactSecrets(e && e.message, env));
    if (shown) return json(shown.status, { error: shown.message });
    return json(500, { error: 'That did not work. Nothing was changed.' });
  }
}

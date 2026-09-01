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

async function saveSite(gh, before, after, message) {
  const { project, work } = model.serialise(before.projectSrc, before.workSrc, after, before.site);
  const files = [];
  if (project !== before.projectSrc) files.push({ path: model.PROJECT_FILE, content: project });
  if (work !== before.workSrc) files.push({ path: model.WORK_FILE, content: work });
  if (!files.length) return { changed: false };
  // If the draft has moved since `before` was read, this refuses rather than
  // writing stale content forward.
  await gh.commit(files, message, before.parent);
  await gh.ensurePR();
  return { changed: true, files: files.map((f) => f.path) };
}

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
    return { ok: true, ...result, state: await gh.state() };
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
    return {
      files: files.map((f) => ({ ...f, usedBy: used.get(f.path) || [] })),
      missing: [...used.entries()].filter(([src]) => !known.has(src)).map(([src, slugs]) => ({ src, usedBy: slugs })),
    };
  },

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
    await gh.commit([{ path, content: bytes.toString('base64'), encoding: 'base64' }], `Add image ${path.split('/').pop()}`, parent);
    await gh.ensurePR();
    return { ok: true, path, state: await gh.state() };
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

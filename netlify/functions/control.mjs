// The only privileged surface in SuDu Control.
//
// Everything the browser can do goes through one POST endpoint that checks the
// session cookie first. The GitHub token, the password and the signing secret
// are read from the environment here and never appear in a response, in the
// page, or in a log line.
import * as session from '../../lib/session.mjs';
import * as model from '../../lib/content-model.mjs';
import { client } from '../../lib/github.mjs';

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

const UPLOAD_LIMIT = 8 * 1024 * 1024;
const UPLOAD_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// A name Control chose, from a name a person typed. Never a path.
function mediaName(fileName, mime) {
  const ext = UPLOAD_TYPES[mime];
  if (!ext) throw new Error('Images must be JPEG, PNG or WebP.');
  const given = String(fileName || '');
  // Sanitising a hostile name into a safe one hides that it was hostile.
  // A filename with a path in it is refused and said so.
  if (/[\\/]/.test(given) || given.includes('..')) {
    throw new Error('Give the file a plain name, without any folders in it.');
  }
  const stem = given
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
  return `images/${stem}-${Date.now().toString(36)}.${ext}`;
}

async function loadSite(gh) {
  const [p, w] = await Promise.all([gh.getFile(model.PROJECT_FILE), gh.getFile(model.WORK_FILE)]);
  return { projectSrc: p.text, workSrc: w.text, site: model.readSite(p.text, w.text) };
}

async function saveSite(gh, before, after, message) {
  const { project, work } = model.serialise(before.projectSrc, before.workSrc, after, before.site);
  const files = [];
  if (project !== before.projectSrc) files.push({ path: model.PROJECT_FILE, content: project });
  if (work !== before.workSrc) files.push({ path: model.WORK_FILE, content: work });
  if (!files.length) return { changed: false };
  await gh.commit(files, message);
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
    if (!before.site.DATA[slug]) throw new Error('That project does not exist.');
    let next = model.applyProject(before.site, slug, body.patch || {});
    if (body.editorial !== undefined && next.EDITORIAL[slug]) {
      next = { ...next, EDITORIAL: { ...next.EDITORIAL, [slug]: body.editorial } };
    }
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

  async reorder(gh, body) {
    const before = await loadSite(gh);
    const wanted = Array.isArray(body.order) ? body.order.filter((s) => before.site.DATA[s]) : [];
    for (const slug of before.site.order) if (!wanted.includes(slug)) wanted.push(slug);
    const next = model.reindex({ ...before.site, order: wanted });
    const result = await saveSite(gh, before, next, 'Reorder the work index');
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
    if (!file.base64) throw new Error('No image was supplied.');
    const bytes = Buffer.from(String(file.base64), 'base64');
    if (!bytes.length) throw new Error('That image was empty.');
    if (bytes.length > UPLOAD_LIMIT) throw new Error('Images must be under 8 MB.');
    const path = mediaName(file.name, file.type);
    // the name was built here, but check it against the same rule the rest of
    // Control uses before anything is written
    if (model.safeMediaPath(path) !== path) throw new Error('That filename cannot be used.');
    await gh.commit([{ path, content: bytes.toString('base64'), encoding: 'base64' }], `Add image ${path.split('/').pop()}`);
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
    // Never echo the exception's own detail: it can carry a URL with the token
    // in it. The message is ours; the detail goes to the function log.
    console.error('control:', action, e && e.code ? e.code : '', e && e.status ? e.status : '');
    const known = e && (e.code === 'draft-moved' || typeof e.message === 'string');
    return json(e && e.status === 404 ? 404 : 500, {
      error: known ? e.message : 'That did not work. Nothing was changed.',
    });
  }
}

import * as session from '../../lib/session.mjs';
import { client } from '../../lib/github.mjs';
import { publicError, publicPartsOf, redactSecrets } from '../../lib/public-error.mjs';

const FILE = 'content/experience.json';
const CATEGORY_IDS = ['residential', 'hospitality', 'commercial'];

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  },
});

function validateModel(model) {
  if (!model || !Array.isArray(model.categories) || model.categories.length !== 3) {
    throw publicError('The Experience Index structure is not valid.', 409);
  }
  const ids = model.categories.map((c) => c && c.id);
  if (JSON.stringify(ids) !== JSON.stringify(CATEGORY_IDS)) {
    throw publicError('The Experience Index categories do not match the site.', 409);
  }
  for (const category of model.categories) {
    if (!Array.isArray(category.entries)) throw publicError('An Experience Index category is not valid.', 409);
    if (category.entries.length > 120) throw publicError('That Experience Index category is too large.', 409);
    category.entries = category.entries.map(cleanEntry);
  }
  return model;
}

function cleanEntry(entry) {
  const name = String(entry?.name || '').trim().slice(0, 180);
  if (!name) throw publicError('Every Experience Index entry needs a name.', 400);
  const out = { name };
  const project = String(entry?.project || '').trim();
  if (project) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project)) throw publicError('That project link is not valid.', 400);
    out.project = project;
  }
  const preview = String(entry?.preview || '').trim().replace(/^\/+/, '');
  if (preview) {
    if (!/^images\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|jpeg|png|webp|svg)$/i.test(preview) || preview.includes('..')) {
      throw publicError('That preview image path is not valid.', 400);
    }
    out.preview = preview;
  }
  const info = String(entry?.info || '').trim().slice(0, 600);
  if (info) out.info = info;
  return out;
}

async function readModel(gh) {
  const parent = await gh.resolveDraft();
  const refs = [parent];
  const branch = String(process.env.BRANCH || '').trim();
  if (branch && !refs.includes(branch)) refs.push(branch);
  if (!refs.includes('main')) refs.push('main');
  let last;
  for (const ref of refs) {
    try {
      const f = await gh.getFile(FILE, ref);
      return { parent, model: validateModel(JSON.parse(f.text)) };
    } catch (e) {
      last = e;
      if (e && e.status && e.status !== 404) throw e;
    }
  }
  throw last || publicError('The Experience Index content file is missing.', 404);
}

// This is deliberately a single-file Contents API save rather than the
// repository-wide Git Data transaction used by the project editor. Experience
// Index edits only own one JSON file, so the narrower endpoint gives GitHub a
// concrete file SHA to protect against concurrent edits and avoids coupling a
// simple archive update to the multi-file project commit path.
async function saveModel(gh, before, model, message) {
  validateModel(model);
  const content = JSON.stringify(model, null, 2) + '\n';
  const head = await gh.ensureDraft();
  if (before.parent && head !== before.parent) {
    throw publicError('The Experience Index changed while you were editing. Reload it and try again.', 409);
  }

  let current;
  try {
    current = await gh.getFile(FILE, head);
  } catch (e) {
    console.error('control-experience: could not read file before save',
      e && e.status ? e.status : '', redactSecrets(e && e.message, process.env));
    throw publicError('The Experience Index could not be prepared for saving. Nothing was changed.', 500);
  }

  let written;
  try {
    const path = FILE.split('/').map(encodeURIComponent).join('/');
    written = await gh.call(`/repos/${gh.owner}/${gh.repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        sha: current.sha,
        branch: gh.draft,
      }),
    });
  } catch (e) {
    console.error('control-experience: GitHub refused content save',
      e && e.status ? e.status : '', redactSecrets(e && e.message, process.env));
    if (e && (e.status === 401 || e.status === 403)) {
      throw publicError('GitHub refused the Experience Index save. The Control token needs Contents: Read and write.', 409);
    }
    if (e && (e.status === 409 || e.status === 422)) {
      throw publicError('The Experience Index changed while you were editing. Reload it and try again.', 409);
    }
    throw publicError('The Experience Index could not be saved. Nothing was changed.', 500);
  }

  const sha = written?.commit?.sha || head;
  let review = 'ready';
  try { await gh.ensurePR(); }
  catch (e) {
    console.error('control-experience: content committed, review setup failed',
      e && e.status ? e.status : '', redactSecrets(e && e.message, process.env));
    review = 'failed';
  }
  let state;
  try { state = await gh.state(); }
  catch (e) {
    console.error('control-experience: saved, state read failed',
      e && e.status ? e.status : '', redactSecrets(e && e.message, process.env));
    state = { unknown: true, review, hasChanges: true, canPublish: false };
  }
  return { changed: true, sha, review: state.unknown ? review : state.review, state };
}

function category(model, id) {
  const cat = model.categories.find((c) => c.id === id);
  if (!cat) throw publicError('That Experience Index category does not exist.', 404);
  return cat;
}

const actions = {
  async get(gh) {
    const { model } = await readModel(gh);
    return { experience: model };
  },

  async add(gh, body) {
    const before = await readModel(gh);
    const cat = category(before.model, String(body.category || ''));
    cat.entries.push(cleanEntry(body.entry || {}));
    return { experience: before.model, ...(await saveModel(gh, before, before.model, 'Add Experience Index entry')) };
  },

  async update(gh, body) {
    const before = await readModel(gh);
    const cat = category(before.model, String(body.category || ''));
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0 || index >= cat.entries.length) throw publicError('That Experience Index entry does not exist.', 404);
    cat.entries[index] = cleanEntry(body.entry || {});
    return { experience: before.model, ...(await saveModel(gh, before, before.model, 'Update Experience Index entry')) };
  },

  async move(gh, body) {
    const before = await readModel(gh);
    const cat = category(before.model, String(body.category || ''));
    const from = Number(body.from); const to = Number(body.to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= cat.entries.length || to < 0 || to >= cat.entries.length) {
      throw publicError('That Experience Index move is not valid.', 400);
    }
    const [entry] = cat.entries.splice(from, 1);
    cat.entries.splice(to, 0, entry);
    return { experience: before.model, ...(await saveModel(gh, before, before.model, 'Reorder Experience Index')) };
  },

  async remove(gh, body) {
    const before = await readModel(gh);
    const cat = category(before.model, String(body.category || ''));
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0 || index >= cat.entries.length) throw publicError('That Experience Index entry does not exist.', 404);
    cat.entries.splice(index, 1);
    return { experience: before.model, ...(await saveModel(gh, before, before.model, 'Remove Experience Index entry')) };
  },
};

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!session.configured(process.env)) return json(503, { error: 'Control is installed but not connected.' });
  if (request.headers.get('x-sudu-control') !== '1') return json(403, { error: 'Blocked.' });

  const token = session.readCookie(request.headers.get('cookie'));
  if (!session.verify(process.env, token)) return json(401, { error: 'Your Control session has ended. Sign in again.' });

  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'Malformed request.' }); }
  const action = actions[String(body.action || '')];
  if (!action) return json(400, { error: 'Unknown action.' });

  try {
    return json(200, { ok: true, ...(await action(client(process.env), body)) });
  } catch (e) {
    const shown = publicPartsOf(e);
    console.error('control-experience:', body.action, e && e.name ? e.name : 'Error',
      e && e.status ? e.status : '', shown ? '(public)' : redactSecrets(e && e.message, process.env));
    if (shown) return json(shown.status, { error: shown.message });
    return json(500, { error: 'That did not work. Nothing was changed.' });
  }
}

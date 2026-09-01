// SuDu Control, browser side.
//
// This file holds no credentials and no session token: signing in sets an
// HttpOnly cookie the browser attaches on its own, and there is nothing here
// for a script on another page to read. Every request goes to the one function.

const ENDPOINT = '/.netlify/functions/control';
const $ = (sel, root = document) => root.querySelector(sel);

const state = { view: 'overview', projects: [], project: null, site: null, dirty: false };

async function call(action, body = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-SuDu-Control': '1' },
    body: JSON.stringify({ action, ...body }),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) { showGate(data.error || ''); throw new Error('signed out'); }
  if (!res.ok) throw new Error(data.error || 'Control could not reach the site.');
  return data;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2600);
}

function loadError(selector, label, error, retry) {
  const el = $(selector);
  if (!el) return;
  el.innerHTML = `<div class="load-error"><p><strong>${escape(label)} could not load.</strong></p><p class="hint">${escape(error && error.message ? error.message : 'Control could not reach the site.')}</p><button class="button" data-load-retry>Retry</button></div>`;
  const b = el.querySelector('[data-load-retry]');
  if (b) b.addEventListener('click', retry);
}

const escape = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------------ gate

function showGate(message) {
  $('#app').hidden = true;
  $('#gate').hidden = false;
  const err = $('#gateError');
  err.textContent = message || '';
  err.hidden = !message;
}

function showApp() {
  $('#gate').hidden = true;
  $('#app').hidden = false;
}

$('#signInForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#gateError');
  err.hidden = true;
  try {
    await call('signIn', { password: $('#password').value });
    $('#password').value = '';
    showApp();
    go('overview');
  } catch (e2) {
    err.textContent = e2.message;
    err.hidden = false;
  }
});

$('#signOut').addEventListener('click', async () => {
  if (!leaveGuard()) return;
  await call('signOut').catch(() => {});
  state.dirty = false;
  showGate('');
});

// ------------------------------------------------------------------ views

function leaveGuard() {
  if (!state.dirty) return true;
  return window.confirm('This draft has changes you have not saved. Leave anyway?');
}

window.addEventListener('beforeunload', (e) => {
  if (!state.dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

function go(view) {
  if (view !== state.view && !leaveGuard()) return;
  state.dirty = false;
  state.view = view;
  for (const tab of document.querySelectorAll('.tab')) {
    const on = tab.dataset.view === view;
    tab.setAttribute('aria-current', on ? 'page' : 'false');
  }
  for (const section of document.querySelectorAll('.view')) {
    section.hidden = section.id !== 'view-' + view;
  }
  if (view === 'overview') loadOverview();
  if (view === 'projects') { loadLibrary(); loadProjects(); }
  if (view === 'media') loadMedia();
  if (view === 'publish') loadPublish();
  if (view === 'pages') loadPages();
  if (view === 'design') loadDesign();
}

for (const tab of document.querySelectorAll('.tab, .link[data-view]')) {
  tab.addEventListener('click', () => go(tab.dataset.view));
}

// The draft has four honest states, and the interface never conflates them:
// nothing saved, saved but its review could not be opened, saved and building,
// saved and ready. A save that reached the branch is never described as a
// save that did not happen.
function draftStatus(s) {
  if (!s || s.unknown) return { key: 'unknown', label: 'Draft saved · state unknown' };
  if (!s.hasChanges) return { key: 'none', label: 'No draft' };
  if (s.review === 'failed') return { key: 'review', label: 'Draft saved · review needs attention' };
  const deploy = s.deploy && s.deploy.state;
  if (deploy === 'success') return { key: 'ready', label: 'Draft saved · preview ready' };
  if (deploy === 'failure' || deploy === 'error') return { key: 'failed', label: 'Draft saved · preview failed' };
  return { key: 'building', label: 'Draft saved · preview building' };
}

function footState(s) {
  const status = draftStatus(s);
  $('#footState').textContent = status.key === 'none'
    ? 'No draft'
    : (s.hasChanges && status.key !== 'unknown'
        ? `${status.label} · ${s.aheadBy} change${s.aheadBy === 1 ? '' : 's'}`
        : status.label);
}

// Shown wherever the draft is described, when its review could not be opened.
const reviewNotice = `
  <div class="notice">
    <p class="notice-title">Draft saved. The review pull request could not be opened yet.</p>
    <p class="hint">Your change is safe on the draft branch — nothing was lost, and nothing was
       written to the live site. Netlify builds the preview from that pull request, so publishing
       stays closed until it exists. This usually means the Control GitHub token is missing the
       <strong>Pull requests: read and write</strong> permission.</p>
    <div class="actions"><button class="button" data-retry-review>Retry review setup</button></div>
  </div>`;

function wireRetry(reload) {
  for (const b of document.querySelectorAll('[data-retry-review]')) {
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await call('status'); toast('Checked again'); reload(); }
      catch (e) { toast(e.message); b.disabled = false; }
    });
  }
}

// ------------------------------------------------------------------ overview

async function loadOverview() {
  $('#overviewDraft').innerHTML = '<p class="hint">Reading the site…</p>';
  let response;
  try { response = await call('overview'); }
  catch (e) { loadError('#overviewDraft', 'Overview', e, loadOverview); return; }
  const { state: s, projects } = response;
  footState(s);
  const status = draftStatus(s);
  $('#overviewFacts').innerHTML = [
    ['Projects', projects],
    ['Draft', s.hasChanges ? `${s.aheadBy} change${s.aheadBy === 1 ? '' : 's'}` : 'None'],
    ['Review', s.review === 'failed' ? 'Needs attention' : (s.review === 'ready' ? 'Open' : '—')],
    ['Preview', s.deploy ? s.deploy.state : '—'],
    ['Site changed since', s.behindBy > 0 ? `${s.behindBy} behind` : 'Up to date'],
  ].map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('');

  $('#overviewDraft').innerHTML = s.hasChanges
    ? `${status.key === 'review' ? reviewNotice : ''}
       <p>These files are waiting in the draft:</p>
       <ul class="hint">${s.files.map((f) => `<li>${escape(f)}</li>`).join('')}</ul>
       <div class="actions"><button class="button" data-goto="publish">Go to publish</button></div>`
    : '<p class="hint">Nothing is waiting. The live site and the draft are the same.</p>';
  wireGotos();
  wireRetry(loadOverview);
}

function wireGotos() {
  for (const b of document.querySelectorAll('[data-goto]')) {
    b.addEventListener('click', () => go(b.dataset.goto));
  }
}

// ------------------------------------------------------------------ projects

async function loadProjects() {
  $('#projectEditor').hidden = true;
  $('#projectList').innerHTML = '<p class="hint">Reading the site…</p>';
  let response;
  try { response = await call('projects'); }
  catch (e) { loadError('#projectList', 'Projects', e, loadProjects); return; }
  const { projects, state: s } = response;
  state.projects = projects;
  footState(s);
  $('#projectList').innerHTML = projects.map((p, i) => `
    <button class="row" data-slug="${escape(p.slug)}">
      <span class="row-name">${escape(p.title)}</span>
      <span class="row-meta">${escape(p.eyebrow)}</span>
      <span class="row-meta">${escape(p.location)}</span>
      <span class="row-go">&#8250;</span>
    </button>`).join('');
  for (const row of document.querySelectorAll('#projectList .row')) {
    row.addEventListener('click', () => openProject(row.dataset.slug));
  }
}

function openProject(slug) {
  const p = state.projects.find((x) => x.slug === slug);
  if (!p) return;
  state.project = p;
  state.dirty = false;
  $('#projectList').hidden = true;
  const editor = $('#projectEditor');
  editor.hidden = false;
  editor.innerHTML = `
    <button class="link" id="backToList">&#8249; All projects</button>
    <h2 class="view-title" style="margin-top:18px">${escape(p.title)}</h2>

    <div class="panel">
      <div class="grid-2">
        ${text('title', 'Title', p.title)}
        ${text('eyebrow', 'Category', p.eyebrow)}
        ${text('location', 'Location', p.location)}
        ${text('scope', 'Scope', p.scope)}
        ${text('status', 'Status', p.status)}
      </div>
    </div>

    <div class="panel">
      ${area('lede', 'Opening line', p.lede, 3)}
      ${area('body', 'Description', p.body, 8)}
    </div>

    ${heroPanel(p)}
    ${galleryPanel(p)}
    ${relatedPanel(p)}

    ${p.editorial ? sequencePanel(p) : ''}

    <p id="projectError" class="error" hidden></p>
    <div class="actions">
      <button class="button" id="saveProject">Save draft</button>
      <span class="hint" id="projectDirty"></span>
    </div>`;

  $('#backToList').addEventListener('click', () => {
    if (!leaveGuard()) return;
    state.dirty = false;
    $('#projectEditor').hidden = true;
    $('#projectList').hidden = false;
  });
  for (const input of editor.querySelectorAll('input, textarea')) {
    input.addEventListener('input', () => {
      state.dirty = true;
      $('#projectDirty').textContent = 'Unsaved';
      $('#projectDirty').className = 'hint dirty';
    });
  }
  $('#saveProject').addEventListener('click', saveProject);
  wireProjectPanels(p);
}

// Every structural edit is its own save, applied straight away, so the editor
// sees the real result rather than a local guess at it.
function wireProjectPanels(p) {
  const slug = p.slug;
  const editor = $('#projectEditor');
  const on = (sel, fn) => { for (const el of editor.querySelectorAll(sel)) el.addEventListener('click', fn); };
  const act = async (action, body, note) => {
    editor.querySelectorAll('button, select, input[type=file]').forEach((b) => { b.disabled = true; });
    try {
      const res = await call(action, { slug, ...body });
      if (res.errors && res.errors.length) {
        const err = $('#projectError');
        err.innerHTML = res.errors.map((e) => escape(e.message)).join('<br>');
        err.hidden = false;
        return;
      }
      footState(res.state);
      toast(res.review === 'failed' ? 'Saved — review setup failed' : (note || 'Saved to draft'));
      await refreshProject(slug);
    } catch (e) {
      toast(e.message);
      editor.querySelectorAll('button, select, input[type=file]').forEach((b) => { b.disabled = false; });
    }
  };
  editor.__act = act;

  // hero
  const pick = $('#heroPick');
  if (pick) pick.addEventListener('change', async () => {
    if (!pick.value) return;
    const dims = await measure('/' + pick.value).catch(() => null);
    act('hero', { src: pick.value, dims }, 'Hero set');
  });
  const heroUp = $('#heroUpload');
  if (heroUp) heroUp.addEventListener('change', async () => {
    const file = heroUp.files && heroUp.files[0];
    if (!file) return;
    const up = await uploadFile(file);
    if (!up) return;
    const dims = await measure('/' + up.path).catch(() => null);
    act('hero', { src: up.path, dims }, 'Hero set');
  });

  // gallery, flat or grouped
  const g = (el) => (el.dataset.group === undefined ? undefined : Number(el.dataset.group));
  on('[data-img-up]', (e) => act('moveImage', { from: Number(e.currentTarget.dataset.imgUp), to: Number(e.currentTarget.dataset.imgUp) - 1, group: g(e.currentTarget) }, 'Reordered'));
  on('[data-img-down]', (e) => act('moveImage', { from: Number(e.currentTarget.dataset.imgDown), to: Number(e.currentTarget.dataset.imgDown) + 1, group: g(e.currentTarget) }, 'Reordered'));
  on('[data-img-rm]', (e) => {
    if (!window.confirm('Take this image out of the project? The file stays in the library.')) return;
    act('removeImage', { index: Number(e.currentTarget.dataset.imgRm), group: g(e.currentTarget) }, 'Image removed');
  });
  for (const input of editor.querySelectorAll('[data-gallery-add], [data-group-add]')) {
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const up = await uploadFile(file);
      if (!up) return;
      const group = input.dataset.groupAdd === undefined ? undefined : Number(input.dataset.groupAdd);
      act('addImage', { src: up.path, group }, 'Image added');
    });
  }

  // groups
  on('[data-group-save]', (e) => {
    const i = Number(e.currentTarget.dataset.groupSave);
    act('saveGroup', { index: i, patch: {
      head: editor.querySelector(`[name="group-head-${i}"]`).value,
      sub: editor.querySelector(`[name="group-sub-${i}"]`).value,
    } }, 'Group updated');
  });
  on('[data-group-up]', (e) => act('moveGroup', { from: Number(e.currentTarget.dataset.groupUp), to: Number(e.currentTarget.dataset.groupUp) - 1 }, 'Groups reordered'));
  on('[data-group-down]', (e) => act('moveGroup', { from: Number(e.currentTarget.dataset.groupDown), to: Number(e.currentTarget.dataset.groupDown) + 1 }, 'Groups reordered'));
  on('[data-group-rm]', (e) => {
    const i = Number(e.currentTarget.dataset.groupRm);
    const n = (p.groups[i] || {}).images ? p.groups[i].images.length : 0;
    if (!window.confirm(`Remove this group and its ${n} image${n === 1 ? '' : 's'} from the project? The files stay in the library, and the reading order is adjusted to match.`)) return;
    act('removeGroup', { index: i }, 'Group removed');
  });
  const addG = $('#addGroup');
  if (addG) addG.addEventListener('click', () => act('addGroup', { head: 'New group' }, 'Group added'));

  // related
  const rel = () => p.related.map((r) => ({ ...r }));
  on('[data-rel-up]', (e) => { const i = Number(e.currentTarget.dataset.relUp); const l = rel(); l.splice(i - 1, 0, l.splice(i, 1)[0]); act('related', { related: l }, 'Reordered'); });
  on('[data-rel-down]', (e) => { const i = Number(e.currentTarget.dataset.relDown); const l = rel(); l.splice(i + 1, 0, l.splice(i, 1)[0]); act('related', { related: l }, 'Reordered'); });
  on('[data-rel-rm]', (e) => { const i = Number(e.currentTarget.dataset.relRm); const l = rel(); l.splice(i, 1); act('related', { related: l }, 'Removed'); });
  const relPick = $('#relatedPick');
  if (relPick) relPick.addEventListener('change', () => {
    if (!relPick.value) return;
    const other = state.projects.find((x) => x.slug === relPick.value);
    act('related', { related: rel().concat([{ key: other.slug, name: other.title, meta: other.eyebrow }]) }, 'Added');
  });

  // reading order
  const seqBtn = $('#saveSeq');
  if (seqBtn) {
    const seq = () => p.editorial.seq.map((b) => ({ ...b }));
    on('[data-seq-up]', (e) => { const i = Number(e.currentTarget.dataset.seqUp); const l = seq(); l.splice(i - 1, 0, l.splice(i, 1)[0]); act('editorial', { seq: l }, 'Reading order saved'); });
    on('[data-seq-down]', (e) => { const i = Number(e.currentTarget.dataset.seqDown); const l = seq(); if (i >= l.length - 1) return; l.splice(i + 1, 0, l.splice(i, 1)[0]); act('editorial', { seq: l }, 'Reading order saved'); });
    for (const sel of editor.querySelectorAll('[data-seq-type]')) {
      sel.addEventListener('change', () => {
        const i = Number(sel.dataset.seqType);
        editor.querySelector(`[data-seq-w="${i}"]`).disabled = sel.value !== 's';
        editor.querySelector(`[data-seq-a="${i}"]`).disabled = sel.value !== 's';
      });
    }
    seqBtn.addEventListener('click', () => {
      const l = seq().map((b, i) => {
        const t = editor.querySelector(`[data-seq-type="${i}"]`).value;
        const out = { ...b, t };
        if (t === 's') {
          out.w = Number(editor.querySelector(`[data-seq-w="${i}"]`).value);
          out.a = editor.querySelector(`[data-seq-a="${i}"]`).value;
          out.i = (b.i || []).slice(0, 1);
        } else if (t === 'p') {
          out.i = (b.i || []).slice(0, 2);
          if (out.i.length < 2) out.i = [b.i[0], b.i[0]];
        } else {
          delete out.w; delete out.a;
        }
        return out;
      });
      act('editorial', { seq: l }, 'Reading order saved');
    });
  }
}

// The proportions of an image, read in the browser from the file the site will
// actually serve, so DIMS records what the responsive markup needs.
function measure(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

async function uploadFile(file) {
  if (file.size > 4 * 1024 * 1024) { toast('That image is over 4 MB.'); return null; }
  const base64 = await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.readAsDataURL(file);
  });
  try {
    const res = await call('upload', { file: { name: file.name, type: file.type, base64 } });
    await loadLibrary();
    return res;
  } catch (e) { toast(e.message); return null; }
}

async function loadLibrary() {
  try { const m = await call('media'); state.library = m.files; } catch { state.library = state.library || []; }
}

async function refreshProject(slug) {
  const { projects, state: s } = await call('projects');
  state.projects = projects;
  footState(s);
  openProject(slug);
}

const text = (name, label, value) =>
  `<label class="field"><span class="field-label">${escape(label)}</span>
   <input type="text" name="${name}" value="${escape(value)}"></label>`;

const area = (name, label, value, rows) =>
  `<label class="field"><span class="field-label">${escape(label)}</span>
   <textarea name="${name}" rows="${rows}">${escape(value)}</textarea></label>`;

// --- hero, gallery, groups, related, sequence -------------------------------
//
// Every one of these edits is its own action, saved on its own, so a click
// that changes an image order never carries an unsaved title along with it.
// The composition lives in EDITORIAL; every word and every file path shown
// here is read from DATA, which stays the one source of both.

function heroPanel(p) {
  return `<div class="panel">
    <p class="section-label">Hero</p>
    <div class="hero-row">
      <figure class="hero-shot">
        ${p.heroSrc ? `<img src="/${escape(p.heroSrc)}" alt="" loading="lazy">` : '<span class="hero-empty">No hero yet</span>'}
        <figcaption>${escape((p.heroSrc || '').replace('images/', '') || '—')}</figcaption>
      </figure>
      <div class="hero-controls">
        <label class="field">
          <span class="field-label">Choose an image already in the library</span>
          <select id="heroPick">
            <option value="">…</option>
            ${(state.library || []).map((f) => `<option value="${escape(f.path)}"${f.path === p.heroSrc ? ' selected' : ''}>${escape(f.path.replace('images/', ''))}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Or upload a new one</span>
          <input id="heroUpload" type="file" accept="image/jpeg,image/png,image/webp">
        </label>
        <p class="hint">Proportions are read from the file and recorded, so the responsive
          markup keeps working. JPEG, PNG or WebP, up to 4 MB.</p>
      </div>
    </div>
  </div>`;
}

function thumb(src, i, label, controls) {
  return `<figure class="tile">
    <img src="/${escape(src)}" alt="" loading="lazy">
    <figcaption>
      <span class="tile-n">${label}</span>
      <span class="tile-name">${escape(src.replace('images/', ''))}</span>
    </figcaption>
    ${controls}
  </figure>`;
}

const moveBtns = (kind, i, count, extra = '') =>
  `<div class="tile-actions">
     <button class="mini" data-${kind}-up="${i}"${extra} ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">&#8249;</button>
     <button class="mini" data-${kind}-down="${i}"${extra} ${i === count - 1 ? 'disabled' : ''} aria-label="Move later">&#8250;</button>
     <button class="mini mini-x" data-${kind}-rm="${i}"${extra} aria-label="Remove">&times;</button>
   </div>`;

function galleryPanel(p) {
  if (p.shape === 'groups') {
    return `<div class="panel">
      <p class="section-label">Gallery &mdash; ${p.groups.length} group${p.groups.length === 1 ? '' : 's'}, ${p.media.length} images</p>
      ${p.groups.map((g, gi) => `
        <div class="group">
          <div class="group-head">
            ${text('group-head-' + gi, 'Group title', g.head)}
            ${text('group-sub-' + gi, 'Group subtitle', g.sub)}
            <div class="group-actions">
              <button class="mini" data-group-up="${gi}" ${gi === 0 ? 'disabled' : ''} aria-label="Move group up">&#8249;</button>
              <button class="mini" data-group-down="${gi}" ${gi === p.groups.length - 1 ? 'disabled' : ''} aria-label="Move group down">&#8250;</button>
              <button class="mini" data-group-save="${gi}">Save titles</button>
              <button class="mini mini-x" data-group-rm="${gi}">Remove group</button>
            </div>
          </div>
          <div class="tiles">
            ${g.images.map((src, i) => thumb(src, i, String(i + 1), moveBtns('img', i, g.images.length, ` data-group="${gi}"`))).join('')}
          </div>
          <div class="actions">
            <label class="mini-file"><span>Add an image</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" data-group-add="${gi}"></label>
          </div>
        </div>`).join('')}
      <div class="actions"><button class="link" id="addGroup">Add a group</button></div>
    </div>`;
  }
  return `<div class="panel">
    <p class="section-label">Gallery &mdash; ${p.media.length} image${p.media.length === 1 ? '' : 's'}</p>
    <div class="tiles">
      ${p.media.map((src, i) => thumb(src, i, String(i + 1), moveBtns('img', i, p.media.length))).join('')}
    </div>
    ${p.media.length ? '' : '<p class="hint">This project has no gallery yet.</p>'}
    <div class="actions">
      <label class="mini-file"><span>Add an image</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" data-gallery-add="1"></label>
    </div>
  </div>`;
}

function relatedPanel(p) {
  const others = state.projects.filter((x) => x.slug !== p.slug);
  return `<div class="panel">
    <p class="section-label">Related projects</p>
    <div class="related">
      ${p.related.map((r, i) => `
        <div class="related-row">
          <span class="related-name">${escape(r.name)}</span>
          <span class="related-meta">${escape(r.meta)}</span>
          <div class="tile-actions">
            <button class="mini" data-rel-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&#8249;</button>
            <button class="mini" data-rel-down="${i}" ${i === p.related.length - 1 ? 'disabled' : ''} aria-label="Move down">&#8250;</button>
            <button class="mini mini-x" data-rel-rm="${i}" aria-label="Remove">&times;</button>
          </div>
        </div>`).join('')}
      ${p.related.length ? '' : '<p class="hint">No related projects yet.</p>'}
    </div>
    <div class="actions">
      <select id="relatedPick">
        <option value="">Add a project…</option>
        ${others.filter((o) => !p.related.some((r) => r.key === o.slug))
          .map((o) => `<option value="${escape(o.slug)}">${escape(o.title)}</option>`).join('')}
      </select>
    </div>
  </div>`;
}

function sequencePanel(p) {
  const media = p.media;
  const rows = p.editorial.seq.map((b, bi) => {
    const kind = b.t === 'p' ? 'Pair' : (b.t === 's' ? `Inset ${b.w || 56}%` : 'Full width');
    const imgs = b.i.map((i) => `<img src="/${escape(media[i])}" alt="" loading="lazy">`).join('');
    const note = [
      b.al ? (b.al === 'r' ? 'right' : 'left') : '',
      b.sp ? b.sp : '',
      typeof b.g === 'number' && p.groups[b.g] ? p.groups[b.g].head : '',
    ].filter(Boolean).join(' · ');
    return `<div class="seq-block" data-seq="${bi}">
      <span class="seq-kind">${kind}</span>
      <span class="seq-imgs">${imgs}</span>
      <span class="seq-note">${escape(note)}</span>
      <span class="seq-controls">
        <select data-seq-type="${bi}">
          <option value="f"${b.t === 'f' ? ' selected' : ''}>Full width</option>
          <option value="p"${b.t === 'p' ? ' selected' : ''}>Pair</option>
          <option value="s"${b.t === 's' ? ' selected' : ''}>Inset</option>
        </select>
        <input type="number" min="28" max="92" step="2" value="${b.w || 56}" data-seq-w="${bi}"
               title="Inset width" ${b.t === 's' ? '' : 'disabled'}>
        <select data-seq-a="${bi}" title="Inset side" ${b.t === 's' ? '' : 'disabled'}>
          <option value="l"${b.a !== 'r' ? ' selected' : ''}>Left</option>
          <option value="r"${b.a === 'r' ? ' selected' : ''}>Right</option>
        </select>
        <button class="mini" data-seq-up="${bi}" ${bi === 0 ? 'disabled' : ''} aria-label="Move earlier">&#8249;</button>
        <button class="mini" data-seq-down="${bi}" aria-label="Move later">&#8250;</button>
      </span></div>`;
  }).join('');
  return `<div class="panel">
    <p class="section-label">Reading order &mdash; ${escape(p.editorial.rhythm)}</p>
    <div class="seq">${rows}</div>
    <p class="hint">Composition only. Every heading, credit and file path is read from the project
      itself, so nothing here can duplicate or contradict it.</p>
    <div class="actions"><button class="mini" id="saveSeq">Save reading order</button></div>
  </div>`;
}

async function saveProject() {
  const editor = $('#projectEditor');
  const patch = {};
  for (const input of editor.querySelectorAll('input[name], textarea[name]')) {
    patch[input.name] = input.value;
  }
  const err = $('#projectError');
  err.hidden = true;
  $('#saveProject').disabled = true;
  try {
    const res = await call('saveProject', { slug: state.project.slug, patch });
    if (res.errors && res.errors.length) {
      err.innerHTML = res.errors.map((e) => escape(e.message)).join('<br>');
      err.hidden = false;
      return;
    }
    state.dirty = false;
    footState(res.state);
    if (!res.changed) {
      $('#projectDirty').textContent = 'Nothing changed';
      $('#projectDirty').className = 'hint';
      toast('Nothing changed');
      return;
    }
    // The commit landed. Say so first, then say what did or did not follow it.
    if (res.review === 'failed') {
      $('#projectDirty').textContent = 'Draft saved · review needs attention';
      $('#projectDirty').className = 'hint dirty';
      err.innerHTML = reviewNotice;
      err.hidden = false;
      wireRetry(() => { err.hidden = true; });
      toast('Draft saved — review setup failed');
      return;
    }
    $('#projectDirty').textContent = draftStatus(res.state).label;
    $('#projectDirty').className = 'hint';
    toast('Saved to draft');
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    $('#saveProject').disabled = false;
  }
}

// ------------------------------------------------------------------ media

async function loadMedia() {
  $('#mediaGrid').innerHTML = '<p class="hint">Reading the images…</p>';
  let response;
  try { response = await call('media'); }
  catch (e) { loadError('#mediaGrid', 'Media', e, loadMedia); return; }
  const { files, missing, unused, projects } = response;
  state.library = files;
  const title = (slug) => (projects.find((p) => p.slug === slug) || {}).title || slug;
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');

  $('#mediaMissing').innerHTML = `
    <dl class="facts">
      <div><dt>Images</dt><dd>${files.length}</dd></div>
      <div><dt>Unused</dt><dd>${unused.length}</dd></div>
      <div><dt>Broken references</dt><dd>${missing.length}</dd></div>
    </dl>
    ${missing.length ? `<div class="panel">
       <p class="section-label">Broken references</p>
       <p class="hint">A project points at these, but the file is not in the repository:</p>
       <ul class="hint">${missing.map((m) => `<li><strong>${escape(m.src)}</strong> &mdash; ${escape(m.usedBy.map(title).join(', '))}</li>`).join('')}</ul></div>` : ''}`;

  $('#mediaGrid').innerHTML = files.map((f) => `
    <figure class="tile tile-lib">
      <img src="/${escape(f.path)}" alt="" loading="lazy">
      <figcaption>
        <span class="tile-name">${escape(f.name)}</span>
        <span class="tile-meta">${f.dims ? f.dims[0] + '&times;' + f.dims[1] : '&mdash;'} &nbsp;·&nbsp; ${kb(f.size)}</span>
        <span class="tile-use">${f.usedBy.length
          ? (f.isHero ? 'Hero &nbsp;·&nbsp; ' : '') + escape(f.usedBy.map(title).join(', '))
          : '<em>unused</em>'}</span>
      </figcaption>
      <div class="tile-actions">
        <button class="mini mini-x" data-media-rm="${escape(f.path)}"
          data-used="${f.usedBy.length}" aria-label="Remove">&times;</button>
      </div>
    </figure>`).join('');

  for (const b of document.querySelectorAll('[data-media-rm]')) {
    b.addEventListener('click', async () => {
      const path = b.dataset.mediaRm;
      const used = Number(b.dataset.used);
      // A referenced file is never deleted on a single click: the projects
      // that would break are named first, and the answer has to be yes twice.
      if (used && !window.confirm(
        `${path.replace('images/', '')} is used by ${used} project${used === 1 ? '' : 's'}.\n\n` +
        'Deleting it will leave those pages pointing at a file that is not there. ' +
        'Take it out of the projects first.\n\nOpen the removal warning anyway?')) return;
      if (!used && !window.confirm(`Delete ${path.replace('images/', '')} from the draft?`)) return;
      b.disabled = true;
      try {
        const res = await call('removeMedia', { path });
        if (res.blocked) {
          toast(`Still used by ${res.usedBy.map(title).join(', ')} — take it out of those projects first.`);
          b.disabled = false;
          return;
        }
        footState(res.state);
        toast(res.review === 'failed' ? 'Removed — review setup failed' : 'Removed from the draft');
        loadMedia();
      } catch (e) { toast(e.message); b.disabled = false; }
    });
  }
}

$('#mediaFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const msg = $('#mediaMessage');
  msg.textContent = 'Uploading…';
  try {
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('That file could not be read.'));
      r.readAsDataURL(file);
    });
    const res = await call('upload', { file: { name: file.name, type: file.type, base64 } });
    msg.textContent = 'Added ' + res.path;
    footState(res.state);
    loadMedia();
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    e.target.value = '';
  }
});

// ------------------------------------------------------------------ publish

async function loadPublish() {
  $('#publishPanel').innerHTML = '<p class="hint">Checking the draft…</p>';
  let response;
  try { response = await call('status'); }
  catch (e) { loadError('#publishPanel', 'Publish status', e, loadPublish); return; }
  const { state: s } = response;
  footState(s);
  if (!s.hasChanges) {
    $('#publishPanel').innerHTML = '<p>There is nothing waiting to publish.</p>';
    return;
  }
  const deploy = s.deploy || { state: 'pending', description: '' };
  const ready = deploy.state === 'success';
  const stale = s.behindBy > 0;
  const status = draftStatus(s);
  $('#publishPanel').innerHTML = `
    ${status.key === 'review' ? reviewNotice : ''}
    <p class="field-label">Draft</p>
    <p>${s.aheadBy} change${s.aheadBy === 1 ? '' : 's'} across ${s.files.length} file${s.files.length === 1 ? '' : 's'}.</p>
    <ul class="hint">${s.files.map((f) => `<li>${escape(f)}</li>`).join('')}</ul>
    ${stale ? `<p class="error">The site changed after this draft was started, so publishing would undo that work. Bring the draft up to date first.</p>
               <div class="actions"><button class="button" id="reconcile">Bring the draft up to date</button></div>` : ''}
    <p class="hint">Preview: ${escape(status.key === 'review'
      ? 'waiting on the review pull request'
      : (deploy.description || deploy.state))}</p>
    <div class="actions">
      ${ready && deploy.url ? `<a class="button" href="${escape(deploy.url)}" target="_blank" rel="noopener">Open preview</a>` : ''}
      <button class="button button-go" id="publish" ${s.canPublish ? '' : 'disabled'}>Publish</button>
      ${!ready ? '<span class="hint">Publishing stays closed until the preview builds.</span>' : ''}
    </div>`;
  wireRetry(loadPublish);
  const rec = $('#reconcile');
  if (rec) rec.addEventListener('click', async () => {
    rec.disabled = true;
    try { await call('reconcile'); toast('Draft updated'); loadPublish(); }
    catch (e) { toast(e.message); rec.disabled = false; }
  });
  const pub = $('#publish');
  if (pub) pub.addEventListener('click', async () => {
    if (!window.confirm('Publish these changes to the live site?')) return;
    pub.disabled = true;
    try { await call('publish'); toast('Published'); loadPublish(); }
    catch (e) { toast(e.message); pub.disabled = false; }
  });
}

// ------------------------------------------------------------------ start

$('#startAddProject').addEventListener('click', startAddProject);
$('#reorderProjects').addEventListener('click', startReorder);

(async () => {
  try { await call('session'); showApp(); go('overview'); }
  catch { showGate(''); }
})();

// ------------------------------------------------------------------ pages
//
// The authored copy of Home, Work, Studio and Contact. Each field is bound to
// a stable identifier, so editing the English here cannot orphan the French,
// Spanish, German or Japanese: those stay under the same key and are marked
// for review instead of being silently dropped.

const pagesState = { pages: [], current: 'home' };

async function loadPages() {
  $('#pageEditor').innerHTML = '<p class="hint">Reading the pages…</p>';
  let response;
  try { response = await call('pages'); }
  catch (e) { loadError('#pageEditor', 'Pages', e, loadPages); return; }
  const { pages, state: s } = response;
  pagesState.pages = pages;
  footState(s);
  $('#pageList').innerHTML = pages.map((p) => `
    <button class="side-item${p.page === pagesState.current ? ' is-on' : ''}" data-page="${escape(p.page)}">
      <span class="side-name">${escape(p.title)}</span>
      <span class="side-meta">${p.fields.length + (p.faqs ? p.faqs.length * 2 : 0)} fields</span>
    </button>`).join('');
  for (const b of document.querySelectorAll('#pageList .side-item')) {
    b.addEventListener('click', () => {
      if (!leaveGuard()) return;
      pagesState.current = b.dataset.page;
      state.dirty = false;
      renderPage();
    });
  }
  renderPage();
}

function renderPage() {
  const p = pagesState.pages.find((x) => x.page === pagesState.current) || pagesState.pages[0];
  if (!p) return;
  pagesState.current = p.page;
  for (const b of document.querySelectorAll('#pageList .side-item')) {
    b.classList.toggle('is-on', b.dataset.page === p.page);
  }
  const live = p.page === 'home' ? '/' : '/' + p.page;
  $('#pageEditor').innerHTML = `
    <div class="editor-head">
      <h2 class="editor-title">${escape(p.title)}</h2>
      <a class="link" href="${escape(live)}" target="_blank" rel="noopener">Open page &#8599;</a>
    </div>
    <div class="panel">
      ${p.fields.map((f) => copyField(f)).join('')}
    </div>
    ${p.faqs ? `
      <p class="section-label">Common questions</p>
      <div class="panel">
        ${p.faqs.map((f) => `
          ${area('faq-q-' + f.index, 'Question ' + (f.index + 1), f.q, 2)}
          ${area('faq-a-' + f.index, 'Answer ' + (f.index + 1), f.a, 4)}
          <p class="key-line">${escape(f.qKey)} &nbsp;·&nbsp; ${escape(f.aKey)}</p>`).join('')}
      </div>` : ''}
    <p id="pageError" class="error" hidden></p>
    <div class="actions">
      <button class="button" id="savePage">Save draft</button>
      <span class="hint" id="pageDirty"></span>
    </div>`;
  for (const input of $('#pageEditor').querySelectorAll('input, textarea')) {
    input.addEventListener('input', () => {
      state.dirty = true;
      $('#pageDirty').textContent = 'Unsaved';
      $('#pageDirty').className = 'hint dirty';
    });
  }
  $('#savePage').addEventListener('click', savePage);
}

function copyField(f) {
  const box = f.size === 'line' ? text(f.field, f.label, f.value)
            : area(f.field, f.label, f.value, f.size === 'long' ? 6 : 3);
  return box + `<p class="key-line">${escape(f.key)}${translationNote(f)}</p>`;
}

// Translations are never removed when the English changes. They stay under the
// key and are shown as needing review, which is a thing a person decides.
function translationNote() {
  return ' &nbsp;·&nbsp; FR ES DE JA follow this key';
}

async function savePage() {
  const editor = $('#pageEditor');
  const p = pagesState.pages.find((x) => x.page === pagesState.current);
  const patch = {};
  for (const input of editor.querySelectorAll('input[name], textarea[name]')) {
    if (!input.name.startsWith('faq-')) patch[input.name] = input.value;
  }
  if (p.faqs) {
    patch.faqs = p.faqs.map((f) => ({
      q: editor.querySelector(`[name="faq-q-${f.index}"]`).value,
      a: editor.querySelector(`[name="faq-a-${f.index}"]`).value,
    }));
  }
  const err = $('#pageError');
  err.hidden = true;
  $('#savePage').disabled = true;
  try {
    const res = await call('savePage', { page: p.page, patch });
    if (res.errors && res.errors.length) {
      err.innerHTML = res.errors.map((e) => escape(e.message)).join('<br>');
      err.hidden = false;
      return;
    }
    state.dirty = false;
    footState(res.state);
    reportSave(res, $('#pageDirty'), err);
    await loadPages();
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    const b = $('#savePage');
    if (b) b.disabled = false;
  }
}

// One place that turns a write response into what the editor is told, so
// every save in Control reports partial success the same way.
function reportSave(res, dirtyEl, errEl) {
  if (!res.changed) {
    dirtyEl.textContent = 'Nothing changed';
    dirtyEl.className = 'hint';
    toast('Nothing changed');
    return;
  }
  if (res.review === 'failed') {
    dirtyEl.textContent = 'Draft saved · review needs attention';
    dirtyEl.className = 'hint dirty';
    if (errEl) { errEl.innerHTML = reviewNotice; errEl.hidden = false; wireRetry(() => { errEl.hidden = true; }); }
    toast('Draft saved — review setup failed');
    return;
  }
  dirtyEl.textContent = draftStatus(res.state).label;
  dirtyEl.className = 'hint';
  toast('Saved to draft');
}

// ------------------------------------------------------------------ design

async function loadDesign() {
  const { design: d } = await call('design');
  const swatch = (g) => `
    <div class="swatch">
      <span class="swatch-chip" style="background:${escape(g.value)}"></span>
      <span class="swatch-name">${escape(g.name)}</span>
      <span class="swatch-value">${escape(g.value)}</span>
      <span class="swatch-note">${escape(g.note || '')}</span>
    </div>`;
  $('#designPanel').innerHTML = `
    <p class="section-label">Grounds</p>
    <div class="panel">${d.grounds.map(swatch).join('')}${swatch({ ...d.ink, note: 'Type, on every ground.' })}</div>
    <p class="section-label">Type and measure</p>
    <div class="panel">
      <dl class="facts">
        <div><dt>Typeface</dt><dd>${escape(d.typeface.name)}</dd></div>
        <div><dt>Weights</dt><dd>${escape(d.typeface.weights)}</dd></div>
        <div><dt>Rail</dt><dd>${escape(d.rail.value)}</dd></div>
        <div><dt>Hairline</dt><dd>${escape(d.hairline.value)}</dd></div>
        <div><dt>Themes</dt><dd>${d.themes.map(escape).join(' · ')}</dd></div>
      </dl>
    </div>`;
}

// ------------------------------------------------------- add and reorder

function startAddProject() {
  if (!leaveGuard()) return;
  state.dirty = false;
  $('#projectList').hidden = true;
  $('#projectEditor').hidden = true;
  const box = $('#addProject');
  box.hidden = false;
  box.innerHTML = `
    <button class="link" id="cancelAdd">&#8249; All projects</button>
    <h2 class="editor-title" style="margin-top:18px">New project</h2>
    <div class="panel">
      <div class="grid-2">
        ${text('title', 'Title', '')}
        ${text('slug', 'Address (leave blank to derive from the title)', '')}
        ${text('eyebrow', 'Category', '')}
        ${text('location', 'Location', '')}
        ${text('scope', 'Scope', '')}
        ${text('status', 'Status', '')}
      </div>
      <p class="key-line" id="slugPreview">/work/…/</p>
    </div>
    <div class="panel">
      ${area('lede', 'Opening line', '', 3)}
      ${area('body', 'Description', '', 8)}
    </div>
    <div class="panel">
      <p class="section-label">Hero and gallery</p>
      <label class="field">
        <span class="field-label">Hero</span>
        <select id="newHero"><option value="">…</option>
          ${(state.library || []).map((f) => `<option value="${escape(f.path)}">${escape(f.path.replace('images/', ''))}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Gallery — choose any number</span>
        <select id="newGallery" multiple size="8">
          ${(state.library || []).map((f) => `<option value="${escape(f.path)}">${escape(f.path.replace('images/', ''))}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Or upload an image to use</span>
        <input id="newUpload" type="file" accept="image/jpeg,image/png,image/webp">
      </label>
    </div>
    <div class="panel">
      <p class="section-label">Reading order</p>
      <label class="field">
        <span class="field-label">Editorial rhythm — leave blank for the ordinary gallery page</span>
        <select id="newRhythm">
          <option value="">None</option>
          <option value="Monograph">Monograph</option>
          <option value="Linear">Linear</option>
          <option value="Compact">Compact</option>
        </select>
      </label>
      <p class="hint">A rhythm starts every image full width. Reorder and inset them in the
        project's own reading order once it exists.</p>
    </div>
    <p id="addError" class="error" hidden></p>
    <div class="actions">
      <button class="button button-go" id="createProject">Create project</button>
      <span class="hint" id="addDirty"></span>
    </div>`;

  const title = box.querySelector('[name="title"]');
  const slug = box.querySelector('[name="slug"]');
  const preview = () => {
    const v = (slug.value || title.value || '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    $('#slugPreview').textContent = v ? `/work/${v}/` : '/work/…/';
  };
  title.addEventListener('input', preview);
  slug.addEventListener('input', preview);
  for (const input of box.querySelectorAll('input, textarea')) {
    input.addEventListener('input', () => { state.dirty = true; $('#addDirty').textContent = 'Unsaved'; $('#addDirty').className = 'hint dirty'; });
  }
  $('#cancelAdd').addEventListener('click', () => {
    if (!leaveGuard()) return;
    state.dirty = false;
    box.hidden = true;
    $('#projectList').hidden = false;
  });
  $('#newUpload').addEventListener('change', async () => {
    const file = $('#newUpload').files && $('#newUpload').files[0];
    if (!file) return;
    const up = await uploadFile(file);
    if (!up) return;
    for (const sel of ['#newHero', '#newGallery']) {
      const o = document.createElement('option');
      o.value = up.path; o.textContent = up.path.replace('images/', '');
      $(sel).appendChild(o);
    }
    $('#newHero').value = up.path;
    toast('Uploaded to the draft');
  });
  $('#createProject').addEventListener('click', createProject);
}

async function createProject() {
  const box = $('#addProject');
  const val = (n) => box.querySelector(`[name="${n}"]`).value;
  const project = {
    title: val('title'), slug: val('slug'), eyebrow: val('eyebrow'),
    location: val('location'), scope: val('scope'), status: val('status'),
    lede: val('lede'), body: val('body'),
    heroSrc: $('#newHero').value,
    gallery: [...$('#newGallery').selectedOptions].map((o) => o.value),
    rhythm: $('#newRhythm').value || undefined,
  };
  const err = $('#addError');
  err.hidden = true;
  $('#createProject').disabled = true;
  try {
    const res = await call('addProject', { project });
    if (res.errors && res.errors.length) {
      err.innerHTML = res.errors.map((e) => escape(e.message)).join('<br>');
      err.hidden = false;
      return;
    }
    state.dirty = false;
    footState(res.state);
    toast(res.review === 'failed' ? 'Created — review setup failed' : 'Project created');
    box.hidden = true;
    $('#projectList').hidden = false;
    await loadProjects();
    openProject(res.slug);
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  } finally {
    const b = $('#createProject');
    if (b) b.disabled = false;
  }
}

// Reordering the catalogue. Counters and the next-project chain are derived
// from this order on the server, so they are never typed here or anywhere.
function startReorder() {
  const list = $('#projectList');
  const order = state.projects.map((p) => p.slug);
  const draw = () => {
    list.innerHTML = `
      <p class="hint lead">Move a project and the Work index, its number and the next-project
        link all follow. Save when the order reads right.</p>
      ${order.map((slug, i) => {
        const p = state.projects.find((x) => x.slug === slug);
        return `<div class="row row-static">
          <span class="row-n">${String(i + 1).padStart(2, '0')}</span>
          <span class="row-name">${escape(p.title)}</span>
          <span class="row-meta">${escape(p.eyebrow)}</span>
          <span class="tile-actions">
            <button class="mini" data-ord-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">&#8249;</button>
            <button class="mini" data-ord-down="${i}" ${i === order.length - 1 ? 'disabled' : ''} aria-label="Move down">&#8250;</button>
          </span></div>`;
      }).join('')}
      <div class="actions">
        <button class="button button-go" id="saveOrder">Save order</button>
        <button class="link" id="cancelOrder">Cancel</button>
      </div>`;
    for (const b of list.querySelectorAll('[data-ord-up]')) b.addEventListener('click', () => {
      const i = Number(b.dataset.ordUp); order.splice(i - 1, 0, order.splice(i, 1)[0]); draw();
    });
    for (const b of list.querySelectorAll('[data-ord-down]')) b.addEventListener('click', () => {
      const i = Number(b.dataset.ordDown); order.splice(i + 1, 0, order.splice(i, 1)[0]); draw();
    });
    $('#cancelOrder').addEventListener('click', loadProjects);
    $('#saveOrder').addEventListener('click', async () => {
      $('#saveOrder').disabled = true;
      try {
        const res = await call('reorder', { order });
        footState(res.state);
        toast(res.review === 'failed' ? 'Saved — review setup failed' : 'Order saved');
        await loadProjects();
      } catch (e) { toast(e.message); $('#saveOrder').disabled = false; }
    });
  };
  draw();
}

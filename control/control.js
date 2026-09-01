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
  if (view === 'projects') loadProjects();
  if (view === 'media') loadMedia();
  if (view === 'publish') loadPublish();
}

for (const tab of document.querySelectorAll('.tab')) {
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
  const { state: s, projects } = await call('overview');
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
  const { projects, state: s } = await call('projects');
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

    <div class="panel">
      <p class="field-label">Images — ${p.media.length} in ${escape(p.shape)}</p>
      <div class="media-grid">
        ${[p.heroSrc, ...p.media].filter(Boolean).map((src, i) => `
          <figure class="media-item" style="margin:0">
            <img src="/${escape(src)}" alt="" loading="lazy">
            <p class="media-name">${i === 0 ? 'Hero · ' : (i - 1) + ' · '}${escape(src.replace('images/', ''))}</p>
          </figure>`).join('')}
      </div>
      <p class="hint">Image order comes from the project's own gallery. Reordering is not wired up yet — see the pull request.</p>
    </div>

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
}

const text = (name, label, value) =>
  `<label class="field"><span class="field-label">${escape(label)}</span>
   <input type="text" name="${name}" value="${escape(value)}"></label>`;

const area = (name, label, value, rows) =>
  `<label class="field"><span class="field-label">${escape(label)}</span>
   <textarea name="${name}" rows="${rows}">${escape(value)}</textarea></label>`;

function sequencePanel(p) {
  const media = p.media;
  const rows = p.editorial.seq.map((b) => {
    const kind = b.t === 'p' ? 'Pair' : (b.w ? `Inset ${b.w}%` : 'Full width');
    const imgs = b.i.map((i) => `<img src="/${escape(media[i])}" alt="" loading="lazy">`).join('');
    const note = [
      b.al ? (b.al === 'r' ? 'right' : 'left') : '',
      b.sp ? b.sp : '',
      typeof b.g === 'number' && p.groups[b.g] ? p.groups[b.g].head : '',
    ].filter(Boolean).join(' · ');
    return `<div class="seq-block"><span class="seq-kind">${kind}</span>
            <span class="seq-imgs">${imgs}</span>
            <span class="seq-note">${escape(note)}</span></div>`;
  }).join('');
  return `<div class="panel">
    <p class="field-label">Reading order — ${escape(p.editorial.rhythm)}</p>
    <div class="seq">${rows}</div>
    <p class="hint">Labels come from the project's own groups, so the architect credits cannot drift. Editing the sequence is read-only for now — see the pull request.</p>
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
  const { files, missing } = await call('media');
  $('#mediaMissing').innerHTML = missing.length
    ? `<div class="panel"><p class="field-label">Missing files</p>
       <p class="hint">These are referenced by a project but are not in the repository:</p>
       <ul class="hint">${missing.map((m) => `<li>${escape(m.src)} — ${escape(m.usedBy.join(', '))}</li>`).join('')}</ul></div>`
    : '';
  $('#mediaGrid').innerHTML = files.map((f) => `
    <figure class="media-item" style="margin:0">
      <img src="/${escape(f.path)}" alt="" loading="lazy">
      <p class="media-name">${escape(f.name)}</p>
      <p class="media-use">${f.usedBy.length ? escape(f.usedBy.join(', ')) : 'unused'}</p>
    </figure>`).join('');
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
  const { state: s } = await call('status');
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

(async () => {
  try { await call('session'); showApp(); go('overview'); }
  catch { showGate(''); }
})();

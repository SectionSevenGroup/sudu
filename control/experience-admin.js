// SuDu Control — Experience Index editor.
// Kept separate from the main Control bundle so the archive can evolve without
// widening the project/page editing surface.

const EXP_ENDPOINT = '/.netlify/functions/control-experience';
const CONTROL_ENDPOINT = '/.netlify/functions/control';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const expState = { model: null, projects: [], editor: null, busy: false };

async function post(endpoint, action, body = {}) {
  const res = await fetch(endpoint, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-SuDu-Control': '1' },
    body: JSON.stringify({ action, ...body }),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || 'Control could not reach the site.');
  return data;
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2600);
}

function install() {
  const tabs = $('.tabs');
  const rail = $('.rail');
  if (!tabs || !rail || $('[data-view="experience"]')) return;

  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.dataset.view = 'experience';
  tab.textContent = 'Experience';
  const media = tabs.querySelector('[data-view="media"]');
  tabs.insertBefore(tab, media || null);

  const view = document.createElement('section');
  view.id = 'view-experience';
  view.className = 'view';
  view.hidden = true;
  view.innerHTML = `
    <div class="view-head">
      <h1 class="view-title">Experience Index</h1>
      <a class="link" href="/#experience" target="_blank" rel="noopener">Open on site ↗</a>
    </div>
    <p class="exp-intro">The broader body of work shown in the homepage Experience Index. Add work here even when it does not have a full project page.</p>
    <div id="experienceEditor"><p class="hint">Reading the Experience Index…</p></div>`;
  const design = $('#view-design');
  rail.insertBefore(view, design || null);

  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-current', t === tab ? 'page' : 'false');
    for (const section of document.querySelectorAll('.view')) section.hidden = section !== view;
    loadExperience();
  });
}

async function loadExperience() {
  const root = $('#experienceEditor');
  if (!root) return;
  root.innerHTML = '<p class="hint">Reading the Experience Index…</p>';
  const [exp, projects] = await Promise.allSettled([
    post(EXP_ENDPOINT, 'get'),
    post(CONTROL_ENDPOINT, 'projects'),
  ]);
  if (exp.status !== 'fulfilled') {
    root.innerHTML = `<div class="load-error"><p><strong>Experience Index could not load.</strong></p><p class="hint">${esc(exp.reason?.message || 'Control could not reach the site.')}</p><button class="button" id="experienceRetry">Retry</button></div>`;
    $('#experienceRetry')?.addEventListener('click', loadExperience);
    return;
  }
  expState.model = exp.value.experience;
  expState.projects = projects.status === 'fulfilled' ? (projects.value.projects || []) : [];
  expState.editor = null;
  renderExperience();
}

function projectMeta(entry) {
  if (entry.project) {
    const p = expState.projects.find((x) => x.slug === entry.project);
    return p ? `${p.title} · linked project` : `${entry.project} · linked project`;
  }
  return entry.info || 'Archive entry';
}

function renderExperience() {
  const root = $('#experienceEditor');
  if (!root || !expState.model) return;
  root.innerHTML = expState.model.categories.map((cat) => `
    <section class="exp-category" data-exp-category="${esc(cat.id)}">
      <div class="exp-category-head">
        <h2 class="exp-category-title">${esc(cat.label)}</h2>
        <span class="exp-count">${cat.entries.length} ${cat.entries.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      <div class="exp-list">
        ${cat.entries.length ? cat.entries.map((entry, i) => entryRow(cat, entry, i)).join('') : '<div class="exp-empty">No entries yet.</div>'}
      </div>
      ${editorHtml(cat)}
      <div class="exp-add"><button class="link" data-exp-add="${esc(cat.id)}">Add an entry</button></div>
    </section>`).join('');
  wireExperience();
}

function entryRow(cat, entry, i) {
  return `<div class="exp-row">
    <div class="exp-name">${esc(entry.name)}</div>
    <div class="exp-meta">${esc(projectMeta(entry))}</div>
    <div class="exp-actions">
      <button class="mini" data-exp-edit="${i}" data-category="${esc(cat.id)}">Edit</button>
      <button class="mini" data-exp-up="${i}" data-category="${esc(cat.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Move earlier">‹</button>
      <button class="mini" data-exp-down="${i}" data-category="${esc(cat.id)}" ${i === cat.entries.length - 1 ? 'disabled' : ''} aria-label="Move later">›</button>
      <button class="mini mini-x" data-exp-remove="${i}" data-category="${esc(cat.id)}">×</button>
    </div>
  </div>`;
}

function editorHtml(cat) {
  if (!expState.editor || expState.editor.category !== cat.id) return '';
  const isNew = expState.editor.index === -1;
  const entry = isNew ? { name: '', project: '', preview: '', info: '' } : cat.entries[expState.editor.index];
  const options = expState.projects.map((p) => `<option value="${esc(p.slug)}" ${p.slug === entry.project ? 'selected' : ''}>${esc(p.title)}</option>`).join('');
  return `<div class="exp-edit" data-exp-form>
    <p class="section-label">${isNew ? 'New entry' : 'Edit entry'}</p>
    <div class="grid-2">
      <label class="field"><span class="field-label">Name shown in index</span><input type="text" name="exp-name" value="${esc(entry.name || '')}"></label>
      <label class="field"><span class="field-label">Link to existing project — optional</span><select name="exp-project"><option value="">No project page</option>${options}</select></label>
      <label class="field"><span class="field-label">Hover / context text — optional</span><input type="text" name="exp-info" value="${esc(entry.info || '')}"></label>
      <label class="field"><span class="field-label">Preview image — optional</span><input type="text" name="exp-preview" value="${esc(entry.preview || '')}" placeholder="images/example.jpg"></label>
    </div>
    <p class="exp-help">Choose a project when this entry has a full case-study page. For broader prior work, leave the project blank and use the context text. Selecting a project will fill its name and hero image when those fields are empty.</p>
    <div class="actions">
      <button class="button" data-exp-save>${isNew ? 'Add entry' : 'Save entry'}</button>
      <button class="link" data-exp-cancel>Cancel</button>
      <span class="exp-status" data-exp-status></span>
    </div>
  </div>`;
}

function wireExperience() {
  const root = $('#experienceEditor');
  if (!root) return;
  root.querySelectorAll('[data-exp-add]').forEach((b) => b.addEventListener('click', () => {
    expState.editor = { category: b.dataset.expAdd, index: -1 };
    renderExperience();
    root.querySelector('[data-exp-form] input')?.focus();
  }));
  root.querySelectorAll('[data-exp-edit]').forEach((b) => b.addEventListener('click', () => {
    expState.editor = { category: b.dataset.category, index: Number(b.dataset.expEdit) };
    renderExperience();
  }));
  root.querySelectorAll('[data-exp-up]').forEach((b) => b.addEventListener('click', () => mutate('move', { category: b.dataset.category, from: Number(b.dataset.expUp), to: Number(b.dataset.expUp) - 1 }, 'Reordered')));
  root.querySelectorAll('[data-exp-down]').forEach((b) => b.addEventListener('click', () => mutate('move', { category: b.dataset.category, from: Number(b.dataset.expDown), to: Number(b.dataset.expDown) + 1 }, 'Reordered')));
  root.querySelectorAll('[data-exp-remove]').forEach((b) => b.addEventListener('click', () => {
    const cat = expState.model.categories.find((c) => c.id === b.dataset.category);
    const entry = cat?.entries[Number(b.dataset.expRemove)];
    if (!entry || !window.confirm(`Remove ${entry.name} from the Experience Index?`)) return;
    mutate('remove', { category: b.dataset.category, index: Number(b.dataset.expRemove) }, 'Removed');
  }));
  root.querySelector('[data-exp-cancel]')?.addEventListener('click', () => { expState.editor = null; renderExperience(); });
  root.querySelector('[data-exp-save]')?.addEventListener('click', saveEditor);

  const project = root.querySelector('[name="exp-project"]');
  project?.addEventListener('change', () => {
    if (!project.value) return;
    const p = expState.projects.find((x) => x.slug === project.value);
    if (!p) return;
    const name = root.querySelector('[name="exp-name"]');
    const preview = root.querySelector('[name="exp-preview"]');
    if (name && !name.value.trim()) name.value = p.title || '';
    if (preview && !preview.value.trim()) preview.value = p.heroSrc || '';
  });
}

async function saveEditor() {
  if (!expState.editor || expState.busy) return;
  const root = $('#experienceEditor');
  const entry = {
    name: root.querySelector('[name="exp-name"]')?.value || '',
    project: root.querySelector('[name="exp-project"]')?.value || '',
    info: root.querySelector('[name="exp-info"]')?.value || '',
    preview: root.querySelector('[name="exp-preview"]')?.value || '',
  };
  if (!entry.name.trim()) { toast('Give the entry a name'); return; }
  const isNew = expState.editor.index === -1;
  const body = { category: expState.editor.category, entry };
  if (!isNew) body.index = expState.editor.index;
  await mutate(isNew ? 'add' : 'update', body, isNew ? 'Entry added' : 'Entry saved');
}

async function mutate(action, body, note) {
  if (expState.busy) return;
  expState.busy = true;
  const root = $('#experienceEditor');
  root?.querySelectorAll('button, input, select').forEach((el) => { el.disabled = true; });
  try {
    const res = await post(EXP_ENDPOINT, action, body);
    expState.model = res.experience;
    expState.editor = null;
    const foot = $('#footState');
    if (foot) foot.textContent = res.review === 'failed' ? 'Draft saved · review needs attention' : 'Draft saved · Experience Index';
    toast(res.review === 'failed' ? `${note} — review setup needs attention` : note);
    renderExperience();
  } catch (e) {
    toast(e.message);
    renderExperience();
  } finally {
    expState.busy = false;
  }
}

install();

(() => {
  'use strict';

  const API = '/.netlify/functions/control';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const state = { token: sessionStorage.getItem('sudu-control-token') || '', projects: [], order: [], current: null, dirty: false, status: null };

  const esc = (v = '') => String(v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const slugify = s => String(s || '').toLowerCase().trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);

  async function request(action, data = {}) {
    const headers = {'Content-Type':'application/json'};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const r = await fetch(API, {method:'POST', headers, body:JSON.stringify({action, ...data}), cache:'no-store'});
    const payload = await r.json().catch(() => ({}));
    if (r.status === 401 && action !== 'login') logout(false);
    if (!r.ok || payload.ok === false) throw new Error(payload.error || `Request failed (${r.status})`);
    return payload;
  }

  function toast(message) {
    const old = $('.toast'); if (old) old.remove();
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  function busy(on) { $('#adminView')?.classList.toggle('busy', on); }
  function setDirty(v) { state.dirty = v; document.title = v ? '• SuDu / Control' : 'SuDu / Control'; }

  function showAdmin() {
    $('#loginView').hidden = true; $('#adminView').hidden = false; $('#signOut').hidden = false;
  }
  function showLogin() {
    $('#loginView').hidden = false; $('#adminView').hidden = true; $('#signOut').hidden = true;
  }
  function logout(show = true) {
    state.token = ''; sessionStorage.removeItem('sudu-control-token'); state.projects=[]; state.order=[]; state.current=null;
    if (show) showLogin();
  }

  async function login(e) {
    e.preventDefault(); $('#loginError').textContent = '';
    try {
      const res = await request('login', {password:$('#password').value});
      state.token = res.token; sessionStorage.setItem('sudu-control-token', state.token); $('#password').value='';
      showAdmin(); await bootstrap();
    } catch (err) { $('#loginError').textContent = err.message; }
  }

  async function bootstrap() {
    busy(true);
    try {
      const res = await request('bootstrap');
      state.projects = res.projects || []; state.order = res.order || state.projects.map(p=>p.slug); state.status = res.status || null;
      renderList(); renderStatus();
      if (state.current) selectProject(state.current.slug); else if (state.projects[0]) selectProject(state.projects[0].slug);
    } catch (err) { toast(err.message); }
    finally { busy(false); }
  }

  function renderStatus() {
    const s = state.status || {};
    $('#draftState').textContent = s.hasChanges ? `${s.changedFiles || 0} changed` : 'No unpublished changes';
    const a = $('#previewLink');
    if (s.previewUrl) { a.href=s.previewUrl; a.textContent='Open preview'; a.removeAttribute('aria-disabled'); }
    else { a.href='#'; a.textContent=s.hasChanges ? 'Preview building' : 'Not required'; a.setAttribute('aria-disabled','true'); }
  }

  function filteredProjects() {
    const q = ($('#projectSearch').value || '').trim().toLowerCase();
    return state.order.map(slug => state.projects.find(p => p.slug===slug)).filter(Boolean).filter(p => !q || `${p.title} ${p.location} ${p.eyebrow}`.toLowerCase().includes(q));
  }

  function renderList() {
    const list = $('#projectList'); list.innerHTML='';
    filteredProjects().forEach((p, i) => {
      const actual = state.order.indexOf(p.slug);
      const li=document.createElement('li');
      li.innerHTML=`<button class="project-row ${state.current?.slug===p.slug?'active':''}" data-slug="${esc(p.slug)}"><span class="num">${String(actual+1).padStart(2,'0')}</span><span><span class="name">${esc(p.title)}</span><span class="meta">${esc(p.eyebrow)} · ${esc(p.location)}</span></span><span class="chev">›</span></button>`;
      list.appendChild(li);
    });
    $$('.project-row',list).forEach(b=>b.addEventListener('click',()=>guardNavigate(()=>selectProject(b.dataset.slug))));
  }

  function guardNavigate(next) {
    if (!state.dirty || confirm('Discard the unsaved changes in this editor?')) { setDirty(false); next(); }
  }

  function normalizeGroups(p) {
    if (Array.isArray(p.groups) && p.groups.length) return p.groups.map(g=>({head:g.head||'',sub:g.sub||'',small:!!g.small,images:[...(g.images||[])]}));
    if (Array.isArray(p.gallery) && p.gallery.length) return [{head:'',sub:'',small:false,images:[...p.gallery]}];
    return [];
  }

  function selectProject(slug) {
    const p=state.projects.find(x=>x.slug===slug); if(!p)return;
    state.current=structuredClone(p); state.current.groups=normalizeGroups(p); delete state.current.gallery; setDirty(false); renderList(); renderEditor();
  }

  function renderEditor() {
    const p=state.current; const root=$('#projectEditor'); if(!p){root.innerHTML='<div class="empty-editor">Select a project to edit.</div>';return;}
    root.innerHTML=`
      <div class="editor-head">
        <div><div class="eyebrow">PROJECT</div><h2>${esc(p.title||'Untitled')}</h2><div class="slug">/work/${esc(p.slug)}/</div></div>
        <div class="editor-actions"><button class="quiet-action" id="moveUp">Move up</button><button class="quiet-action" id="moveDown">Move down</button><button id="saveProject">Save draft</button></div>
      </div>
      <div class="editor-grid">
        ${field('title','Project name',p.title,'text','Used as the project H1 and Work title.')}
        ${field('slug','URL slug',p.slug,'text',p.isNew?'Choose once. Existing project URLs remain locked.':'Locked after publication.',!p.isNew)}
        ${field('eyebrow','Category',p.eyebrow)}
        ${field('location','Location',p.location)}
        ${field('scope','Scope',p.scope)}
        ${field('status','Status',p.status)}
        ${textarea('lede','Short introduction',p.lede,'full')}
        ${textarea('body','Project description',p.body,'full large')}
      </div>
      <div class="editor-section">
        <div class="editor-section-title"><h3>Hero image</h3><p>16:9 crop on the project page</p></div>
        <div class="hero-editor">
          <div class="hero-preview">${p.heroSrc?`<img src="/${esc(p.heroSrc.replace(/^\//,''))}" alt="">`:''}</div>
          <div class="hero-tools"><div class="image-path">${esc(p.heroSrc||'No image selected')}</div><label class="upload-label">${p.heroSrc?'Replace image':'Upload image'}<input id="heroUpload" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="image-note">JPEG, PNG or WebP. Control records the pixel dimensions automatically.</div></div>
        </div>
      </div>
      <div class="editor-section">
        <div class="editor-section-title"><h3>Project images</h3><button id="addGroup" class="ghost-button">Add image group</button></div>
        <div id="galleryGroups" class="gallery-groups"></div>
      </div>
      <div class="editor-section">
        <div class="editor-section-title"><h3>Related work</h3><p>Choose genuine relationships only</p></div>
        <div id="relatedGrid" class="related-grid"></div>
      </div>`;
    renderGroups(); renderRelated(); bindEditor();
  }

  function field(name,label,value,type='text',note='',disabled=false){return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" data-field="${name}" type="${type}" value="${esc(value||'')}" ${disabled?'disabled':''}>${note?`<small>${esc(note)}</small>`:''}</div>`}
  function textarea(name,label,value,cls=''){return `<div class="field ${cls.includes('full')?'full':''}"><label for="f-${name}">${label}</label><textarea id="f-${name}" class="${cls.includes('large')?'large':''}" data-field="${name}">${esc(value||'')}</textarea></div>`}

  function renderGroups(){
    const root=$('#galleryGroups'); root.innerHTML='';
    (state.current.groups||[]).forEach((g,gi)=>{
      const box=document.createElement('div'); box.className='gallery-group'; box.dataset.gi=gi;
      box.innerHTML=`<div class="group-top"><div><label class="eyebrow">Heading</label><input data-gfield="head" value="${esc(g.head)}" placeholder="Optional"></div><div><label class="eyebrow">Subheading</label><input data-gfield="sub" value="${esc(g.sub)}" placeholder="Optional"></div><div class="mini-actions"><button data-gact="up" title="Move group up">↑</button><button data-gact="down" title="Move group down">↓</button><button data-gact="remove" title="Remove group">×</button></div></div><div class="gallery-grid"></div><div class="add-images-row"><label class="ghost-button">Add images<input data-gallery-upload type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label></div>`;
      const grid=$('.gallery-grid',box);
      g.images.forEach((src,ii)=>{
        const card=document.createElement('div');card.className='gallery-image';card.innerHTML=`<img src="/${esc(src.replace(/^\//,''))}" alt=""><div class="gallery-image-controls"><button data-iact="left" data-ii="${ii}" title="Move left">←</button><button data-iact="right" data-ii="${ii}" title="Move right">→</button><button data-iact="remove" data-ii="${ii}" title="Remove">×</button></div>`;grid.appendChild(card);
      }); root.appendChild(box);
    });
    $$('.gallery-group',root).forEach(box=>{
      const gi=+box.dataset.gi;
      $$('[data-gfield]',box).forEach(inp=>inp.addEventListener('input',()=>{state.current.groups[gi][inp.dataset.gfield]=inp.value;setDirty(true)}));
      $$('[data-gact]',box).forEach(b=>b.addEventListener('click',()=>groupAction(gi,b.dataset.gact)));
      $$('[data-iact]',box).forEach(b=>b.addEventListener('click',()=>imageAction(gi,+b.dataset.ii,b.dataset.iact)));
      $('[data-gallery-upload]',box).addEventListener('change',e=>uploadGallery(gi,e.target.files));
    });
  }

  function groupAction(i,a){const arr=state.current.groups;if(a==='remove'){if(!confirm('Remove this image group from the project?'))return;arr.splice(i,1)}else{const n=a==='up'?i-1:i+1;if(n<0||n>=arr.length)return;[arr[i],arr[n]]=[arr[n],arr[i]]}setDirty(true);renderGroups()}
  function imageAction(gi,ii,a){const arr=state.current.groups[gi].images;if(a==='remove')arr.splice(ii,1);else{const n=a==='left'?ii-1:ii+1;if(n<0||n>=arr.length)return;[arr[ii],arr[n]]=[arr[n],arr[ii]]}setDirty(true);renderGroups()}

  function renderRelated(){
    const root=$('#relatedGrid');root.innerHTML='';const selected=new Set((state.current.related||[]).map(r=>r.key).filter(Boolean));
    state.order.filter(s=>s!==state.current.slug).forEach(slug=>{const p=state.projects.find(x=>x.slug===slug);if(!p)return;const label=document.createElement('label');label.className='related-option';label.innerHTML=`<input type="checkbox" value="${esc(slug)}" ${selected.has(slug)?'checked':''}><span>${esc(p.title)}</span>`;root.appendChild(label)});
    $$('input',root).forEach(i=>i.addEventListener('change',()=>{state.current.related=$$('input:checked',root).map(c=>{const p=state.projects.find(x=>x.slug===c.value);return {name:p.title,meta:p.eyebrow,key:p.slug}});setDirty(true)}));
  }

  function bindEditor(){
    $$('[data-field]', $('#projectEditor')).forEach(el=>el.addEventListener('input',()=>{state.current[el.dataset.field]=el.value;if(el.dataset.field==='title'){$('.editor-head h2').textContent=el.value||'Untitled'};if(el.dataset.field==='slug'&&state.current.isNew){state.current.slug=slugify(el.value);$('.slug').textContent=`/work/${state.current.slug}/`}setDirty(true)}));
    $('#saveProject').addEventListener('click',saveProject); $('#moveUp').addEventListener('click',()=>moveProject(-1)); $('#moveDown').addEventListener('click',()=>moveProject(1));
    $('#heroUpload').addEventListener('change',e=>uploadHero(e.target.files[0]));
    $('#addGroup').addEventListener('click',()=>{state.current.groups.push({head:'',sub:'',small:false,images:[]});setDirty(true);renderGroups()});
  }

  function moveProject(delta){const i=state.order.indexOf(state.current.slug);const n=i+delta;if(i<0||n<0||n>=state.order.length)return;[state.order[i],state.order[n]]=[state.order[n],state.order[i]];setDirty(true);renderList();toast('Order changed. Save draft to keep it.')}

  async function filePayload(file){
    if(!file)return null;if(file.size>12*1024*1024)throw new Error('Image is larger than 12 MB. Optimise it before upload.');
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file)});
    const dim=await new Promise((resolve,reject)=>{const url=URL.createObjectURL(file);const im=new Image();im.onload=()=>{resolve({width:im.naturalWidth,height:im.naturalHeight});URL.revokeObjectURL(url)};im.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not read image'))};im.src=url});
    return {name:file.name,type:file.type,base64:data,...dim};
  }
  async function uploadHero(file){if(!file)return;try{busy(true);const f=await filePayload(file);const res=await request('upload',{slug:state.current.slug||slugify(state.current.title),role:'hero',file:f});state.current.heroSrc=res.path;state.current.heroDims=[f.width,f.height];setDirty(true);renderEditor();toast('Hero uploaded to the draft branch.')}catch(e){toast(e.message)}finally{busy(false)}}
  async function uploadGallery(gi,files){if(!files?.length)return;try{busy(true);for(const file of files){const f=await filePayload(file);const res=await request('upload',{slug:state.current.slug||slugify(state.current.title),role:'gallery',file:f});state.current.groups[gi].images.push(res.path)}setDirty(true);renderGroups();toast(`${files.length} image${files.length===1?'':'s'} uploaded.`)}catch(e){toast(e.message)}finally{busy(false)}}

  async function saveProject(){
    syncFields(); const p=state.current; p.slug=slugify(p.slug||p.title);
    if(!p.title||!p.slug||!p.heroSrc){toast('Project name, URL slug and hero image are required.');return}
    try{busy(true);const res=await request('saveProject',{project:p,order:state.order});state.projects=res.projects;state.order=res.order;state.status=res.status;state.current=state.projects.find(x=>x.slug===p.slug);setDirty(false);renderList();renderEditor();renderStatus();toast('Draft saved.')}catch(e){toast(e.message)}finally{busy(false)}
  }
  function syncFields(){$$('[data-field]', $('#projectEditor')).forEach(el=>state.current[el.dataset.field]=el.value)}

  function newProject(){guardNavigate(()=>{state.current={slug:'',title:'Untitled project',eyebrow:'',location:'',scope:'',status:'In development',lede:'',body:'',heroSrc:'',groups:[],related:[],isNew:true};renderList();renderEditor();setDirty(true)})}

  async function refreshStatus(){try{busy(true);const r=await request('status');state.status=r.status;renderStatus();$('#publishStatus').textContent=state.status.previewUrl?'Preview is available.':'No preview is currently required.'}catch(e){$('#publishStatus').textContent=e.message}finally{busy(false)}}
  async function publish(){if(state.dirty){toast('Save the project draft before publishing.');return}if(!confirm('Publish all reviewed Control changes to the live site?'))return;try{busy(true);$('#publishStatus').textContent='Publishing…';const r=await request('publish');state.status=r.status;renderStatus();$('#publishStatus').textContent='Published. Netlify is deploying the new production commit.';toast('Published to main.')}catch(e){$('#publishStatus').textContent=e.message}finally{busy(false)}}
  async function discard(){if(!confirm('Discard every unpublished Control change and return the draft to the current live site?'))return;try{busy(true);await request('discard');setDirty(false);await bootstrap();toast('Draft discarded.')}catch(e){toast(e.message)}finally{busy(false)}}

  function switchPanel(name){$$('.section-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$$('.panel').forEach(p=>p.classList.toggle('active',p.id===`${name}Panel`))}

  $('#loginForm').addEventListener('submit',login); $('#signOut').addEventListener('click',()=>logout(true)); $('#projectSearch').addEventListener('input',renderList); $('#newProject').addEventListener('click',newProject);
  $$('.section-tab').forEach(b=>b.addEventListener('click',()=>switchPanel(b.dataset.view))); $('#refreshStatus').addEventListener('click',refreshStatus); $('#publishDraft').addEventListener('click',publish); $('#discardDraft').addEventListener('click',discard);
  addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue=''}});

  (async()=>{if(!state.token){showLogin();return}try{await request('verify');showAdmin();await bootstrap()}catch{logout(true)}})();
})();

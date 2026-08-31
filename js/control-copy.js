(() => {
  'use strict';

  const API='/.netlify/functions/control-copy';
  const LANGS=[['en','EN'],['fr','FR'],['es','ES'],['de','DE'],['ja','JA']];
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const state={pages:[],page:null,dirty:false,loaded:false,lang:'en'};

  const esc=(v='')=>String(v).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  function token(){return sessionStorage.getItem('sudu-control-token')||''}
  async function request(action,data={}){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`},body:JSON.stringify({action,...data}),cache:'no-store'});
    const payload=await r.json().catch(()=>({}));
    if(!r.ok||payload.ok===false)throw new Error(payload.error||`Request failed (${r.status})`);
    return payload;
  }
  function toast(message){
    const old=$('.toast');if(old)old.remove();const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),3200);
  }
  function busy(on){$('#sitePanel')?.classList.toggle('busy',on)}
  function setDirty(v){state.dirty=v;$('#copySave')?.toggleAttribute('data-dirty',v)}

  function renderPages(){
    const root=$('#copyPageList');if(!root)return;root.innerHTML='';
    state.pages.forEach(p=>{
      const li=document.createElement('li');
      li.innerHTML=`<button class="copy-page-row ${state.page?.id===p.id?'active':''}" data-page="${esc(p.id)}"><span>${esc(p.label)}</span><small>${esc(p.url)}</small><span class="chev">›</span></button>`;
      root.appendChild(li);
    });
    $$('.copy-page-row',root).forEach(b=>b.addEventListener('click',()=>guard(()=>loadPage(b.dataset.page))));
  }
  function guard(next){if(!state.dirty||confirm('Discard unsaved copy changes on this page?')){setDirty(false);next()}}

  function groups(fields){
    const map=new Map();fields.forEach(f=>{if(!map.has(f.group))map.set(f.group,[]);map.get(f.group).push(f)});return map;
  }
  function renderEditor(){
    const root=$('#copyEditor');if(!root)return;
    const p=state.page;if(!p){root.innerHTML='<div class="empty-editor">Choose a page to edit its copy.</div>';return}
    $('#copyPagePreview').href=p.url;
    root.innerHTML=`
      <div class="copy-editor-head">
        <div><div class="eyebrow">PAGE</div><h2>${esc(p.label)}</h2><p>${esc(p.description||'')}</p></div>
        <div class="copy-editor-actions"><div class="language-tabs" aria-label="Editing language">${LANGS.map(([k,l])=>`<button class="language-tab ${k===state.lang?'active':''}" data-lang="${k}">${l}</button>`).join('')}</div><button id="copySave" class="primary-action">Save draft</button></div>
      </div>
      <div class="copy-sections"></div>`;
    const sections=$('.copy-sections',root);
    for(const [group,fields] of groups(p.fields)){
      const sec=document.createElement('section');sec.className='copy-section';
      sec.innerHTML=`<div class="copy-section-label">${esc(group)}</div><div class="copy-fields"></div>`;
      const fr=$('.copy-fields',sec);
      fields.forEach(f=>fr.appendChild(fieldNode(f)));
      sections.appendChild(sec);
    }
    $$('.language-tab',root).forEach(b=>b.addEventListener('click',()=>{syncInputs();state.lang=b.dataset.lang;renderEditor()}));
    $('#copySave').addEventListener('click',savePage);
    $$('[data-copy-field]',root).forEach(el=>el.addEventListener('input',()=>setDirty(true)));
  }
  function fieldNode(f){
    const wrap=document.createElement('div');wrap.className=`copy-field ${f.type==='textarea'?'copy-field-wide':''}`;
    const value=f.values?.[state.lang]??(state.lang==='en'?f.values?.en:'');
    const unavailable=!f.translate&&state.lang!=='en';
    const label=`<label for="copy-${esc(f.id)}">${esc(f.label)}</label>`;
    if(unavailable){wrap.innerHTML=`${label}<div class="copy-not-translated">English-only field</div>`;return wrap}
    const attrs=`id="copy-${esc(f.id)}" data-copy-field="${esc(f.id)}" data-lang="${state.lang}" maxlength="${Number(f.max||12000)}"`;
    wrap.innerHTML=`${label}${f.type==='textarea'?`<textarea ${attrs}>${esc(value)}</textarea>`:`<input ${attrs} type="text" value="${esc(value)}">`}${f.note?`<small>${esc(f.note)}</small>`:''}${f.translate?'<small class="copy-translation-note">Language-specific copy</small>':''}`;
    return wrap;
  }
  function syncInputs(){
    if(!state.page)return;
    $$('[data-copy-field]',$('#copyEditor')).forEach(el=>{
      const f=state.page.fields.find(x=>x.id===el.dataset.copyField);if(!f)return;
      f.values=f.values||{};f.values[el.dataset.lang]=el.value;
    });
  }

  async function loadPage(pageId='home'){
    if(!token())return;
    try{busy(true);const r=await request('pages',{pageId});state.pages=r.pages||[];state.page=r.page;state.loaded=true;setDirty(false);renderPages();renderEditor()}catch(e){toast(e.message)}finally{busy(false)}
  }
  async function savePage(){
    syncInputs();if(!state.page)return;
    const values={};state.page.fields.forEach(f=>values[f.id]=f.values||{});
    try{busy(true);const r=await request('save',{pageId:state.page.id,values});state.pages=r.pages||state.pages;state.page=r.page;setDirty(false);renderPages();renderEditor();toast(`${state.page.label} copy saved to draft.`)}catch(e){toast(e.message)}finally{busy(false)}
  }

  function initTab(){
    const tab=$('.section-tab[data-view="site"]');if(!tab)return;
    tab.addEventListener('click',()=>{if(!state.loaded)loadPage('home')});
  }
  addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue=''}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initTab);else initTab();
})();

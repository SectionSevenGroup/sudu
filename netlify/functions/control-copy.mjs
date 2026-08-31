import crypto from 'node:crypto';

const OWNER = process.env.SUDU_GITHUB_OWNER || 'SectionSevenGroup';
const REPO = process.env.SUDU_GITHUB_REPO || 'sudu';
const BASE = process.env.SUDU_GITHUB_BASE || 'main';
const DRAFT = process.env.SUDU_GITHUB_DRAFT || 'control/content-draft';
const GH = 'https://api.github.com';
const LANGS = ['en','fr','es','de','ja'];

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
  },
  body: JSON.stringify(body),
});

const ready = () => Boolean(process.env.GITHUB_TOKEN && process.env.SUDU_CONTROL_SESSION_SECRET);
const safeEqual = (a,b) => {
  const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
};
function verifySession(token='') {
  try {
    const [payload,sig]=token.split('.'); if(!payload||!sig)return false;
    const want=crypto.createHmac('sha256',process.env.SUDU_CONTROL_SESSION_SECRET).update(payload).digest('base64url');
    if(!safeEqual(sig,want))return false;
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return Number(data.exp)>Date.now();
  } catch { return false; }
}

async function gh(path, options={}) {
  const r=await fetch(`${GH}${path}`,{
    ...options,
    headers:{
      Accept:'application/vnd.github+json',
      Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'sudu-control-copy',
      ...(options.headers||{}),
    },
  });
  const text=await r.text(); let data=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok){const e=new Error(data?.message||`GitHub request failed (${r.status})`);e.status=r.status;throw e}
  return data;
}
async function refSha(branch){const r=await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`);return r.object.sha}
async function ensureDraft(){
  try{return await refSha(DRAFT)}catch(e){
    if(e.status!==404)throw e;
    const sha=await refSha(BASE);
    await gh(`/repos/${OWNER}/${REPO}/git/refs`,{method:'POST',body:JSON.stringify({ref:`refs/heads/${DRAFT}`,sha})});
    return sha;
  }
}
async function getFile(path,ref=DRAFT){
  const f=await gh(`/repos/${OWNER}/${REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
  return {text:Buffer.from((f.content||'').replace(/\n/g,''),'base64').toString('utf8'),sha:f.sha};
}
async function commitFiles(files,message){
  const parent=await ensureDraft();
  const commit=await gh(`/repos/${OWNER}/${REPO}/git/commits/${parent}`);
  const tree=[];
  for(const f of files){
    const blob=await gh(`/repos/${OWNER}/${REPO}/git/blobs`,{method:'POST',body:JSON.stringify({content:f.content,encoding:'utf-8'})});
    tree.push({path:f.path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const t=await gh(`/repos/${OWNER}/${REPO}/git/trees`,{method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree})});
  const next=await gh(`/repos/${OWNER}/${REPO}/git/commits`,{method:'POST',body:JSON.stringify({message,tree:t.sha,parents:[parent]})});
  await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${encodeURIComponent(DRAFT)}`,{method:'PATCH',body:JSON.stringify({sha:next.sha,force:false})});
  return next.sha;
}

function decodeHtml(s=''){
  return String(s)
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&rsquo;|&#8217;/g,'’').replace(/&lsquo;|&#8216;/g,'‘')
    .replace(/&ldquo;|&#8220;/g,'“').replace(/&rdquo;|&#8221;/g,'”')
    .replace(/&middot;|&#183;/g,'·').replace(/&copy;/g,'©')
    .replace(/&eacute;/g,'é')
    .replace(/<[^>]+>/g,'')
    .trim();
}
function encodeText(s='',multiline=false){
  let out=String(s).replace(/\u0000/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if(multiline)out=out.replace(/\r?\n/g,'<br>');
  return out;
}
function encodeAttr(s=''){return encodeText(s,false).replace(/"/g,'&quot;')}

function sectionBounds(source,needle){
  const at=source.indexOf(needle); if(at<0)throw new Error(`Could not locate section ${needle}`);
  const start=source.lastIndexOf('<section',at); const end=source.indexOf('</section>',at);
  if(start<0||end<0)throw new Error(`Could not bound section ${needle}`);
  return {start,end:end+'</section>'.length};
}
function nthTagLoc(source,needle,tag,nth=0){
  const b=sectionBounds(source,needle); const slice=source.slice(b.start,b.end);
  const re=new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'gi'); let m; let i=0;
  while((m=re.exec(slice))){if(i++===nth){const local=m.index+m[0].indexOf(m[1]);return {start:b.start+local,end:b.start+local+m[1].length,raw:m[1]}}}
  throw new Error(`Could not locate ${tag} ${nth} in ${needle}`);
}
function idTagLoc(source,id,tag='h1'){
  const re=new RegExp(`<${tag}\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i');const m=re.exec(source);
  if(!m)throw new Error(`Could not locate #${id}`);const local=m.index+m[0].indexOf(m[1]);return {start:local,end:local+m[1].length,raw:m[1]};
}
function titleLoc(source){const m=/<title>([\s\S]*?)<\/title>/i.exec(source);if(!m)throw new Error('Could not locate title');const s=m.index+m[0].indexOf(m[1]);return {start:s,end:s+m[1].length,raw:m[1]}}
function metaDescLoc(source){const m=/<meta\s+name="description"\s+content="([^"]*)">/i.exec(source);if(!m)throw new Error('Could not locate meta description');const s=m.index+m[0].indexOf(m[1]);return {start:s,end:s+m[1].length,raw:m[1],attr:true}}
function founderRoleLoc(source,nth){
  const b=sectionBounds(source,'data-screen-label="Founders"'); const slice=source.slice(b.start,b.end);
  const re=/<h3\b[^>]*>[\s\S]*?<\/h3>\s*<div\b[^>]*>([\s\S]*?)<\/div>/gi;let m;let i=0;
  while((m=re.exec(slice))){if(i++===nth){const local=m.index+m[0].lastIndexOf(m[1]);return {start:b.start+local,end:b.start+local+m[1].length,raw:m[1]}}}
  throw new Error('Could not locate founder role');
}
function contactFaqArray(source){
  const marker='const FAQS = ['; const at=source.indexOf(marker); if(at<0)throw new Error('Could not locate FAQS');
  const open=source.indexOf('[',at); let depth=0,quote='',esc=false;
  for(let i=open;i<source.length;i++){
    const c=source[i];
    if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue}
    if(c==='"'||c==="'"){quote=c;continue}
    if(c==='[')depth++; else if(c===']'&&--depth===0){const raw=source.slice(open,i+1);const value=Function(`"use strict";return (${raw});`)();return {start:open,end:i+1,value}}
  }
  throw new Error('Could not bound FAQS');
}
function faqLoc(source,index,part){const arr=contactFaqArray(source);return {virtual:'faq',array:arr,index,part,raw:arr.value[index]?.[part]||''}}

const F = (id,label,group,target,{type='text',translate=true,max=1200,note=''}={}) => ({id,label,group,target,type,translate,max,note});
const PAGES = [
  {
    id:'home',label:'Home',url:'/',description:'Hero, introduction, offerings and studio statement.',files:['index.html'],fields:[
      F('seoTitle','SEO title','SEO',{kind:'title'},{translate:false,max:180}),
      F('seoDescription','SEO description','SEO',{kind:'meta'},{translate:false,max:320,type:'textarea'}),
      F('heroStatement','Hero statement','Hero',{kind:'id',id:'heroStatement',tag:'h1',multiline:true},{type:'textarea',max:160,note:'Line breaks are preserved. Keep this short enough for the hero composition.'}),
      F('heroProjectLabel','Hero project label','Hero',{kind:'sectionTag',section:'id="hero"',tag:'span',nth:0},{max:120}),
      F('heroProjectStatus','Hero project status','Hero',{kind:'sectionTag',section:'id="hero"',tag:'span',nth:2},{max:80}),
      F('introHeading','Intro heading','Introduction',{kind:'sectionTag',section:'data-screen-label="Intro"',tag:'h2',nth:0},{max:180}),
      F('introBody','Intro paragraph','Introduction',{kind:'sectionTag',section:'data-screen-label="Intro"',tag:'p',nth:0},{type:'textarea',max:700}),
      F('offering1Title','Architecture title','Offerings',{kind:'sectionTag',section:'id="offerings"',tag:'h4',nth:0},{max:80}),
      F('offering1Body','Architecture description','Offerings',{kind:'sectionTag',section:'id="offerings"',tag:'p',nth:0},{type:'textarea',max:420}),
      F('offering2Title','Interiors title','Offerings',{kind:'sectionTag',section:'id="offerings"',tag:'h4',nth:1},{max:80}),
      F('offering2Body','Interiors description','Offerings',{kind:'sectionTag',section:'id="offerings"',tag:'p',nth:1},{type:'textarea',max:420}),
      F('offering3Title','Commercial title','Offerings',{kind:'sectionTag',section:'id="offerings"',tag:'h4',nth:2},{max:80}),
      F('offering3Body','Commercial description','Offerings',{kind:'sectionTag',section:'id="offerings"',tag:'p',nth:2},{type:'textarea',max:420}),
      F('offering4Title','Advisory title','Offerings',{kind:'sectionTag',section:'id="offerings"',tag:'h4',nth:3},{max:80}),
      F('offering4Body','Advisory description','Offerings',{kind:'sectionTag',section:'id="offerings"',tag:'p',nth:3},{type:'textarea',max:420}),
      F('studioStatement','Studio statement','Studio block',{kind:'sectionTag',section:'id="studio"',tag:'p',nth:0},{max:220}),
      F('studioBody','Studio paragraph','Studio block',{kind:'sectionTag',section:'id="studio"',tag:'p',nth:1},{type:'textarea',max:700}),
      F('studioBased','Based','Studio block',{kind:'sectionTag',section:'id="studio"',tag:'dd',nth:0},{max:100}),
      F('studioPractice','Practice','Studio block',{kind:'sectionTag',section:'id="studio"',tag:'dd',nth:1},{max:180}),
      F('studioSectors','Sectors','Studio block',{kind:'sectionTag',section:'id="studio"',tag:'dd',nth:2},{max:220}),
    ]
  },
  {
    id:'work',label:'Work',url:'/work/',description:'Work index heading and portfolio context.',files:['work.html','work/index.html'],fields:[
      F('seoTitle','SEO title','SEO',{kind:'title'},{translate:false,max:180}),
      F('seoDescription','SEO description','SEO',{kind:'meta'},{translate:false,max:320,type:'textarea'}),
      F('heading','Page heading','Page',{kind:'sectionTag',section:'data-screen-label="Work Index"',tag:'h1',nth:0},{max:100}),
      F('portfolioNote','Portfolio note','Page',{kind:'sectionTag',section:'data-screen-label="Work Index"',tag:'p',nth:0},{type:'textarea',max:700}),
    ]
  },
  {
    id:'studio',label:'Studio',url:'/studio/',description:'Studio introduction and founder information.',files:['studio.html'],fields:[
      F('seoTitle','SEO title','SEO',{kind:'title'},{translate:false,max:180}),
      F('seoDescription','SEO description','SEO',{kind:'meta'},{translate:false,max:320,type:'textarea'}),
      F('eyebrow','Section label','Introduction',{kind:'sectionTag',section:'data-screen-label="Studio Intro"',tag:'div',nth:0},{max:80}),
      F('heading','Main statement','Introduction',{kind:'sectionTag',section:'data-screen-label="Studio Intro"',tag:'h1',nth:0,multiline:true},{type:'textarea',max:260}),
      F('intro','Introduction','Introduction',{kind:'sectionTag',section:'data-screen-label="Studio Intro"',tag:'p',nth:0},{type:'textarea',max:1200}),
      F('mikeName','Michael name','Michael Sczesny',{kind:'sectionTag',section:'data-screen-label="Founders"',tag:'h3',nth:0},{translate:false,max:120}),
      F('mikeRole','Michael role','Michael Sczesny',{kind:'founderRole',nth:0},{max:140}),
      F('mikeBio1','Michael bio 01','Michael Sczesny',{kind:'sectionTag',section:'data-screen-label="Founders"',tag:'p',nth:0},{type:'textarea',max:1600}),
      F('mikeBio2','Michael bio 02','Michael Sczesny',{kind:'sectionTag',section:'data-screen-label="Founders"',tag:'p',nth:1},{type:'textarea',max:1600}),
      F('jenniferName','Jennifer name','Jennifer von Berendt',{kind:'sectionTag',section:'data-screen-label="Founders"',tag:'h3',nth:1},{translate:false,max:120}),
      F('jenniferRole','Jennifer role','Jennifer von Berendt',{kind:'founderRole',nth:1},{max:140}),
      F('jenniferBio1','Jennifer bio 01','Jennifer von Berendt',{kind:'sectionTag',section:'data-screen-label="Founders"',tag:'p',nth:2},{type:'textarea',max:1600}),
      F('jenniferBio2','Jennifer bio 02','Jennifer von Berendt',{kind:'sectionTag',section:'data-screen-label="Founders"',tag:'p',nth:3},{type:'textarea',max:1600}),
      F('joeName','Joe name','Joe Johnson',{kind:'sectionTag',section:'data-screen-label="Founders"',tag:'h3',nth:2},{translate:false,max:120}),
      F('joeRole','Joe role','Joe Johnson',{kind:'founderRole',nth:2},{max:140}),
      F('joeBio1','Joe bio 01','Joe Johnson',{kind:'sectionTag',section:'data-screen-label="Founders"',tag:'p',nth:4},{type:'textarea',max:1800}),
      F('joeBio2','Joe bio 02','Joe Johnson',{kind:'sectionTag',section:'data-screen-label="Founders"',tag:'p',nth:5},{type:'textarea',max:2600}),
    ]
  },
  {
    id:'contact',label:'Contact',url:'/contact/',description:'Contact statement and common questions.',files:['contact.html'],fields:[
      F('seoTitle','SEO title','SEO',{kind:'title'},{translate:false,max:180}),
      F('seoDescription','SEO description','SEO',{kind:'meta'},{translate:false,max:320,type:'textarea'}),
      F('eyebrow','Section label','Introduction',{kind:'sectionTag',section:'data-screen-label="Contact"',tag:'div',nth:0},{max:100}),
      F('heading','Main statement','Introduction',{kind:'sectionTag',section:'data-screen-label="Contact"',tag:'h1',nth:0,multiline:true},{type:'textarea',max:240}),
      F('faqHeading','FAQ label','FAQ',{kind:'sectionTag',section:'data-screen-label="FAQ"',tag:'span',nth:0},{max:100}),
      ...Array.from({length:6},(_,i)=>[
        F(`faq${i+1}q`,`Question ${String(i+1).padStart(2,'0')}`,'FAQ',{kind:'faq',index:i,part:'q'},{type:'textarea',max:500}),
        F(`faq${i+1}a`,`Answer ${String(i+1).padStart(2,'0')}`,'FAQ',{kind:'faq',index:i,part:'a'},{type:'textarea',max:1800}),
      ]).flat(),
    ]
  }
];

function locate(source,target){
  if(target.kind==='title')return titleLoc(source);
  if(target.kind==='meta')return metaDescLoc(source);
  if(target.kind==='id')return idTagLoc(source,target.id,target.tag);
  if(target.kind==='sectionTag')return nthTagLoc(source,target.section,target.tag,target.nth||0);
  if(target.kind==='founderRole')return founderRoleLoc(source,target.nth||0);
  if(target.kind==='faq')return faqLoc(source,target.index,target.part);
  throw new Error('Unknown copy target.');
}
function readField(source,field){const l=locate(source,field.target);return decodeHtml(l.raw)}
function patchField(source,field,value){
  const l=locate(source,field.target); if(l.virtual)throw new Error('Virtual fields are patched separately.');
  const clean=String(value??'').replace(/\u0000/g,'').slice(0,field.max||12000);
  const encoded=l.attr?encodeAttr(clean):encodeText(clean,Boolean(field.target.multiline));
  return source.slice(0,l.start)+encoded+source.slice(l.end);
}

function i18nBounds(source){
  const marker='var T=[';const at=source.indexOf(marker);if(at<0)throw new Error('Could not locate i18n dictionary.');
  const open=source.indexOf('[',at);let depth=0,quote='',esc=false,rowStart=-1;const rows=[];
  for(let i=open;i<source.length;i++){
    const c=source[i];
    if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue}
    if(c==='"'||c==="'"){quote=c;continue}
    if(c==='['){depth++;if(depth===2)rowStart=i}
    else if(c===']'){
      if(depth===2&&rowStart>=0){const end=i+1;const raw=source.slice(rowStart,end);let value=null;try{value=Function(`"use strict";return (${raw});`)()}catch{}if(Array.isArray(value))rows.push({start:rowStart,end,value});rowStart=-1}
      depth--;if(depth===0)return {open,close:i+1,rows};
    }
  }
  throw new Error('Could not bound i18n dictionary.');
}
function translationsFor(i18n,en){
  const b=i18nBounds(i18n);const row=b.rows.find(r=>String(r.value[0])===String(en));
  const vals={};LANGS.forEach((l,i)=>vals[l]=String(row?.value?.[i]??(i===0?en:'')));
  return {values:vals,exists:Boolean(row)};
}
function upsertTranslation(i18n,oldEn,values){
  const b=i18nBounds(i18n);const existing=b.rows.find(r=>String(r.value[0])===String(oldEn));
  const row=LANGS.map((l,i)=>String(values?.[l]??(i===0?oldEn:'')));
  if(existing){return i18n.slice(0,existing.start)+JSON.stringify(row)+i18n.slice(existing.end)}
  const insert=b.close-1;const prefix=i18n.slice(b.open+1,insert).trim()? ',\n':'';
  return i18n.slice(0,insert)+prefix+JSON.stringify(row)+i18n.slice(insert);
}

async function loadPage(pageId){
  await ensureDraft();const page=PAGES.find(p=>p.id===pageId)||PAGES[0];
  const primary=await getFile(page.files[0]);const i18n=(await getFile('i18n.js')).text;
  const fields=[];
  for(const f of page.fields){
    const en=readField(primary.text,f);
    const tr=f.translate?translationsFor(i18n,en):{values:{en},exists:false};
    fields.push({id:f.id,label:f.label,group:f.group,type:f.type,max:f.max,note:f.note,translate:f.translate,values:tr.values});
  }
  return {page:{id:page.id,label:page.label,url:page.url,description:page.description,fields},pages:PAGES.map(p=>({id:p.id,label:p.label,url:p.url,description:p.description}))};
}

async function savePage(pageId,inputValues){
  await ensureDraft();const page=PAGES.find(p=>p.id===pageId);if(!page)throw new Error('Unknown page.');
  const loaded={};for(const path of [...new Set([...page.files,'i18n.js'])])loaded[path]=(await getFile(path)).text;
  let i18n=loaded['i18n.js'];
  const primaryOriginal=loaded[page.files[0]];
  const faqUpdates=[];
  for(const f of page.fields){
    if(!inputValues||!inputValues[f.id])continue;
    const oldEn=readField(primaryOriginal,f);
    const submitted=inputValues[f.id]||{};
    const newEn=String(submitted.en??oldEn).replace(/\u0000/g,'').slice(0,f.max||12000);
    if(f.translate){
      const oldTr=translationsFor(i18n,oldEn).values;
      const vals={};LANGS.forEach(l=>vals[l]=String(submitted[l]??oldTr[l]??(l==='en'?newEn:'')));vals.en=newEn;
      if(newEn===oldEn)i18n=upsertTranslation(i18n,oldEn,vals);
      else i18n=upsertTranslation(i18n,newEn,vals);
    }
    if(f.target.kind==='faq'){faqUpdates.push({field:f,value:newEn});continue}
    for(const path of page.files){loaded[path]=patchField(loaded[path],f,newEn)}
  }
  if(faqUpdates.length){
    for(const path of page.files){
      const arr=contactFaqArray(loaded[path]);const next=arr.value;
      for(const u of faqUpdates){if(next[u.field.target.index])next[u.field.target.index][u.field.target.part]=u.value}
      loaded[path]=loaded[path].slice(0,arr.start)+JSON.stringify(next,null,0)+loaded[path].slice(arr.end);
    }
  }
  loaded['i18n.js']=i18n;
  const files=[...page.files.map(path=>({path,content:loaded[path]})),{path:'i18n.js',content:i18n}];
  await commitFiles(files,`Update site copy: ${page.label}`);
  return loadPage(page.id);
}

export async function handler(event){
  if(event.httpMethod!=='POST')return json(405,{ok:false,error:'Method not allowed.'});
  if(!ready())return json(503,{ok:false,error:'SuDu Control copy editor is not connected.'});
  const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
  if(!verifySession(token))return json(401,{ok:false,error:'Your Control session has expired. Sign in again.'});
  let body={};try{body=JSON.parse(event.body||'{}')}catch{return json(400,{ok:false,error:'Invalid request.'})}
  try{
    if(body.action==='pages')return json(200,{ok:true,...await loadPage(body.pageId||'home')});
    if(body.action==='save')return json(200,{ok:true,...await savePage(body.pageId,body.values||{})});
    return json(400,{ok:false,error:'Unknown copy action.'});
  }catch(e){console.error('SuDu Control copy:',e);return json(e.status===404?404:500,{ok:false,error:e.message||'Copy request failed.'})}
}

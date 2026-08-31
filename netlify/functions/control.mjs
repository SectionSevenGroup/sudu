import crypto from 'node:crypto';

const OWNER = process.env.SUDU_GITHUB_OWNER || 'SectionSevenGroup';
const REPO = process.env.SUDU_GITHUB_REPO || 'sudu';
const BASE = process.env.SUDU_GITHUB_BASE || 'main';
const DRAFT = process.env.SUDU_GITHUB_DRAFT || 'control/content-draft';
const NETLIFY_SITE = process.env.SUDU_NETLIFY_SITE || 'sudustudioarchitecture';
const GH = 'https://api.github.com';

const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  },
  body: JSON.stringify(body),
});

const envReady = () => Boolean(process.env.GITHUB_TOKEN && process.env.SUDU_CONTROL_PASSWORD && process.env.SUDU_CONTROL_SESSION_SECRET);
const b64url = value => Buffer.from(value).toString('base64url');
const safeEqual = (a, b) => {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};

function signSession() {
  const payload = b64url(JSON.stringify({exp: Date.now() + 12 * 60 * 60 * 1000}));
  const sig = crypto.createHmac('sha256', process.env.SUDU_CONTROL_SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifySession(token = '') {
  try {
    const [payload, sig] = token.split('.'); if (!payload || !sig) return false;
    const want = crypto.createHmac('sha256', process.env.SUDU_CONTROL_SESSION_SECRET).update(payload).digest('base64url');
    if (!safeEqual(sig, want)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(data.exp) > Date.now();
  } catch { return false; }
}

async function gh(path, options = {}) {
  const r = await fetch(`${GH}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sudu-control',
      ...(options.headers || {}),
    },
  });
  const text = await r.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) { const e = new Error(data?.message || `GitHub request failed (${r.status})`); e.status = r.status; e.data = data; throw e; }
  return data;
}

async function refSha(branch) {
  const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`);
  return ref.object.sha;
}
async function ensureDraft() {
  try { return await refSha(DRAFT); }
  catch (e) {
    if (e.status !== 404) throw e;
    const sha = await refSha(BASE);
    await gh(`/repos/${OWNER}/${REPO}/git/refs`, {method:'POST', body:JSON.stringify({ref:`refs/heads/${DRAFT}`,sha})});
    return sha;
  }
}
async function resetDraft() {
  const sha = await refSha(BASE);
  try { await ensureDraft(); await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${encodeURIComponent(DRAFT)}`, {method:'PATCH', body:JSON.stringify({sha,force:true})}); }
  catch (e) { if (e.status !== 404) throw e; }
  return sha;
}

async function getFile(path, ref = DRAFT) {
  const f = await gh(`/repos/${OWNER}/${REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
  return {text:Buffer.from((f.content || '').replace(/\n/g,''),'base64').toString('utf8'), sha:f.sha};
}

async function commitFiles(files, message) {
  const parent = await ensureDraft();
  const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${parent}`);
  const entries = [];
  for (const f of files) {
    const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method:'POST', body:JSON.stringify({content:f.content,encoding:f.encoding || 'utf-8'})
    });
    entries.push({path:f.path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, {method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree:entries})});
  const next = await gh(`/repos/${OWNER}/${REPO}/git/commits`, {method:'POST',body:JSON.stringify({message,tree:tree.sha,parents:[parent]})});
  await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${encodeURIComponent(DRAFT)}`, {method:'PATCH',body:JSON.stringify({sha:next.sha,force:false})});
  return next.sha;
}

function objectBounds(source, prefix, closingIndent = '  ') {
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`Could not locate ${prefix}`);
  const open = source.indexOf('{', start); let depth = 0, quote = '', esc = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (esc) esc=false; else if (c==='\\') esc=true; else if (c===quote) quote=''; continue; }
    if (c==='"' || c==="'" || c==='`') { quote=c; continue; }
    if (c==='{') depth++; else if (c==='}' && --depth===0) return {start, open, end:i+1};
  }
  throw new Error(`Could not find end of ${prefix}`);
}
function parseObject(source, prefix) {
  const b = objectBounds(source,prefix); const raw=source.slice(b.open,b.end);
  return Function(`"use strict"; return (${raw});`)();
}
function replaceObject(source, prefix, value, indent = '  ') {
  const b=objectBounds(source,prefix); const formatted=JSON.stringify(value,null,2).replace(/\n/g,`\n${indent}`);
  return source.slice(0,b.open)+formatted+source.slice(b.end);
}
function replaceArray(source, prefix, value) {
  const start=source.indexOf(prefix); if(start<0)throw new Error(`Could not locate ${prefix}`);
  const open=source.indexOf('[',start);let depth=0,quote='',esc=false;
  for(let i=open;i<source.length;i++){const c=source[i];if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue}if(c==='"'||c==="'"){quote=c;continue}if(c==='[')depth++;else if(c===']'&&--depth===0){return source.slice(0,open)+JSON.stringify(value)+source.slice(i+1)}}
  throw new Error(`Could not find end of ${prefix}`);
}

function projectPayload(DATA, order) {
  return order.map(slug => ({slug,...DATA[slug]})).filter(p=>p.title);
}
function cleanProject(input) {
  const cleanString = (v,max=12000) => String(v ?? '').replace(/\u0000/g,'').slice(0,max);
  const slug = cleanString(input.slug,80).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  if (!slug) throw new Error('A valid project slug is required.');
  const groups = Array.isArray(input.groups) ? input.groups.slice(0,20).map(g=>({
    head:cleanString(g.head,180), sub:cleanString(g.sub,240), ...(g.small?{small:true}:{}),
    images:Array.isArray(g.images)?g.images.map(x=>cleanString(x,300).replace(/^\//,'')).filter(Boolean).slice(0,80):[]
  })) : [];
  const related = Array.isArray(input.related) ? input.related.slice(0,12).map(r=>({name:cleanString(r.name,180),meta:cleanString(r.meta,180),key:cleanString(r.key,80)})).filter(r=>r.key) : [];
  return {
    slug,
    project:{
      eyebrow:cleanString(input.eyebrow,160), title:cleanString(input.title,180), location:cleanString(input.location,180),
      scope:cleanString(input.scope,260), status:cleanString(input.status,140), counter:'', lede:cleanString(input.lede,1200),
      body:cleanString(input.body,12000), heroSrc:cleanString(input.heroSrc,300).replace(/^\//,''), next:'', groups, related,
    },
    heroDims:Array.isArray(input.heroDims)&&input.heroDims.length===2?[Math.max(1,Number(input.heroDims[0])||1),Math.max(1,Number(input.heroDims[1])||1)]:null,
  };
}

async function ensurePR() {
  const q = await gh(`/repos/${OWNER}/${REPO}/pulls?state=open&head=${encodeURIComponent(`${OWNER}:${DRAFT}`)}&base=${encodeURIComponent(BASE)}&per_page=10`);
  if (q[0]) return q[0];
  const compare = await gh(`/repos/${OWNER}/${REPO}/compare/${encodeURIComponent(BASE)}...${encodeURIComponent(DRAFT)}`);
  if (!compare.ahead_by) return null;
  return gh(`/repos/${OWNER}/${REPO}/pulls`, {method:'POST',body:JSON.stringify({title:'SuDu Control — content updates',head:DRAFT,base:BASE,body:'Changes created through the private SuDu / Control interface. Review the Netlify deploy preview before publishing.',draft:false})});
}
async function status() {
  await ensureDraft();
  const compare = await gh(`/repos/${OWNER}/${REPO}/compare/${encodeURIComponent(BASE)}...${encodeURIComponent(DRAFT)}`);
  let pr = null; if (compare.ahead_by) pr = await ensurePR();
  return {
    hasChanges:compare.ahead_by>0,
    aheadBy:compare.ahead_by || 0,
    changedFiles:(compare.files||[]).length,
    prNumber:pr?.number || null,
    prUrl:pr?.html_url || null,
    previewUrl:pr?.number ? `https://deploy-preview-${pr.number}--${NETLIFY_SITE}.netlify.app/control/` : null,
  };
}

async function bootstrap() {
  await ensureDraft();
  const [{text:projectSrc},{text:workSrc}] = await Promise.all([getFile('project.html'),getFile('work.html')]);
  const DATA=parseObject(projectSrc,'static DATA =');
  const orderMatch=/const order = \[([\s\S]*?)\];/.exec(workSrc); if(!orderMatch)throw new Error('Could not read project order.');
  const order=Function(`"use strict"; return ([${orderMatch[1]}]);`)();
  return {projects:projectPayload(DATA,order),order,status:await status()};
}

async function saveProject(inputProject, inputOrder) {
  await ensureDraft();
  const [{text:projectSrc},{text:workSrc}] = await Promise.all([getFile('project.html'),getFile('work.html')]);
  const DATA=parseObject(projectSrc,'static DATA ='); const DIMS=parseObject(projectSrc,'static DIMS =');
  const {slug,project,heroDims}=cleanProject(inputProject);
  const existed=Boolean(DATA[slug]);
  if (!existed && Object.keys(DATA).includes(slug)) throw new Error('That project URL already exists.');
  DATA[slug]={...(DATA[slug]||{}),...project};
  let order=Array.isArray(inputOrder)?inputOrder.map(x=>String(x)).filter(x=>DATA[x]):[];
  if(!order.includes(slug))order.push(slug);
  for(const key of Object.keys(DATA))if(!order.includes(key))order.push(key);
  order=order.filter((x,i,a)=>a.indexOf(x)===i&&DATA[x]);
  order.forEach((key,i)=>{DATA[key].counter=`${String(i+1).padStart(2,'0')} / ${order.length}`;DATA[key].next=order[(i+1)%order.length]});
  if(heroDims&&DATA[slug].heroSrc)DIMS[DATA[slug].heroSrc]=heroDims;

  let nextProject=replaceObject(projectSrc,'static DATA =',DATA,'  ');
  nextProject=replaceObject(nextProject,'static DIMS =',DIMS,'  ');
  let nextWork=replaceArray(workSrc,'const order =',order);
  const names={};
  for(const key of order){const d=DATA[key];names[key]={eyebrow:d.eyebrow,title:d.title,location:d.location,thumb:d.heroSrc};}
  nextWork=replaceObject(nextWork,'const names =',names,'    ');
  await commitFiles([{path:'project.html',content:nextProject},{path:'work.html',content:nextWork}],`${existed?'Update':'Add'} project: ${DATA[slug].title}`);
  const s=await status(); return {projects:projectPayload(DATA,order),order,status:s};
}

function imagePath(slug, role, fileName, mime) {
  const extMap={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}; const ext=extMap[mime] || (String(fileName).split('.').pop()||'jpg').toLowerCase();
  if(!['jpg','jpeg','png','webp'].includes(ext))throw new Error('Unsupported image format.');
  const base=String(fileName||'image').replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,45)||'image';
  const stamp=Date.now().toString(36); return `images/${slug}-${role}-${base}-${stamp}.${ext==='jpeg'?'jpg':ext}`;
}
async function upload({slug,role,file}) {
  slug=String(slug||'project').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  if(!file?.base64||!file?.type)throw new Error('No image was supplied.');
  const bytes=Buffer.from(file.base64,'base64'); if(bytes.length>12*1024*1024)throw new Error('Image exceeds the 12 MB Control upload limit.');
  const path=imagePath(slug,role==='hero'?'hero':'image',file.name,file.type);
  await commitFiles([{path,content:file.base64,encoding:'base64'}],`Upload project image: ${path.split('/').pop()}`);
  await ensurePR(); return {path};
}

async function publish() {
  const s=await status(); if(!s.hasChanges)return {status:s};
  const pr=await ensurePR();
  const head=await refSha(DRAFT);
  const merged=await gh(`/repos/${OWNER}/${REPO}/pulls/${pr.number}/merge`, {method:'PUT',body:JSON.stringify({merge_method:'squash',sha:head,commit_title:'Publish SuDu Control changes'})});
  if(!merged.merged)throw new Error(merged.message||'GitHub did not merge the Control changes.');
  await resetDraft(); return {status:await status(),mergeSha:merged.sha};
}
async function discard() {
  const pulls=await gh(`/repos/${OWNER}/${REPO}/pulls?state=open&head=${encodeURIComponent(`${OWNER}:${DRAFT}`)}&base=${encodeURIComponent(BASE)}&per_page=10`);
  for(const pr of pulls)await gh(`/repos/${OWNER}/${REPO}/pulls/${pr.number}`,{method:'PATCH',body:JSON.stringify({state:'closed'})});
  await resetDraft(); return {status:await status()};
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405,{ok:false,error:'Method not allowed.'},{Allow:'POST'});
  let body={}; try{body=JSON.parse(event.body||'{}')}catch{return json(400,{ok:false,error:'Invalid request.'})}
  if(body.action==='login'){
    if(!envReady())return json(503,{ok:false,error:'SuDu Control still needs its private Netlify credentials configured.'});
    if(!safeEqual(body.password||'',process.env.SUDU_CONTROL_PASSWORD))return json(401,{ok:false,error:'Incorrect password.'});
    return json(200,{ok:true,token:signSession()});
  }
  if(!envReady())return json(503,{ok:false,error:'SuDu Control is installed but not connected. Configure GITHUB_TOKEN, SUDU_CONTROL_PASSWORD and SUDU_CONTROL_SESSION_SECRET in Netlify.'});
  const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
  if(!verifySession(token))return json(401,{ok:false,error:'Your Control session has expired. Sign in again.'});
  try{
    if(body.action==='verify')return json(200,{ok:true});
    if(body.action==='bootstrap')return json(200,{ok:true,...await bootstrap()});
    if(body.action==='status')return json(200,{ok:true,status:await status()});
    if(body.action==='upload')return json(200,{ok:true,...await upload(body)});
    if(body.action==='saveProject')return json(200,{ok:true,...await saveProject(body.project,body.order)});
    if(body.action==='publish')return json(200,{ok:true,...await publish()});
    if(body.action==='discard')return json(200,{ok:true,...await discard()});
    return json(400,{ok:false,error:'Unknown Control action.'});
  }catch(e){console.error('SuDu Control:',e);return json(e.status===404?404:500,{ok:false,error:e.message||'Control request failed.'})}
}

import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const out = '/tmp/tool-footer-review';
mkdirSync(out, { recursive: true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.mp3':'audio/mpeg' };
const server = createServer((req,res) => {
  let name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file = resolve(root, '.' + name);
  if (!file.startsWith(root + '/') && file !== root) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file += '/index.html';
  if (!existsSync(file) && existsSync(file+'.html')) file += '.html';
  if (!existsSync(file)) { res.writeHead(404).end(); return; }
  const wasm = name.startsWith('/play/stack') || name.startsWith('/play/blocks/');
  res.setHeader('Content-Type',mime[extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control','no-store');
  if (extname(file) === '.html') res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'${wasm ? " 'wasm-unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'`);
  res.end(readFileSync(file));
});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
const base = process.env.SUDU_BASE_URL || 'http://127.0.0.1:8765';
const results=[];
function check(ok, message) { if (!ok) throw new Error(message); }
const pages=[['home','/'],['stack','/play/stack'],['blocks','/play/blocks/'],['sketch','/sketch/']];
const themes=[['Off white','#F3F1EA',[243,241,234]],['Charcoal','#121110',[18,17,16]],['Burnt','#C0431F',[192,67,31]]];
const boxes = () => {
  const selectors=['#suduBar','#langSwitch','#musicPill','#dmSwatches'];
  return Object.fromEntries(selectors.map(sel=>{
    const e=document.querySelector(sel), r=e.getBoundingClientRect(),s=getComputedStyle(e);
    return [sel,{x:r.x,y:r.y,w:r.width,h:r.height,bg:s.backgroundColor,colour:s.color,border:s.borderTopWidth}];
  }));
};
try {
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await type.launch(engine==='chromium' ? {args:['--enable-unsafe-swiftshader']} : {});
  for (const [width,height] of [[390,700],[320,568],[768,1024],[1440,900]]) {
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:width<769,hasTouch:width<769});
   const page=await context.newPage();
   const reference={};
   for(const [name,path] of pages) {
    const entry={engine,width,height,name,checks:[],errors:[]}; results.push(entry);
    const errors=[]; const onError=e=>errors.push(e.message);
    page.on('pageerror',onError);
    try {
     await page.goto(base+path,{waitUntil:'load',timeout:30000});
     await page.waitForSelector('#suduBar #audioToggle');
     check(await page.locator('#suduBar').count()===1,'Duplicate shared bar');
     for (const sel of ['#langSwitch','#musicPill','#dmSwatches']) check(await page.locator('#suduBar '+sel).count()===1,`${sel} missing`);
     if(name==='stack'||name==='blocks') {
      await page.waitForFunction(()=>!document.querySelector('.stack-loading,.massing-loading'),{},{timeout:20000});
     }
     for(const [label,hex,rgb] of themes) {
      await page.evaluate(colour=>window.suduTheme.apply(colour),hex);
      await page.waitForTimeout(650);
      const actual=await page.evaluate(boxes);
      if(name==='home') reference[hex]=actual;
      else for(const sel of Object.keys(actual)) {
       const expected=reference[hex][sel];
       for(const axis of ['x','y','w','h']) check(Math.abs(actual[sel][axis]-expected[axis])<.6,`${label} ${sel} ${axis} drift: ${actual[sel][axis]} vs ${expected[axis]}`);
       check(actual[sel].bg===expected.bg,`${label} ${sel} background mismatch`);
       check(actual[sel].colour===expected.colour,`${label} ${sel} ink mismatch`);
       check(actual[sel].border===expected.border,`${label} ${sel} border mismatch`);
      }
      const shot=await page.screenshot({path:`${out}/${engine}-${width}-${name}-${label.replaceAll(' ','-')}.png`});
      if(name==='stack'||name==='blocks') {
       const stage=await page.locator(name==='stack'?'#stack-stage':'#massing-stage').boundingBox();
       const image=PNG.sync.read(shot);
       const sample=(Math.floor(stage.y+stage.height*.55)*image.width+Math.floor(stage.x+5))*4;
       const pixel=[...image.data.subarray(sample,sample+3)];
       check(pixel.every((v,i)=>Math.abs(v-rgb[i])<=3),`${label} canvas stayed wrong colour: ${pixel}`);
      }
      entry.checks.push(`${label}: footer geometry, palette and canvas`);
     }
     await page.reload({waitUntil:'load'});
     check(await page.evaluate(()=>localStorage.getItem('sudu-dm-bg'))==='#C0431F','Theme preference lost');
     check(await page.evaluate(()=>document.documentElement.classList.contains('dmwarm')),'Theme not restored');
     if(name==='stack'&&width===390) {
      await page.locator('#stack-player-input').fill('Joe');
      await page.locator('.stack-player-add').click();
      await page.locator('#stack-player-input').evaluate(e=>e.blur());
      check(await page.locator('#stack-player-list li').count()===1,'Name not added');
      const gap=await page.evaluate(()=>document.querySelector('.stack-instruction').getBoundingClientRect().top-document.querySelector('.stack-player-form').getBoundingClientRect().bottom);
      check(gap>=4&&gap<=20,`Name/instruction spacing not compact: ${gap}`);
      entry.checks.push('Name entry adds player; compact spacing');
     }
     if(name==='sketch'&&width===390) {
      await page.locator('#sketchToolsToggle').click();
      check(await page.locator('#sketchToolsToggle').getAttribute('aria-expanded')==='true','Drawing tools do not open');
      await page.locator('#sketchToolsToggle').click();
      entry.checks.push('Drawing tools still open separately above rail');
     }
     if(width===390) {
      await page.locator('#audioToggle').click();
      await page.waitForFunction(()=>document.querySelector('#audioToggle').getAttribute('data-playing')==='true',{},{timeout:15000});
      await page.locator('#trackNext').click();
      await page.waitForTimeout(900);
      check(await page.locator('#audioToggle').getAttribute('data-playing')==='true','Next track did not play');
      await page.locator('#audioToggle').click();
      check(await page.locator('#audioToggle').getAttribute('data-playing')==='false','Music did not pause');
      entry.checks.push('Music play, next and pause');
     }
     check(errors.length===0,errors.join('; '));
    } catch(e) { entry.errors.push(e.message); }
    page.off('pageerror',onError);
    console.log(JSON.stringify(entry));
   }
   await context.close();
  }
  await browser.close();
 }
} finally {
 server.close();
 writeFileSync(out+'/report.json',JSON.stringify(results,null,2));
}
const failed=results.filter(r=>r.errors.length);
console.log(`${results.length-failed.length}/${results.length} page/viewport/browser reviews passed`);
process.exitCode=failed.length?1:0;

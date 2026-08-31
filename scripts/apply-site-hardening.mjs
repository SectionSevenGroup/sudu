#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (f) => join(root, f);
const read = (f) => readFileSync(p(f), 'utf8');
const write = (f, s) => writeFileSync(p(f), s);
const today = new Date().toISOString().slice(0, 10);

const PRIMARY = ['index.html', 'work.html', 'studio.html', 'contact.html', 'project.html'];
const SERVICES = [
  'custom-home-design-edmonton.html',
  'renovations-additions-edmonton.html',
  'restaurant-hospitality-design-edmonton.html',
  'commercial-retail-design-edmonton.html',
];

function replaceOnce(src, re, replacement, label) {
  if (!re.test(src)) throw new Error(`Could not locate ${label}`);
  re.lastIndex = 0;
  return src.replace(re, replacement);
}

function normalizeInternalUrls(html) {
  const pairs = [
    ['index.html', '/'],
    ['./index.html', '/'],
    ['work.html', '/work'],
    ['./work.html', '/work'],
    ['/work.html', '/work'],
    ['studio.html', '/studio'],
    ['./studio.html', '/studio'],
    ['/studio.html', '/studio'],
    ['contact.html', '/contact'],
    ['./contact.html', '/contact'],
    ['/contact.html', '/contact'],
    ['custom-home-design-edmonton.html', '/custom-home-design-edmonton'],
    ['renovations-additions-edmonton.html', '/renovations-additions-edmonton'],
    ['restaurant-hospitality-design-edmonton.html', '/restaurant-hospitality-design-edmonton'],
    ['commercial-retail-design-edmonton.html', '/commercial-retail-design-edmonton'],
  ];
  for (const [from, to] of pairs) {
    html = html.replaceAll(`href="${from}"`, `href="${to}"`);
  }
  html = html.replace(/href="\.\/"/g, 'href="/"');
  html = html.replace(/href="project\.html\?p=([a-z0-9-]+)"/g, 'href="/work/$1/"');
  html = html.replace(/href="\/project\.html\?p=([a-z0-9-]+)"/g, 'href="/work/$1/"');

  const absolute = [
    ['https://sudu.studio/work.html', 'https://sudu.studio/work'],
    ['https://sudu.studio/studio.html', 'https://sudu.studio/studio'],
    ['https://sudu.studio/contact.html', 'https://sudu.studio/contact'],
    ['https://sudu.studio/custom-home-design-edmonton.html', 'https://sudu.studio/custom-home-design-edmonton'],
    ['https://sudu.studio/renovations-additions-edmonton.html', 'https://sudu.studio/renovations-additions-edmonton'],
    ['https://sudu.studio/restaurant-hospitality-design-edmonton.html', 'https://sudu.studio/restaurant-hospitality-design-edmonton'],
    ['https://sudu.studio/commercial-retail-design-edmonton.html', 'https://sudu.studio/commercial-retail-design-edmonton'],
  ];
  for (const [from, to] of absolute) html = html.replaceAll(from, to);
  return html;
}

const studioBefore = read('studio.html');
const sharedHelmet = (studioBefore.match(/<helmet>[\s\S]*?<\/helmet>/) || [])[0];
if (!sharedHelmet) throw new Error('Could not extract current Studio helmet');
const sharedRevealLogic = (studioBefore.match(/<script type="text\/x-dc" data-dc-script>[\s\S]*?<\/script>/) || [])[0];
if (!sharedRevealLogic) throw new Error('Could not extract current Studio reveal engine');

// Dedicated team illustration reveal. The element occupies its final 1:1 slot
// from the first layout; only the pixels resolve. It deliberately lives outside
// the generic data-reveal system so one element has one motion owner.
write('js/studio-team-reveal.js', `(function(){
  if(window.__suduTeamRevealWired)return;
  window.__suduTeamRevealWired=1;
  var REDUCED=window.matchMedia('(prefers-reduced-motion: reduce)');
  var DELAY=250,DUR=1900,EASE='cubic-bezier(.16,1,.3,1)';
  function get(){return document.getElementById('teamIllustration');}
  function settle(im){if(!im)return;im.style.transition='none';im.style.opacity='1';im.setAttribute('data-team-revealed','1');}
  function run(){
    var im=get(); if(!im)return;
    if(im.getAttribute('data-team-revealed')==='1'){settle(im);return;}
    if(REDUCED.matches){settle(im);return;}
    if(im.getAttribute('data-team-revealing')==='1')return;
    im.setAttribute('data-team-revealing','1');
    im.style.transition='none'; im.style.opacity='0';
    var decoded; try{decoded=im.decode();}catch(e){decoded=Promise.resolve();}
    Promise.resolve(decoded).catch(function(){}).then(function(){
      requestAnimationFrame(function(){setTimeout(function(){
        var live=get(); if(!live)return;
        live.style.transition='opacity '+DUR+'ms '+EASE;
        live.style.opacity='1';
        setTimeout(function(){var x=get();if(x){x.setAttribute('data-team-revealed','1');x.removeAttribute('data-team-revealing');x.style.transition='';x.style.opacity='1';}},DUR+80);
      },DELAY);});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){if(!window.__suduVisited)run();},{once:true});
  else if(!window.__suduVisited)run();
  document.addEventListener('sudu:navigation-ready',run);
  document.addEventListener('turbo:before-cache',function(){var im=get();if(im)settle(im);});
})();\n`);

// Extend the shared rail to the indexable service landing pages.
let rail = read('css/rail.css');
if (!rail.includes('section[data-screen-label="Service Intro"]')) {
  rail = rail.replace(
    'section[data-screen-label="Start a Project"] {',
    'section[data-screen-label="Start a Project"],\nsection[data-screen-label="Service Intro"],\nsection[data-screen-label="Service Detail"],\nsection[data-screen-label="Related"] {'
  );
  write('css/rail.css', rail);
}

// Stamp the service pages too so the now-shared shell cannot run stale JS/CSS.
let stamp = read('scripts/stamp-assets.mjs');
stamp = stamp.replace(
  "const PAGES = ['index.html', 'work.html', 'studio.html', 'contact.html', 'project.html'];",
  "const PAGES = ['index.html', 'work.html', 'studio.html', 'contact.html', 'project.html', 'custom-home-design-edmonton.html', 'renovations-additions-edmonton.html', 'restaurant-hospitality-design-edmonton.html', 'commercial-retail-design-edmonton.html'];"
);
write('scripts/stamp-assets.mjs', stamp);

// Main pages: extensionless internal URLs and canonical destinations.
for (const file of PRIMARY) {
  let html = normalizeInternalUrls(read(file));
  write(file, html);
}

// Studio team illustration: intrinsic geometry + dedicated opacity owner.
let studio = read('studio.html');
studio = studio.replace(
  /<img data-reveal data-motion="major" src="images\/team-illustration-alpha\.png" alt="Line portrait of the three SuDu Studio founders" decoding="async" style="([^"]*)">/,
  '<img id="teamIllustration" src="images/team-illustration-alpha.png" alt="Line portrait of the three SuDu Studio founders" width="2048" height="2048" decoding="async" fetchpriority="high" style="$1; opacity:0;">'
);
if (!studio.includes('js/studio-team-reveal.js')) {
  studio = studio.replace(
    /(<script src="js\/page-arrival\.js[^>]*><\/script>)/,
    '$1\n<script src="js/studio-team-reveal.js" defer></script>'
  );
}
write('studio.html', studio);

// Project generator source is a template, never a public destination.
let project = read('project.html');
project = project.replace(/<meta name="robots" content="(?:index, follow|noindex(?:,\s*follow)?)">/, '<meta name="robots" content="noindex, follow">');
project = project.replace(/<link rel="canonical" href="https:\/\/sudu\.studio\/project(?:\.html)?">\n?/, '');
project = project.replace(/<meta property="og:url" content="https:\/\/sudu\.studio\/project(?:\.html)?">\n?/, '');
write('project.html', project);

// Make the generator strip any template noindex form from real project pages.
let build = read('scripts/build-projects.mjs');
build = build.replace(
  "html = html.replace(/<meta name=\"robots\" content=\"noindex\">\\n/, '');",
  "html = html.replace(/<meta name=\"robots\" content=\"noindex(?:,\\s*follow)?\">\\n?/, '');"
);
write('scripts/build-projects.mjs', build);

const neutralHeader = `  <header id="suduNav" style="position:fixed; top:0; left:0; right:0; z-index:100; display:flex; align-items:flex-end; justify-content:space-between; gap:16px; padding:34px clamp(20px,4.5vw,64px) 30px; background:rgba(243,241,234,0.94);">
    <a href="/" data-turbo-preload style="display:flex; align-items:flex-end; gap:12px;">
      <img src="/images/sudu-mark.png" alt="SuDu Studio" style="height:38px; width:auto; display:block;">
    </a>
    <nav style="display:flex; align-items:flex-end; gap:clamp(16px,2.6vw,30px);">
      <a href="/work" data-turbo-preload style="font-size:13px; font-weight:500; line-height:1.4; padding-bottom:2px; border-bottom:1px solid transparent; transition:border-color .3s ease, color .3s ease;" style-hover="border-bottom-color:#E17B3E; color:#E17B3E;">Work</a>
      <a href="/studio" data-turbo-preload style="font-size:13px; font-weight:500; line-height:1.4; padding-bottom:2px; border-bottom:1px solid transparent; transition:border-color .3s ease, color .3s ease;" style-hover="border-bottom-color:#E17B3E; color:#E17B3E;">Studio</a>
      <a href="/contact" data-turbo-preload style="font-size:13px; font-weight:500; line-height:1.4; padding-bottom:2px; border-bottom:1px solid transparent; transition:border-color .3s ease, color .3s ease;" style-hover="border-bottom-color:#E17B3E; color:#E17B3E;">Contact</a>
    </nav>
  </header>`;

const currentCTA = `  <section data-screen-label="Start a Project" style="padding:clamp(48px,9vw,120px) clamp(20px,4.5vw,64px) clamp(48px,9vw,120px); border-top:1px solid rgba(23,22,19,0.13);">
    <div data-reveal data-motion="detail" style="display:flex; flex-direction:column; align-items:flex-start; gap:20px;">
      <h2 style="margin:0; font-size:clamp(28px,3.8vw,46px); font-weight:900; line-height:0.95; letter-spacing:-0.02em; text-transform:uppercase;">Start a project</h2>
      <a href="/contact" style="display:inline-flex; align-items:center; gap:0.3em; margin-top:6px; font-size:15px; font-weight:700; letter-spacing:0.02em; padding-bottom:4px; border-bottom:1px solid rgba(23,22,19,0.4); transition:color .35s ease, border-color .35s ease;" style-hover="color:#E17B3E; border-bottom-color:#E17B3E;">Get in touch</a>
    </div>
  </section>`;

const currentFooter = `  <footer style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px 24px; padding:20px clamp(20px,4.5vw,64px) 28px; border-top:1px solid rgba(23,22,19,0.13); font-family:'Urbanist', sans-serif; font-size:10.5px; color:#A6A399; padding-bottom:64px;">
    <div style="display:flex; align-items:center; gap:12px;">
      <img src="/images/sudu-mark.png" alt="SuDu Studio" style="height:19px; width:auto; display:block; opacity:0.85;">
      <span style="width:1px; height:14px; background:rgba(23,22,19,0.22);"></span>
      <span>&copy; 2026 SuDu Studio Architecture</span>
    </div>
    <span>Alberta</span>
  </footer>`;

function modernizeService(file) {
  let html = read(file);
  html = normalizeInternalUrls(html);

  // Bring indexable service pages into the same technical shell without changing
  // their SEO content architecture.
  if (!html.includes('css/rail.css')) {
    html = html.replace(
      /<script src="\.\/js\/support\.js(?:\?v=[^"]*)?"><\/script>/,
      '<link rel="stylesheet" href="/css/rail.css">\n<script src="/js/support.js"></script>\n<script src="/js/chrome-bar.js"></script>\n<script src="/js/turbo-boot.js" defer></script>\n<script src="https://unpkg.com/@hotwired/turbo@8.0.23/dist/turbo.es2017-umd.js" defer></script>\n<meta name="turbo-cache-control" content="no-preview">'
    );
  }
  html = replaceOnce(html, /<helmet>[\s\S]*?<\/helmet>/, sharedHelmet, `${file} helmet`);
  html = replaceOnce(html, /<header[\s\S]*?<\/header>/, neutralHeader, `${file} header`);
  html = html.replace(/<a href="\/contact" data-reveal[\s\S]*?Say hello[\s\S]*?<\/a>/, currentCTA);
  html = replaceOnce(html, /<footer[\s\S]*?<\/footer>/, currentFooter, `${file} footer`);
  html = replaceOnce(html, /<script type="text\/x-dc" data-dc-script>[\s\S]*?<\/script>/, sharedRevealLogic, `${file} reveal engine`);
  html = normalizeInternalUrls(html);
  write(file, html);
}
for (const file of SERVICES) modernizeService(file);

// Conservative public/professional wording: retain architecture as a service,
// but do not describe the studio generically as an "architecture firm" or every
// designer as an architect. Registered-person titles remain untouched.
function replaceText(file, pairs) {
  let html = read(file);
  for (const [a,b] of pairs) html = html.replaceAll(a,b);
  write(file, html);
}
replaceText('studio.html', [
  ['About Our Edmonton Architecture Firm | SuDu Studio', 'About SuDu Studio | Architecture + Interiors | Edmonton'],
]);
replaceText('contact.html', [
  ['Contact an Edmonton Architect | SuDu Studio', 'Contact SuDu Studio | Architecture + Interiors | Edmonton'],
  ['from concept studies to full architectural services.', 'from concept studies through architectural services delivered by registered professionals.'],
]);
replaceText('custom-home-design-edmonton.html', [
  ['Custom Home Design Edmonton | SuDu Studio Architecture', 'Custom Home Design Edmonton | SuDu Studio'],
  ['Custom home architects in Edmonton. SuDu Studio designs new residences from first concept to construction, across Alberta and Western Canada.', 'Custom home design in Edmonton. SuDu Studio develops new residences from first concept through delivery, with regulated architectural services provided through registered professionals.'],
]);
replaceText('renovations-additions-edmonton.html', [
  ['Renovations + Additions Edmonton | SuDu Studio Architecture', 'Renovation + Addition Design Edmonton | SuDu Studio'],
]);
replaceText('restaurant-hospitality-design-edmonton.html', [
  ['Restaurant + Hospitality Design Edmonton | SuDu Studio Architecture', 'Restaurant + Hospitality Design Edmonton | SuDu Studio'],
]);
replaceText('commercial-retail-design-edmonton.html', [
  ['Commercial + Retail Design Edmonton | SuDu Studio Architecture', 'Commercial + Retail Design Edmonton | SuDu Studio'],
]);

// Cache versioned code aggressively; keep source images revalidatable because
// filenames may be intentionally reused between atomic deploys. Netlify Image
// CDN inherits source-image headers.
let toml = read('netlify.toml');
if (!toml.includes('for = "/js/*"')) {
  toml += `\n# --- browser caching ---------------------------------------------------------\n[[headers]]\n  for = "/js/*"\n  [headers.values]\n    Cache-Control = "public, max-age=31536000, immutable"\n\n[[headers]]\n  for = "/css/*"\n  [headers.values]\n    Cache-Control = "public, max-age=31536000, immutable"\n\n[[headers]]\n  for = "/images/*"\n  [headers.values]\n    Cache-Control = "public, max-age=604800, must-revalidate"\n`;
  write('netlify.toml', toml);
}

// Regenerate static /work pages from the corrected source templates.
execFileSync(process.execPath, [p('scripts/build-projects.mjs')], { cwd: root, stdio: 'inherit' });

// Netlify Image CDN: responsive width selection + automatic WebP/AVIF content
// negotiation without storing derivative binaries in the repository.
function cdn(src, w, q=82) {
  return `/.netlify/images?url=${src}&amp;w=${w}&amp;q=${q}`;
}
function optimizeTag(tag, file) {
  const sm = /\ssrc="([^"]+)"/.exec(tag);
  if (!sm) return tag;
  let src = sm[1];
  if (/^(?:https?:|data:|\/\.netlify\/images|\{\{)/.test(src)) return tag;
  if (src.startsWith('images/')) src = '/' + src;
  if (!src.startsWith('/images/')) return tag;
  if (/(?:sudu-mark|favicon|icon-|logo\.)/i.test(src)) return tag;

  let widths=[480,800,1200,1600], sizes='(max-width: 720px) 100vw, 50vw', q=82;
  if (/hero-drawing/i.test(src)) { widths=[720,1200,1800]; sizes='97vw'; q=86; }
  else if (/team-illustration-alpha/i.test(src)) { widths=[480,680,1024,1360]; sizes='(max-width: 740px) 92vw, 680px'; q=86; }
  else if (/work\.html$/.test(file) || file==='work/index.html') { widths=[360,600,900,1200]; sizes='(max-width: 699px) 100vw, (max-width: 1099px) 50vw, (max-width: 1799px) 25vw, 20vw'; }
  else if (/^work\/.+\/index\.html$/.test(file) && tag.includes('data-sudu-project-hero')) { widths=[800,1200,1600,2200]; sizes='100vw'; q=84; }
  else if (SERVICES.includes(file)) { widths=[480,800,1200,1600]; sizes='(max-width: 720px) 100vw, 50vw'; }
  else if (file==='index.html') { widths=[480,800,1200,1600]; sizes='(max-width: 720px) 100vw, 50vw'; }

  const fallback = widths[Math.min(1,widths.length-1)];
  const set = widths.map(w=>`${cdn(src,w,q)} ${w}w`).join(', ');
  tag = tag.replace(/\ssrc="[^"]+"/, ` src="${cdn(src,fallback,q)}"`);
  if (/\ssrcset=/.test(tag)) tag = tag.replace(/\ssrcset="[^"]*"/, ` srcset="${set}"`);
  else tag = tag.replace('<img', `<img srcset="${set}" sizes="${sizes}"`);
  if (!/\ssizes=/.test(tag)) tag = tag.replace('<img', `<img sizes="${sizes}"`);
  if (/team-illustration-alpha/.test(src)) {
    if (!/\swidth=/.test(tag)) tag=tag.replace('<img','<img width="2048" height="2048"');
  }
  return tag;
}
function markProjectHero(html) {
  return html.replace(
    /(<div data-reveal data-motion="major"[^>]*>\s*)<img /,
    '$1<img data-sudu-project-hero="1" '
  );
}
function walk(dir, out=[]) {
  for (const name of readdirSync(dir)) {
    if (name==='.git') continue;
    const full=join(dir,name);
    const st=statSync(full);
    if(st.isDirectory()) walk(full,out);
    else if(name.endsWith('.html')) out.push(relative(root,full));
  }
  return out;
}
for (const file of walk(root)) {
  let html=read(file);
  if (/^work\/.+\/index\.html$/.test(file)) html=markProjectHero(html);
  html=html.replace(/<img\b[^>]*>/g,(tag)=>optimizeTag(tag,file));
  write(file,html);
}

// Canonical sitemap: extensionless top-level routes and real generated project
// URLs only. The project.html generator/source route is intentionally absent.
const buildSrc = read('project.html');
const ds = buildSrc.indexOf('static DATA = {');
const de = buildSrc.indexOf('\n  };', ds);
if(ds===-1||de===-1) throw new Error('Could not locate project DATA for sitemap');
const DATA = eval('(' + buildSrc.slice(ds+'static DATA ='.length,de+4).trim().replace(/;$/,'') + ')');
const urls = [
  '/', '/work', '/studio', '/contact',
  '/custom-home-design-edmonton', '/renovations-additions-edmonton',
  '/restaurant-hospitality-design-edmonton', '/commercial-retail-design-edmonton',
  ...Object.keys(DATA).map(s=>`/work/${s}/`),
];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u=>`  <url><loc>https://sudu.studio${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);

// Final normalization after generated files exist.
for (const file of walk(root)) {
  let html=read(file);
  html=normalizeInternalUrls(html);
  write(file,html);
}

console.log('SuDu hardening applied: canonical routes, Studio reveal, service shell, Image CDN, sitemap, cache headers.');

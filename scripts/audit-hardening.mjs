#!/usr/bin/env node
/**
 * SuDu STUDIO audit hardening pass.
 *
 * Deterministic, zero-invention corrections applied before the existing
 * project generator runs. The authored compositions stay intact while route
 * hygiene, Studio image geometry/reveal ownership, service-page shell drift,
 * SEO canonicals, responsive image delivery, project gallery rhythm and theme
 * surface classification are hardened.
 *
 * Idempotent: running twice produces the same files.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const write = (p, s) => writeFileSync(join(root, p), s);

const CORE = ['index.html','work.html','studio.html','contact.html','project.html'];
const SERVICES = [
  'custom-home-design-edmonton.html',
  'renovations-additions-edmonton.html',
  'restaurant-hospitality-design-edmonton.html',
  'commercial-retail-design-edmonton.html'
];
const HTML = [...CORE, ...SERVICES];

function extensionless(html) {
  return html
    // The query-param project route is retired; /work/<slug>/ is the page.
    // _redirects still 301s the old form, but nothing authored should emit it.
    .replace(/href="(?:\.\/|\/)?project\.html\?p=([A-Za-z0-9_-]+)"/g, 'href="/work/$1/"')
    .replaceAll('href="index.html"', 'href="/"')
    .replaceAll('href="./"', 'href="/"')
    .replaceAll('href="work.html"', 'href="/work"')
    .replaceAll('href="studio.html"', 'href="/studio"')
    .replaceAll('href="contact.html"', 'href="/contact"')
    .replaceAll('href="custom-home-design-edmonton.html"', 'href="/custom-home-design-edmonton"')
    .replaceAll('href="renovations-additions-edmonton.html"', 'href="/renovations-additions-edmonton"')
    .replaceAll('href="restaurant-hospitality-design-edmonton.html"', 'href="/restaurant-hospitality-design-edmonton"')
    .replaceAll('href="commercial-retail-design-edmonton.html"', 'href="/commercial-retail-design-edmonton"')
    .replaceAll('https://sudu.studio/work.html', 'https://sudu.studio/work')
    .replaceAll('https://sudu.studio/studio.html', 'https://sudu.studio/studio')
    .replaceAll('https://sudu.studio/contact.html', 'https://sudu.studio/contact')
    .replaceAll('https://sudu.studio/custom-home-design-edmonton.html', 'https://sudu.studio/custom-home-design-edmonton')
    .replaceAll('https://sudu.studio/renovations-additions-edmonton.html', 'https://sudu.studio/renovations-additions-edmonton')
    .replaceAll('https://sudu.studio/restaurant-hospitality-design-edmonton.html', 'https://sudu.studio/restaurant-hospitality-design-edmonton')
    .replaceAll('https://sudu.studio/commercial-retail-design-edmonton.html', 'https://sudu.studio/commercial-retail-design-edmonton');
}

function architectureIdentity(html, page) {
  if (page === 'studio.html') {
    html = html
      .replace('<title>About Our Edmonton Architecture Firm | SuDu Studio</title>', '<title>SuDu Studio Architecture | Registered Architecture Firm in Alberta</title>')
      .replace('content="Meet SuDu Studio: three founders with decades of experience designing custom homes, hospitality and commercial spaces in Edmonton and across Alberta."', 'content="Meet SuDu Studio Architecture, a registered Alberta architecture firm working across architecture, interiors and design direction."')
      .replace('<meta property="og:title" content="About Our Edmonton Architecture Firm | SuDu Studio">', '<meta property="og:title" content="SuDu Studio Architecture | Registered Architecture Firm in Alberta">')
      .replace('<meta property="og:description" content="Meet SuDu Studio: three founders with decades of experience designing custom homes, hospitality and commercial spaces in Edmonton and across Alberta.">', '<meta property="og:description" content="Meet SuDu Studio Architecture, a registered Alberta architecture firm working across architecture, interiors and design direction.">');
  }
  if (page === 'index.html') {
    html = html.replace('"name": "SuDu Studio",\n "legalName": "SuDu Studio Architecture"', '"name": "SuDu Studio Architecture",\n "legalName": "SuDu Studio Architecture"');
  }
  return html;
}

function addCoreShell(html) {
  if (!html.includes('css/rail.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="css/rail.css">\n<script src="js/chrome-bar.js"></script>\n<script src="js/turbo-boot.js" defer></script>\n<script src="js/vendor/turbo.es2017-umd.js" integrity="sha384-2ePXINFSJiSCWUJkjFJGYdr2kyM132s7uBi9k+JISp4P+AjN9DXn4H/1enWEHu36" defer></script>\n<meta name="turbo-cache-control" content="no-preview">\n</head>');
  }
  html = html.replace(/<header style=/g, '<header id="suduNav" style=');
  html = html.replace(/<a href="\/work"(?![^>]*data-turbo-preload)/g, '<a href="/work" data-turbo-preload');
  html = html.replace(/<a href="\/studio"(?![^>]*data-turbo-preload)/g, '<a href="/studio" data-turbo-preload');
  html = html.replace(/<a href="\/contact"(?![^>]*data-turbo-preload)/g, '<a href="/contact" data-turbo-preload');
  html = html.replace(/<a href="\/"(?![^>]*data-turbo-preload)/g, '<a href="/" data-turbo-preload');
  html = html.replace(/data-screen-label="Service Intro"(?![^>]*data-theme-surface)/g, 'data-screen-label="Service Intro" data-theme-surface="content"');
  html = html.replace(/data-screen-label="Service Detail"(?![^>]*data-theme-surface)/g, 'data-screen-label="Service Detail" data-theme-surface="content"');
  html = html.replace(/data-screen-label="Related"(?![^>]*data-theme-surface)/g, 'data-screen-label="Related" data-theme-surface="content"');
  html = html.replace(/<a href="\/contact" data-turbo-preload data-reveal/g, '<a href="/contact" data-turbo-preload data-screen-label="Start a Project" data-reveal');
  html = html.replace(/<a href="\/contact" data-reveal/g, '<a href="/contact" data-screen-label="Start a Project" data-reveal');
  html = html.replace(/<div style="font-size:clamp\(24px,3vw,38px\); font-weight:700; letter-spacing:-0\.03em; line-height:1;">Say hello<\/div>/g,
    '<div style="font-size:clamp(24px,3vw,38px); font-weight:700; letter-spacing:-0.03em; line-height:1;">Get in touch</div>');
  html = html.replace(/\s*<span style="font-size:clamp\(19px,2\.3vw,30px\);[^>]*>&#8250;&#8250;<\/span>/g, '');
  html = html.replaceAll("el.style.transform = 'translateY(20px)';", "el.style.transform = 'translateY(7px)';");
  html = html.replaceAll("'opacity 1.5s ' + ease + ', transform 1.7s ' + ease", "'opacity 1.0s ' + ease + ', transform 1.1s ' + ease");
  return html;
}

function studioReveal(html) {
  const old = '<img data-reveal data-motion="major" src="images/team-illustration-alpha.png" alt="Line portrait of the three SuDu Studio founders" decoding="async" style="width:min(680px,92%); height:auto; display:block; margin:0 0 clamp(12px,1.5vw,20px);">';
  const next = '<img id="studioTeamIllustration" src="images/team-illustration-alpha.png" srcset="/.netlify/images?url=/images/team-illustration-alpha.png&w=480&q=88 480w, /.netlify/images?url=/images/team-illustration-alpha.png&w=768&q=88 768w, /.netlify/images?url=/images/team-illustration-alpha.png&w=1080&q=88 1080w" sizes="(max-width:720px) 92vw, 680px" width="2048" height="2048" alt="Line portrait of the three SuDu Studio founders" loading="eager" fetchpriority="high" decoding="async" style="width:min(680px,92%); height:auto; aspect-ratio:1/1; display:block; margin:0 0 clamp(12px,1.5vw,20px); opacity:0; transition:opacity 1.9s cubic-bezier(.16,1,.3,1);">';
  html = html.replace(old, next);
  if (!html.includes('studioTeamIllustration.dataset.suduRevealOwned')) {
    html = html.replace('class Component extends DCLogic {\n  componentDidMount() {', `class Component extends DCLogic {\n  componentDidMount() {\n    const studioTeamIllustration = document.getElementById('studioTeamIllustration');\n    if (studioTeamIllustration && !studioTeamIllustration.dataset.suduRevealOwned) {\n      studioTeamIllustration.dataset.suduRevealOwned = '1';\n      let teamShown = false;\n      const showTeam = () => {\n        if (teamShown) return;\n        teamShown = true;\n        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) studioTeamIllustration.style.transition = 'none';\n        requestAnimationFrame(() => setTimeout(() => { studioTeamIllustration.style.opacity = '1'; }, 180));\n      };\n      const readyTeam = () => {\n        if (typeof studioTeamIllustration.decode === 'function') {\n          studioTeamIllustration.decode().then(showTeam).catch(showTeam);\n        } else showTeam();\n      };\n      if (studioTeamIllustration.complete && studioTeamIllustration.naturalWidth) readyTeam();\n      else {\n        studioTeamIllustration.addEventListener('load', readyTeam, { once:true });\n        studioTeamIllustration.addEventListener('error', showTeam, { once:true });\n      }\n    }`);
  }
  return html;
}

function projectSource(html) {
  html = html.replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex, follow">');
  html = html.replace('<link rel="canonical" href="https://sudu.studio/project.html">', '<link rel="canonical" href="https://sudu.studio/work">');
  html = html.replace('<meta property="og:url" content="https://sudu.studio/project.html">', '<meta property="og:url" content="https://sudu.studio/work">');
  html = html.replace(
    '<div data-reveal data-motion="detail" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(min({{ grp.minW }}px,100%), 1fr)); gap:clamp(16px,2vw,28px);">',
    '<div class="project-gallery-grid" data-reveal data-motion="detail" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:clamp(16px,2vw,28px);">'
  );
  html = html.replace(
    '<div style="aspect-ratio:4/3; overflow:hidden; background:{{ grp.bg }};">',
    '<div class="project-gallery-item" style="aspect-ratio:4/3; overflow:hidden; background:{{ grp.bg }};">'
  );
  html = html.replace(
    '<img src="{{ g.src }}" alt="{{ g.alt }}" loading="lazy" decoding="async"',
    '<img src="{{ g.src }}" srcset="/.netlify/images?url=/{{ g.src }}&w=480&q=82 480w, /.netlify/images?url=/{{ g.src }}&w=768&q=82 768w, /.netlify/images?url=/{{ g.src }}&w=1080&q=82 1080w, /.netlify/images?url=/{{ g.src }}&w=1440&q=82 1440w, /.netlify/images?url=/{{ g.src }}&w=1920&q=82 1920w" sizes="(max-width:720px) 100vw, 50vw" alt="{{ g.alt }}" loading="lazy" decoding="async"'
  );
  if (!html.includes('.project-gallery-grid > .project-gallery-item:first-child')) {
    html = html.replace('</style>', `\n  .project-gallery-grid > .project-gallery-item:first-child { grid-column:1 / -1; aspect-ratio:16/9 !important; }\n  @media (max-width:720px) { .project-gallery-grid { grid-template-columns:1fr !important; } .project-gallery-grid > .project-gallery-item { grid-column:auto !important; aspect-ratio:4/3 !important; } }\n</style>`);
  }
  return html;
}

function semanticTheme(html) {
  html = html.replace(/<([a-z][a-z0-9-]*)([^>]*?)style="([^"]*(?:#F3F1EA|243,241,234|243, 241, 234)[^"]*)"/gi,
    (m, tag, attrs, style) => attrs.includes('data-theme-surface=')
      ? m
      : `<${tag}${attrs}data-theme-surface="cream" style="${style}"`);

  const legacy = "var mark=function(){document.querySelectorAll('[style]').forEach(function(el){if(el.closest('#suduBar'))return;var bg=el.getAttribute('style')||'';if(bg.indexOf('F3F1EA')>-1||bg.indexOf('243, 241, 234')>-1||bg.indexOf('243,241,234')>-1){if(el.closest('section,header,footer'))el.classList.add('dm-flat');else el.classList.add('dm-wrap');}});};";
  const semantic = "var mark=function(){document.querySelectorAll('[data-theme-surface]').forEach(function(el){if(el.closest('#suduBar'))return;if(el.closest('section,header,footer'))el.classList.add('dm-flat');else el.classList.add('dm-wrap');});};";
  html = html.replaceAll(legacy, semantic);
  return html;
}

function responsiveImages(html) {
  return html.replace(/<img([^>]*?)src="(images\/(?!sudu-mark|hero-drawing|team-illustration|red-)[^"]+\.(?:jpg|jpeg|png))"([^>]*?)>/gi,
    (m, before, src, after) => {
      if (/srcset=/.test(m)) return m;
      const u = encodeURIComponent('/' + src);
      const srcset = [480,768,1080,1440,1920].map(w => `/.netlify/images?url=${u}&w=${w}&q=82 ${w}w`).join(', ');
      const sizes = /width:100%/.test(m) ? '(max-width:720px) 100vw, 50vw' : '100vw';
      return `<img${before}src="${src}" srcset="${srcset}" sizes="${sizes}"${after}>`;
    });
}

for (const p of HTML) {
  if (!existsSync(join(root,p))) continue;
  let html = read(p);
  html = extensionless(html);
  html = architectureIdentity(html, p);
  if (SERVICES.includes(p)) html = addCoreShell(html);
  if (p === 'studio.html') html = studioReveal(html);
  if (p === 'project.html') html = projectSource(html);
  html = semanticTheme(html);
  html = responsiveImages(html);
  write(p, html);
}

const slugs = ['west-vancouver','wilfreds','westshore','casita','mackenzie-ravine','atb','corso32','bar-bricco','uccellino','alder-room-alta','the-helm','hells-kitchen','atb-banking','opt','factory-club','factory-yyc','selkirk','enoch','youth-recovery'];

// Each URL's lastmod is the commit date of the source that produces it, so two
// builds of the same commit write the same sitemap and a page's date only
// moves when the page does. The home page also depends on the Experience
// Index data; /work is derived from project.html as well as its own file; the
// generated project pages are all produced from project.html.
const SOURCES = {
  '/': ['index.html', 'content/experience.json'],
  '/work': ['work.html', 'project.html'],
  '/studio': ['studio.html'],
  '/contact': ['contact.html'],
  '/custom-home-design-edmonton': ['custom-home-design-edmonton.html'],
  '/renovations-additions-edmonton': ['renovations-additions-edmonton.html'],
  '/restaurant-hospitality-design-edmonton': ['restaurant-hospitality-design-edmonton.html'],
  '/commercial-retail-design-edmonton': ['commercial-retail-design-edmonton.html'],
  ...Object.fromEntries(slugs.map(s => [`/work/${s}/`, ['project.html']]))
};
const today = new Date().toISOString().slice(0,10);
let gitAvailable = true;
function commitDate(file) {
  if (!gitAvailable) return '';
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', file],
      { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    gitAvailable = false;
    console.warn('sitemap: git is unavailable, falling back to today for lastmod');
    return '';
  }
}
function lastmod(url) {
  const dates = SOURCES[url].map(commitDate).filter(Boolean);
  if (dates.length) return dates.sort().at(-1);
  if (gitAvailable) console.warn(`sitemap: no commit history for ${SOURCES[url].join(', ')}, using today for ${url}`);
  return today;
}
const urls = Object.keys(SOURCES);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>https://sudu.studio${u}</loc><lastmod>${lastmod(u)}</lastmod></url>`).join('\n')}\n</urlset>\n`);

console.log('SuDu audit hardening applied to source pages and sitemap.');

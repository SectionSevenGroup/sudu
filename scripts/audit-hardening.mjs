#!/usr/bin/env node
/**
 * SuDu STUDIO audit hardening pass.
 *
 * This intentionally makes deterministic, zero-invention corrections to the
 * static source before the existing project generator runs. It keeps the
 * authored layouts intact while fixing route hygiene, SEO canonicals, Studio
 * image geometry/reveal ownership, service-page shell drift, responsive image
 * delivery, and project gallery rhythm.
 *
 * It is idempotent: running it twice produces the same files.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)), '..');
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

function addCoreShell(html) {
  // Service pages predate the current shared rail/chrome/navigation shell.
  if (!html.includes('css/rail.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="css/rail.css">\n<script src="js/chrome-bar.js"></script>\n<script src="js/turbo-boot.js" defer></script>\n<script src="https://unpkg.com/@hotwired/turbo@8.0.23/dist/turbo.es2017-umd.js" defer></script>\n<meta name="turbo-cache-control" content="no-preview">\n</head>');
  }
  html = html.replace(/<header style=/g, '<header id="suduNav" style=');
  html = html.replace(/<a href="\/work"(?![^>]*data-turbo-preload)/g, '<a href="/work" data-turbo-preload');
  html = html.replace(/<a href="\/studio"(?![^>]*data-turbo-preload)/g, '<a href="/studio" data-turbo-preload');
  html = html.replace(/<a href="\/contact"(?![^>]*data-turbo-preload)/g, '<a href="/contact" data-turbo-preload');
  html = html.replace(/<a href="\/"(?![^>]*data-turbo-preload)/g, '<a href="/" data-turbo-preload');
  html = html.replace(/data-screen-label="Service Intro"/g, 'data-screen-label="Service Intro" data-theme-surface="content"');
  html = html.replace(/data-screen-label="Service Detail"/g, 'data-screen-label="Service Detail" data-theme-surface="content"');
  html = html.replace(/data-screen-label="Related"/g, 'data-screen-label="Related" data-theme-surface="content"');
  // Current site CTA language; no detached ornamental symbol.
  html = html.replace(/<div style="font-size:clamp\(24px,3vw,38px\); font-weight:700; letter-spacing:-0\.03em; line-height:1;">Say hello<\/div>/g,
    '<div style="font-size:clamp(24px,3vw,38px); font-weight:700; letter-spacing:-0.03em; line-height:1;">Get in touch</div>');
  html = html.replace(/\s*<span style="font-size:clamp\(19px,2\.3vw,30px\);[^>]*>&#8250;&#8250;<\/span>/g, '');
  // Old 20px-rise reveal is visually out of family. Keep opacity dominant.
  html = html.replaceAll("el.style.transform = 'translateY(20px)';", "el.style.transform = 'translateY(7px)';");
  html = html.replaceAll("'opacity 1.5s ' + ease + ', transform 1.7s ' + ease", "'opacity 1.0s ' + ease + ', transform 1.1s ' + ease");
  return html;
}

function studioReveal(html) {
  const old = '<img data-reveal data-motion="major" src="images/team-illustration-alpha.png" alt="Line portrait of the three SuDu Studio founders" decoding="async" style="width:min(680px,92%); height:auto; display:block; margin:0 0 clamp(12px,1.5vw,20px);">';
  const next = '<img id="studioTeamIllustration" src="images/team-illustration-alpha.png" width="2048" height="2048" alt="Line portrait of the three SuDu Studio founders" decoding="async" style="width:min(680px,92%); height:auto; aspect-ratio:1/1; display:block; margin:0 0 clamp(12px,1.5vw,20px); opacity:0; transition:opacity 1.9s cubic-bezier(.16,1,.3,1);">';
  html = html.replace(old, next);
  if (!html.includes('studioTeamIllustration.dataset.suduRevealOwned')) {
    html = html.replace('class Component extends DCLogic {\n  componentDidMount() {', `class Component extends DCLogic {\n  componentDidMount() {\n    const studioTeamIllustration = document.getElementById('studioTeamIllustration');\n    if (studioTeamIllustration && !studioTeamIllustration.dataset.suduRevealOwned) {\n      studioTeamIllustration.dataset.suduRevealOwned = '1';\n      const showTeam = () => {\n        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { studioTeamIllustration.style.transition = 'none'; }\n        requestAnimationFrame(() => setTimeout(() => { studioTeamIllustration.style.opacity = '1'; }, 250));\n      };\n      if (studioTeamIllustration.complete) showTeam();\n      else { studioTeamIllustration.addEventListener('load', showTeam, { once:true }); setTimeout(showTeam, 350); }\n    }`);
  }
  return html;
}

function projectSource(html) {
  html = html.replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex, follow">');
  html = html.replace('<link rel="canonical" href="https://sudu.studio/project.html">', '<link rel="canonical" href="https://sudu.studio/work">');
  html = html.replace('<meta property="og:url" content="https://sudu.studio/project.html">', '<meta property="og:url" content="https://sudu.studio/work">');
  // Introduce a restrained editorial gallery rhythm without making each
  // project bespoke: first image in a group may span the row; subsequent
  // images remain paired. The content still determines how much variety exists.
  html = html.replace(
    '<div data-reveal data-motion="detail" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(min({{ grp.minW }}px,100%), 1fr)); gap:clamp(16px,2vw,28px);">',
    '<div class="project-gallery-grid" data-reveal data-motion="detail" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:clamp(16px,2vw,28px);">'
  );
  html = html.replace(
    '<div style="aspect-ratio:4/3; overflow:hidden; background:{{ grp.bg }};">',
    '<div class="project-gallery-item" style="aspect-ratio:4/3; overflow:hidden; background:{{ grp.bg }};">'
  );
  if (!html.includes('.project-gallery-grid > .project-gallery-item:first-child')) {
    html = html.replace('</style>', `\n  .project-gallery-grid > .project-gallery-item:first-child { grid-column:1 / -1; aspect-ratio:16/9 !important; }\n  .project-gallery-grid > .project-gallery-item:nth-child(4n) { grid-column:1 / -1; aspect-ratio:16/9 !important; }\n  @media (max-width:720px) { .project-gallery-grid { grid-template-columns:1fr !important; } .project-gallery-grid > .project-gallery-item { grid-column:auto !important; aspect-ratio:4/3 !important; } }\n</style>`);
  }
  return html;
}

function responsiveImages(html) {
  // Netlify Image CDN: originals remain the source of truth. Browsers choose a
  // derivative close to the rendered width; modern format negotiation happens
  // at the edge via fm=auto. Do not rewrite logos, line drawings or SVG-like PNGs.
  return html.replace(/<img([^>]*?)src="(images\/(?!sudu-mark|hero-drawing|team-illustration|red-)[^"]+\.(?:jpg|jpeg|png))"([^>]*?)>/gi,
    (m, before, src, after) => {
      if (/srcset=/.test(m)) return m;
      const u = encodeURIComponent('/' + src);
      const srcset = [480,768,1080,1440,1920].map(w => `/.netlify/images?url=${u}&w=${w}&q=82&fm=auto ${w}w`).join(', ');
      const sizes = /width:100%/.test(m) ? '(max-width: 720px) 100vw, 50vw' : '100vw';
      return `<img${before}src="${src}" srcset="${srcset}" sizes="${sizes}"${after}>`;
    });
}

for (const p of HTML) {
  if (!existsSync(join(root,p))) continue;
  let html = read(p);
  html = extensionless(html);
  if (SERVICES.includes(p)) html = addCoreShell(html);
  if (p === 'studio.html') html = studioReveal(html);
  if (p === 'project.html') html = projectSource(html);
  html = responsiveImages(html);
  write(p, html);
}

// Build a canonical-only sitemap. project.html and query-string generator URLs
// are deliberately absent; generated /work/<slug>/ URLs are the destinations.
const slugs = ['west-vancouver','wilfreds','westshore','casita','mackenzie-ravine','atb','corso32','bar-bricco','uccellino','alder-room-alta','the-helm','hells-kitchen','atb-banking','opt','factory-club','factory-yyc','selkirk','enoch','youth-recovery'];
const urls = [
  '/', '/work', '/studio', '/contact',
  '/custom-home-design-edmonton', '/renovations-additions-edmonton',
  '/restaurant-hospitality-design-edmonton', '/commercial-retail-design-edmonton',
  ...slugs.map(s => `/work/${s}/`)
];
const today = new Date().toISOString().slice(0,10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>https://sudu.studio${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);

console.log('SuDu audit hardening applied to source pages and sitemap.');

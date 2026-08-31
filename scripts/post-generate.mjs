#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const slugs = ['west-vancouver','wilfreds','westshore','casita','mackenzie-ravine','atb','corso32','bar-bricco','uccellino','alder-room-alta','the-helm','hells-kitchen','atb-banking','opt','factory-club','factory-yyc','selkirk','enoch','youth-recovery'];

function imageCdn(html) {
  return html.replace(/<img([^>]*?)src="(\/images\/(?!sudu-mark|hero-drawing|team-illustration|red-)[^"]+\.(?:jpg|jpeg|png))"([^>]*?)>/gi,
    (m,before,src,after) => {
      if (/srcset=/.test(m)) return m;
      const u = encodeURIComponent(src);
      const widths = [480,768,1080,1440,1920];
      const srcset = widths.map(w => `/.netlify/images?url=${u}&w=${w}&q=82 ${w}w`).join(', ');
      const isHero = /height:100%/.test(m) && /object-fit:cover/.test(m) && !/loading="lazy"/.test(m);
      const sizes = isHero ? '100vw' : '(max-width:720px) 100vw, 50vw';
      return `<img${before}src="${src}" srcset="${srcset}" sizes="${sizes}"${after}>`;
    });
}

for (const slug of slugs) {
  const path = join(root,'work',slug,'index.html');
  let s = readFileSync(path,'utf8');
  s = s
    .replaceAll('href="/work.html"','href="/work"')
    .replaceAll('href="/studio.html"','href="/studio"')
    .replaceAll('href="/contact.html"','href="/contact"')
    .replace('<meta name="robots" content="noindex, follow">','<meta name="robots" content="index, follow">');
  s = imageCdn(s);
  writeFileSync(path,s);
}

// /work/index.html is a generated mirror; keep its metadata/navigation canonical.
const workPath = join(root,'work','index.html');
let work = readFileSync(workPath,'utf8')
  .replaceAll('href="/work.html"','href="/work"')
  .replaceAll('href="/studio.html"','href="/studio"')
  .replaceAll('href="/contact.html"','href="/contact"')
  .replaceAll('https://sudu.studio/work.html','https://sudu.studio/work');
writeFileSync(workPath,imageCdn(work));
console.log('Generated project pages hardened.');

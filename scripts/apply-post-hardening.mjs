#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const write = (f, s) => writeFileSync(join(root, f), s);
function walk(dir, out=[]) {
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(relative(root, full));
  }
  return out;
}

const htmlFiles = walk(root);
for (const file of htmlFiles) {
  let html = read(file);
  html = html.replace(
    "if(window.__xhInit||!matchMedia('(pointer:fine)').matches)return;window.__xhInit=1;",
    "if(window.__xhInit||!matchMedia('(pointer:fine)').matches||!matchMedia('(hover:hover)').matches)return;window.__xhInit=1;"
  );
  html = html.replace('make();setTimeout(make,600);\n', '');
  html = html.replace('margin:0 0 clamp(12px,1.5vw,20px);; opacity:0;', 'margin:0 0 clamp(12px,1.5vw,20px); opacity:0;');
  write(file, html);
}

const forbidden = [
  'href="work.html"', 'href="studio.html"', 'href="contact.html"',
  'href="/work.html"', 'href="/studio.html"', 'href="/contact.html"',
  'https://sudu.studio/work.html', 'https://sudu.studio/studio.html', 'https://sudu.studio/contact.html'
];
for (const file of htmlFiles) {
  const html = read(file);
  for (const token of forbidden) {
    if (html.includes(token)) throw new Error(`${file} still contains ${token}`);
  }
}
const sitemap = read('sitemap.xml');
if (sitemap.includes('project.html?p=') || sitemap.includes('/work.html') || sitemap.includes('/studio.html') || sitemap.includes('/contact.html')) {
  throw new Error('sitemap still contains legacy URLs');
}
const studio = read('studio.html');
if (!/id="teamIllustration"[^>]*width="2048" height="2048"/.test(studio)) throw new Error('Studio team geometry not reserved');
if (studio.includes('id="teamIllustration" data-reveal') || studio.includes('data-motion="major" src="/.netlify/images?url=/images/team-illustration-alpha')) throw new Error('Studio team illustration still has competing reveal ownership');
console.log(`post-hardening checks passed across ${htmlFiles.length} HTML files`);

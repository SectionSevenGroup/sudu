#!/usr/bin/env node
// Generates the static per-project pages under /work/<slug>/index.html from
// project.html (which stays the source of truth for markup and project data).
// It no longer writes a /work/index.html mirror of work.html: Netlify serves
// /work from work.html and normalises /work/ to it, so the mirror was a second
// URL for the same page.
//
// Run from the repo root after editing project.html or work.html:
//   node scripts/build-projects.mjs
//
// Stamps the pages' script references with content hashes first (see
// scripts/stamp-assets.mjs), so a changed script can never keep serving from
// cache under an unchanged ?v=. Generated pages inherit the stamps.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { renderPage, evaluateComponent } from '../lib/render-page.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

// Stamp before reading: the generated pages copy the source pages' script
// tags verbatim, so the hashes have to be current when we read them.
execFileSync(process.execPath, [join(root, 'scripts/stamp-assets.mjs')], { cwd: root, stdio: 'inherit' });

const projectSrc = read('src/project.html');

// ---- pull the DATA object out of project.html -------------------------------
const dataStart = projectSrc.indexOf('static DATA = {');
const dataEnd = projectSrc.indexOf('\n  };', dataStart);
if (dataStart === -1 || dataEnd === -1) throw new Error('could not locate static DATA in project.html');
const DATA = eval('(' + projectSrc.slice(dataStart + 'static DATA ='.length, dataEnd + 4).trim().replace(/;$/, '') + ')');
const slugs = Object.keys(DATA);

// A missing DIMS map used to degrade silently to {}, which stripped the hero
// width/height from every generated page and reintroduced layout shift. It is
// required input, so fail loudly instead.
const dimsStart = projectSrc.indexOf('static DIMS = {');
const dimsEnd = projectSrc.indexOf('\n  };', dimsStart);
if (dimsStart === -1 || dimsEnd === -1) throw new Error('could not locate static DIMS in project.html');
const DIMS = eval('(' + projectSrc.slice(dimsStart + 'static DIMS ='.length, dimsEnd + 4).trim().replace(/;$/, '') + ')');

// ---- per-page head metadata -------------------------------------------------
// The four flagship pages use the copy from the site fix brief; the rest derive
// their description from the project lede.
const META = {
  'west-vancouver': { description: 'A private residence and gallery organized around the display of a personal art collection.' },
  'wilfreds': { description: "Hospitality interior in a standalone brick heritage building in Edmonton. Coral tile, brass metalwork, brand and space built together." },
  'youth-recovery': { description: 'A youth recovery and wellness environment built around calm, residential-scale space. With MES Architecture.' },
  'atb': { description: 'Renewal of the concourse, podium and plazas at a major downtown Edmonton intersection. With DIALOG.' },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function headBlock(slug) {
  const d = DATA[slug];
  const title = `${d.title} · SuDu Studio`;
  const description = (META[slug] && META[slug].description) || d.lede;
  const url = `https://sudu.studio/work/${slug}/`;
  const image = `https://sudu.studio/${d.heroSrc}`;
  return `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SuDu Studio">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
`;
}

// ---- transforms shared by every generated file ------------------------------
// Generated pages live at /work/<slug>/, two levels below the template, so
// every document-relative path has to become root-absolute. The old rules only
// covered ./js/ and images/, which left i18n.js, turbo-boot.js and
// audio-player.js resolving under /work/<slug>/ and 404ing.
function absolutePaths(html) {
  return html
    .replace(/(src|href)="\.\//g, '$1="/')
    // anything not already absolute, a fragment, a scheme, or a placeholder
    .replace(/(src|href)="(?!https?:|\/\/|\/|#|mailto:|tel:|data:|\{\{)/g, '$1="/')
    .replace(/data-preview="images\//g, 'data-preview="/images/')
    .replace(/'images\//g, "'/images/");
}

function generateProjectPage(slug) {
  // Pin the project the way the runtime page would have read it from ?p=, so
  // renderVals() is unchanged, then render the whole page for that project.
  const pinned = projectSrc.replace(
    /const key = new URLSearchParams\(location\.search\)\.get\('p'\) \|\| 'west-vancouver';/,
    `const key = '${slug}';`
  );
  if (pinned === projectSrc) throw new Error('could not pin the project key in src/project.html');
  let html = renderPage(pinned, { vals: evaluateComponent(pinned) });
  // the template is noindex; generated pages are the real, indexable URLs
  html = html.replace(/<meta name="robots" content="noindex">\n/, '<meta name="robots" content="index, follow">\n');
  html = absolutePaths(html);
  // Drop the template's own head metadata. headBlock() emits a per-project
  // replacement for each of these, and leaving both in place gave every
  // generated page two <title>s and two rel=canonical tags.
  for (const re of [
    /<title>[\s\S]*?<\/title>\n/,
    /<meta name="description" content="[^"]*">\n/,
    /<link rel="canonical" href="[^"]*">\n/,
    /<meta property="og:title" content="[^"]*">\n/,
    /<meta property="og:description" content="[^"]*">\n/,
    /<meta property="og:url" content="[^"]*">\n/,
    /<meta property="og:type" content="[^"]*">\n/,
    /<meta property="og:image" content="[^"]*">\n/,
  ]) html = html.replace(re, '');
  html = html.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n',
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' + headBlock(slug)
  );
  return html;
}

// ---- work.html has to agree with project.html ------------------------------
// work.html shipped a hard-coded "14 projects" against nineteen cards. The
// header now reads its total off `order`, so the label cannot drift on its
// own — but `order` and the project DATA are still two lists in two files,
// and the "NN / total" counters are a third. Check all three here, where a
// regeneration is unavoidable after any project is added or removed, so a
// mismatch fails loudly instead of shipping.
const workSrc = read('src/work.html');
const orderMatch = /const order = \[([\s\S]*?)\];/.exec(workSrc);
if (!orderMatch) throw new Error('could not locate the project `order` array in work.html');
const order = eval('([' + orderMatch[1] + '])');

if (order.length !== slugs.length || order.some((s, i) => s !== slugs[i])) {
  throw new Error(
    'work.html order and project.html DATA disagree.\n' +
    `  work.html    (${order.length}): ${order.join(', ')}\n` +
    `  project.html (${slugs.length}): ${slugs.join(', ')}`
  );
}

// The header label is derived; anything else there is a literal that will rot.
const literalCount = /<span[^>]*>\s*\d+\s+projects?\s*<\/span>/.exec(workSrc);
if (literalCount) {
  throw new Error(
    'work.html states its project count literally (' + literalCount[0].trim() + '). ' +
    'Render {{ countLabel }} instead, so the total follows the list.'
  );
}

const badCounters = slugs
  .map((s, i) => [s, DATA[s].counter, String(i + 1).padStart(2, '0') + ' / ' + slugs.length])
  .filter(([, actual, want]) => actual !== want);
if (badCounters.length) {
  throw new Error('project counters are stale:\n' +
    badCounters.map(([s, actual, want]) => `  ${s}: "${actual}" should be "${want}"`).join('\n'));
}

const undimensioned = slugs.filter((s) => DATA[s].heroSrc && !DIMS[DATA[s].heroSrc]);
if (undimensioned.length) {
  throw new Error('hero images missing from DIMS: ' +
    undimensioned.map((s) => `${s} (${DATA[s].heroSrc})`).join(', '));
}

for (const slug of slugs) {
  const dir = join(root, 'work', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), generateProjectPage(slug));
}
console.log(`wrote ${slugs.length} project pages: ${slugs.join(', ')}`);

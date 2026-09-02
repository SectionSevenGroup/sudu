import { readFile, writeFile } from 'node:fs/promises';

const INDEX = new URL('../src/index.html', import.meta.url);
const DATA = new URL('../content/experience.json', import.meta.url);

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const rowStyle = 'padding:9px 0; border-bottom:1px solid var(--rule-13); font-family:\'Urbanist\', sans-serif; font-size:12px; color:var(--muted); transition:color .25s ease, padding-left .25s ease;';
const hoverStyle = 'color:var(--ink); padding-left:8px;';
const listStyle = 'list-style:none; margin:0; padding:0; border-top:1px solid var(--rule-13);';

function entryHtml(entry) {
  const name = esc(entry.name);
  const attrs = [];
  if (entry.preview) attrs.push(`data-preview="${esc(entry.preview)}"`);
  if (entry.info) attrs.push(`data-info="${esc(entry.info)}"`);
  const content = entry.project
    ? `<a href="/work/${encodeURIComponent(String(entry.project))}/" style="color:inherit; text-decoration:none; display:block;">${name}</a>`
    : name;
  return `          <li style="${rowStyle}" style-hover="${hoverStyle}"${attrs.length ? ' ' + attrs.join(' ') : ''}>${content}</li>`;
}

function listHtml(category) {
  return `        <ul style="${listStyle}">\n${(category.entries || []).map(entryHtml).join('\n')}\n        </ul>`;
}

const [source, raw] = await Promise.all([
  readFile(INDEX, 'utf8'),
  readFile(DATA, 'utf8'),
]);
const model = JSON.parse(raw);
if (!Array.isArray(model.categories) || model.categories.length !== 3) {
  throw new Error('Experience Index must contain exactly the three designed categories.');
}
for (const category of model.categories) {
  if (!category || !category.id || !Array.isArray(category.entries)) {
    throw new Error('Every Experience Index category needs an id and entries array.');
  }
}

const sectionStart = source.indexOf('<section id="experience"');
if (sectionStart < 0) throw new Error('Could not find the Experience Index section in src/index.html.');
const sectionEnd = source.indexOf('</section>', sectionStart);
if (sectionEnd < 0) throw new Error('Could not bound the Experience Index section in src/index.html.');

const before = source.slice(0, sectionStart);
let section = source.slice(sectionStart, sectionEnd + '</section>'.length);
// Consume the whitespace in front of <ul> as well: listHtml() writes its own
// fixed indent, and matching from "<ul" onward left the old indent in place,
// so every build pushed the three lists eight spaces further right.
const listRe = /[ \t]*<ul style="list-style:none; margin:0; padding:0; border-top:1px solid var\(--rule-13\);">[\s\S]*?<\/ul>/g;
const matches = [...section.matchAll(listRe)];
if (matches.length !== 3) {
  throw new Error(`Expected 3 Experience Index lists, found ${matches.length}.`);
}
let offset = 0;
for (let i = 0; i < matches.length; i++) {
  const match = matches[i];
  const start = match.index + offset;
  const end = start + match[0].length;
  const replacement = listHtml(model.categories[i]);
  section = section.slice(0, start) + replacement + section.slice(end);
  offset += replacement.length - match[0].length;
}

const out = before + section + source.slice(sectionEnd + '</section>'.length);
await writeFile(INDEX, out, 'utf8');
console.log(`Experience Index: ${model.categories.reduce((n, c) => n + c.entries.length, 0)} entries.`);

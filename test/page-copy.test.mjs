// The authored copy of the four public pages, and the translation keys it is
// bound to. Runs against the real files, so it fails if a page and its COPY
// object ever stop agreeing.
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cm from '../lib/content-model.mjs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const i18n = read('i18n.js');
const K = JSON.parse(i18n.match(/var K=(\{.*?\});\n/s)[1]);
const KEN = JSON.parse(i18n.match(/var KEN=(\{.*?\});\n/s)[1]);

test('every page exposes the copy the editor lists', () => {
  for (const [page, spec] of Object.entries(cm.PAGES)) {
    const copy = cm.readPage(page, read(spec.file));
    for (const [field, label] of spec.fields) {
      assert.equal(typeof copy[field], 'string', `${page}.${field} (${label}) missing`);
      assert.ok(copy[field].trim(), `${page}.${field} is empty`);
    }
  }
});

test('the markup binds to COPY and carries the matching key', () => {
  for (const [page, spec] of Object.entries(cm.PAGES)) {
    const src = read(spec.file);
    for (const [field] of spec.fields) {
      assert.match(src, new RegExp(`data-i18n="${page}\\.${field}"`), `${page}.${field} has no key`);
      assert.match(src, new RegExp(`\\{\\{ copy\\.${field} \\}\\}`), `${page}.${field} is not bound`);
    }
  }
});

test('a page save rewrites only the field that changed', () => {
  const src = read('src/index.html');
  const copy = cm.readPage('home', src);
  const next = cm.applyPage('home', copy, { practiceStatement: 'A different sentence entirely.' });
  const out = cm.writePage('home', src, next, copy);

  assert.notEqual(out, src);
  const back = cm.readPage('home', out);
  assert.equal(back.practiceStatement, 'A different sentence entirely.');
  for (const key of Object.keys(copy)) {
    if (key === 'practiceStatement') continue;
    assert.deepEqual(back[key], copy[key], key + ' changed');
  }
  // and nothing outside the object moved
  const cut = (s) => s.replace(/static COPY = \{[\s\S]*?\n  \};/, '');
  assert.equal(cut(out), cut(src), 'the page changed outside its COPY');
});

test('a save that changes nothing is byte-identical', () => {
  for (const [page, spec] of Object.entries(cm.PAGES)) {
    const src = read(spec.file);
    const copy = cm.readPage(page, src);
    assert.equal(cm.writePage(page, src, cm.applyPage(page, copy, {}), copy), src, page);
  }
});

test('a page patch cannot write a field the editor does not offer', () => {
  const copy = cm.readPage('home', read('src/index.html'));
  const next = cm.applyPage('home', copy, {
    practiceStatement: 'Allowed.',
    navLabel: 'Injected', __proto__hack: 'no', faqs: [{ q: 'x', a: 'y' }],
  });
  assert.equal(next.practiceStatement, 'Allowed.');
  assert.equal(next.navLabel, undefined);
  assert.equal(next.faqs, undefined, 'Home has no FAQ to write');
  assert.deepEqual(Object.keys(next).sort(), Object.keys(copy).sort());
});

test('Contact FAQ questions and answers are editable and keyed', () => {
  const src = read('src/contact.html');
  const copy = cm.readPage('contact', src);
  assert.ok(copy.faqs.length >= 6);
  const next = cm.applyPage('contact', copy, {
    faqs: copy.faqs.map((f, i) => (i === 0 ? { q: 'A new question?', a: f.a } : f)),
  });
  const back = cm.readPage('contact', cm.writePage('contact', src, next, copy));
  assert.equal(back.faqs[0].q, 'A new question?');
  assert.equal(back.faqs[0].a, copy.faqs[0].a, 'the answer is untouched');
  assert.equal(back.faqs.length, copy.faqs.length);
  assert.match(src, /data-i18n="\{\{ faq\.qKey \}\}"/);
  assert.match(src, /data-i18n="\{\{ faq\.aKey \}\}"/);
});

test('empty copy is refused', () => {
  const copy = cm.readPage('studio', read('src/studio.html'));
  const errors = cm.validatePage('studio', cm.applyPage('studio', copy, { heroLineOne: '   ' }));
  assert.ok(errors.some((e) => e.field === 'heroLineOne'));
  assert.equal(cm.validatePage('studio', copy).length, 0);
});

// --- translations ------------------------------------------------------

test('every translated key carries all four languages', () => {
  const keys = Object.keys(KEN);
  assert.ok(keys.length >= 26, `only ${keys.length} keyed strings`);
  for (const lang of ['fr', 'es', 'de', 'ja']) {
    for (const key of keys) {
      assert.equal(typeof K[lang][key], 'string', `${lang} is missing ${key}`);
      assert.ok(K[lang][key].trim(), `${lang}.${key} is empty`);
    }
  }
});

test('a key names a field, never the English sentence', () => {
  for (const key of Object.keys(KEN)) {
    assert.match(key, /^[a-z]+\.[A-Za-z0-9.]+$/, key);
    assert.ok(!key.includes(' '), key + ' looks like a sentence');
  }
});

test('the keys match the fields the pages actually expose', () => {
  for (const [page, spec] of Object.entries(cm.PAGES)) {
    const copy = cm.readPage(page, read(spec.file));
    for (const [field] of spec.fields) {
      const key = cm.copyKey(page, field);
      if (KEN[key] === undefined) continue;          // never translated, stays English
      assert.equal(KEN[key], copy[field],
        `${key} was translated against different English than the page now holds`);
    }
  }
});

test('editing the English keeps the translation under the same key', () => {
  const src = read('src/index.html');
  const copy = cm.readPage('home', src);
  const key = cm.copyKey('home', 'heroStatement');
  const frenchBefore = K.fr[key];
  assert.ok(frenchBefore, 'there is a French translation to keep');

  const next = cm.applyPage('home', copy, { heroStatement: 'Something the studio just decided.' });
  const out = cm.writePage('home', src, next, copy);

  // the English moved; the key did not, so the translation is still reachable
  assert.equal(cm.readPage('home', out).heroStatement, 'Something the studio just decided.');
  assert.match(out, new RegExp(`data-i18n="${key.replace('.', '\\.')}"`));
  assert.equal(K.fr[key], frenchBefore, 'French was not touched');
  for (const lang of ['es', 'de', 'ja']) assert.ok(K[lang][key], lang + ' survives');

  // and Control can see that it now describes older English
  assert.notEqual(KEN[key], next.heroStatement, 'the review state is detectable');
});

test('i18n translates a keyed node by its key, not by its text', () => {
  // the walker reads data-i18n first and only falls through to the old
  // exact-English table for everything else
  assert.match(i18n, /host=p\.closest\?p\.closest\('\[data-i18n\]'\):null/);
  assert.match(i18n, /K\[cur\]&&K\[cur\]\[kk\]/);
  assert.match(i18n, /host\.__suduEn/, 'the English is remembered for switching back');
});

// --- the work index is derived -----------------------------------------

test('the work index matches the project source exactly', () => {
  const projectSrc = read('src/project.html');
  const workSrc = read('src/work.html');
  const site = cm.readSite(projectSrc, workSrc);
  const { work } = cm.serialise(projectSrc, workSrc, cm.reindex(site), site);
  assert.equal(work, workSrc,
    'work.html has drifted from project.html — run node scripts/derive-work-index.mjs');
});

test('every index row is derived from the project it names', () => {
  const site = cm.readSite(read('src/project.html'), read('src/work.html'));
  for (const slug of site.order) {
    const p = site.DATA[slug];
    const row = site.names[slug];
    assert.ok(row, slug + ' is missing from the index');
    assert.equal(row.title, p.title, slug);
    assert.equal(row.eyebrow, p.eyebrow, slug);
    assert.equal(row.location, p.location, slug);
    assert.equal(row.thumb, p.heroSrc, slug);
  }
});

test('no copy value carries an HTML entity', () => {
  // COPY is data, not markup. Its values reach the page as text nodes, so an
  // entity left in one renders as its own characters — "Financial&rsquo;s"
  // instead of "Financial’s". The character itself is what belongs here.
  const found = [];
  const check = (where, v) => {
    if (typeof v === 'string' && /&(#\d+|#x[0-9a-f]+|[a-zA-Z]+);/i.test(v)) found.push(where + ': ' + v.slice(0, 70));
  };
  for (const [page, spec] of Object.entries(cm.PAGES)) {
    const copy = cm.readPage(page, read(spec.file));
    for (const [key, value] of Object.entries(copy)) {
      if (Array.isArray(value)) {
        value.forEach((f, i) => { check(`${page}.${key}[${i}].q`, f.q); check(`${page}.${key}[${i}].a`, f.a); });
      } else check(`${page}.${key}`, value);
    }
  }
  assert.deepEqual(found, []);
});

test('a translation is keyed to the English the page now holds', () => {
  // Not a rule about the copy — a check that the two were changed together
  // where they were changed at all. A key with no translation is fine.
  const copy = cm.readPage('studio', read('src/studio.html'));
  assert.equal(copy.joeRole, 'Designer + Creative Director');
  assert.equal(KEN['studio.joeRole'], copy.joeRole);
  for (const lang of ['fr', 'es', 'de', 'ja']) {
    assert.ok(K[lang]['studio.joeRole'], lang + ' lost the role');
  }
});

// The content model rewrites the site's own source, so the test that matters
// is that reading and writing it back changes nothing at all.
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cm from '../lib/content-model.mjs';

// resolved against this file, so the suite runs from any directory
const projectSrc = readFileSync(new URL('../src/project.html', import.meta.url), 'utf8');
const workSrc = readFileSync(new URL('../src/work.html', import.meta.url), 'utf8');
const site = cm.readSite(projectSrc, workSrc);

test('reads every project', () => {
  assert.equal(Object.keys(site.DATA).length, 19);
  assert.equal(site.order.length, 19);
  assert.equal(Object.keys(site.EDITORIAL).length, 5);
  assert.ok(Object.keys(site.DIMS).length > 100);
});

test('round-trips project.html byte-identically', () => {
  const { project } = cm.serialise(projectSrc, workSrc, site);
  const again = cm.readSite(project, workSrc);
  assert.deepEqual(again.DATA, site.DATA, 'DATA changed');
  assert.deepEqual(again.EDITORIAL, site.EDITORIAL, 'EDITORIAL changed');
  assert.deepEqual(again.DIMS, site.DIMS, 'DIMS changed');
});

test('round-trips work.html', () => {
  const { work } = cm.serialise(projectSrc, workSrc, site);
  const again = cm.readSite(projectSrc, work);
  assert.deepEqual(again.order, site.order);
  assert.deepEqual(again.names, site.names);
});

test('touches nothing outside the objects it rewrites', () => {
  const { project } = cm.serialise(projectSrc, workSrc, site);
  // everything before the first object and after the last must be untouched
  const head = (s) => s.slice(0, s.indexOf('static DATA ='));
  const tail = (s) => s.slice(s.indexOf('  renderVals()'));
  assert.equal(head(project), head(projectSrc), 'content above DATA moved');
  assert.equal(tail(project), tail(projectSrc), 'content below DIMS moved');
});

test('preserves each project’s own shape', () => {
  const list = cm.listProjects(site);
  const shapes = new Set(list.map((p) => p.shape));
  assert.ok(shapes.has('groups') && shapes.has('gallery') && shapes.has('hero-only'), [...shapes].join(','));
  // a patch that says nothing about gallery must not remove it
  const wilfreds = site.DATA['wilfreds'];
  assert.ok(Array.isArray(wilfreds.gallery));
  const after = cm.applyProject(site, 'wilfreds', { title: 'Wilfreds' });
  assert.deepEqual(after.DATA['wilfreds'].gallery, wilfreds.gallery);
});

test('editorial indices resolve against DATA media', () => {
  for (const [slug, ed] of Object.entries(site.EDITORIAL)) {
    const media = cm.projectMedia(site.DATA[slug]);
    for (const b of ed.seq) {
      for (const i of b.i) assert.ok(media[i], `${slug} index ${i}`);
      if (typeof b.g === 'number') assert.ok(site.DATA[slug].groups[b.g], `${slug} group ${b.g}`);
    }
  }
});

test('reindex reproduces the counters already in the file', () => {
  const re = cm.reindex(site);
  for (const slug of site.order) {
    assert.equal(re.DATA[slug].counter, site.DATA[slug].counter, slug + ' counter');
    assert.equal(re.DATA[slug].next, site.DATA[slug].next, slug + ' next');
  }
  assert.deepEqual(re.names, site.names, 'work.html names mirror');
});

test('rejects paths outside images/', () => {
  const bad = ['../../etc/passwd', '/etc/passwd', 'images/../../secret.jpg', 'images/sub/dir.jpg',
               'js/control.js', 'images/.env', 'images/evil.svg.js', 'images/shell.sh', ''];
  for (const p of bad) assert.equal(cm.safeMediaPath(p), null, 'accepted ' + JSON.stringify(p));
  assert.equal(cm.safeMediaPath('images/helm-1.jpg'), 'images/helm-1.jpg');
  assert.equal(cm.safeMediaPath('/images/helm-1.jpg'), 'images/helm-1.jpg');
});

test('validation catches the mistakes an editor can make', () => {
  const p = { ...site.DATA['wilfreds'] };
  assert.equal(cm.validate(site, { slug: 'wilfreds', project: p }).length, 0);
  assert.ok(cm.validate(site, { slug: 'Not A Slug' }).some((e) => e.field === 'slug'));
  assert.ok(cm.validate(site, { slug: 'x', project: { ...p, title: '' } }).some((e) => e.field === 'title'));
  assert.ok(cm.validate(site, { slug: 'x', project: { ...p, related: [{ key: 'nope' }] } }).some((e) => e.field === 'related'));
  assert.ok(cm.validate(site, { slug: 'x', project: { ...p, heroSrc: '../evil.jpg' } }).some((e) => e.field === 'heroSrc'));
  const ed = { rhythm: 'linear', seq: [{ t: 's', i: [99] }] };
  assert.ok(cm.validate(site, { slug: 'wilfreds', project: p, editorial: ed }).some((e) => e.field === 'editorial'));
});

test('an edit lands and nothing else moves', () => {
  const edited = cm.applyProject(site, 'wilfreds', { lede: 'A new lede for the room.' });
  const { project } = cm.serialise(projectSrc, workSrc, edited);
  const again = cm.readSite(project, workSrc);
  assert.equal(again.DATA['wilfreds'].lede, 'A new lede for the room.');
  for (const slug of site.order) {
    if (slug === 'wilfreds') continue;
    assert.deepEqual(again.DATA[slug], site.DATA[slug], slug + ' changed');
  }
});

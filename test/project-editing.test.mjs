// Everything the project editor can change: hero, proportions, gallery in both
// shapes, groups, related projects, reading order, catalogue order, and adding
// a project. Against the real site source, so the shapes are the real shapes.
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cm from '../lib/content-model.mjs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const projectSrc = read('project.html');
const workSrc = read('src/work.html');
const base = () => cm.readSite(projectSrc, workSrc);

const site = base();
const flat = site.order.find((s) => site.DATA[s].gallery && !site.DATA[s].groups);
const grouped = site.order.find((s) => site.DATA[s].groups);
const withEditorial = Object.keys(site.EDITORIAL)[0];

test('the site has all three project shapes to work with', () => {
  assert.ok(flat, 'a flat gallery project');
  assert.ok(grouped, 'a grouped project');
  assert.ok(withEditorial, 'a project with a reading order');
  assert.ok(Object.keys(site.EDITORIAL).length >= 5);
});

// --- hero ---------------------------------------------------------------

test('a hero can be replaced and its proportions recorded', () => {
  const s = base();
  const other = cm.projectMedia(s.DATA[flat])[1];
  const next = cm.setHero(s, flat, other, { w: 2400, h: 1600 });
  assert.equal(next.DATA[flat].heroSrc, other);
  assert.deepEqual(next.DIMS[other], [2400, 1600]);
  // nothing else about the project moved
  for (const k of Object.keys(s.DATA[flat])) {
    if (k === 'heroSrc') continue;
    assert.deepEqual(next.DATA[flat][k], s.DATA[flat][k], k);
  }
});

test('a hero outside images/ is refused outright', () => {
  assert.throws(() => cm.setHero(base(), flat, '../../secrets.env', { w: 1, h: 1 }));
  assert.throws(() => cm.setHero(base(), flat, 'images/../../x.jpg', { w: 1, h: 1 }));
});

test('proportions already known are not overwritten by a hero with none', () => {
  const s = base();
  const src = s.DATA[flat].heroSrc;
  const had = s.DIMS[src];
  const next = cm.setHero(s, flat, src, null);
  assert.deepEqual(next.DIMS[src], had);
});

// --- flat gallery -------------------------------------------------------

test('a flat gallery reorders, adds and removes, and stays flat', () => {
  const s = base();
  const before = s.DATA[flat].gallery.slice();

  let next = cm.galleryMove(s, flat, 0, 2);
  assert.deepEqual(next.DATA[flat].gallery, [before[1], before[2], before[0], ...before.slice(3)]);
  assert.equal(next.DATA[flat].groups, undefined, 'it did not grow groups');

  next = cm.galleryAdd(next, flat, before[0]);
  assert.equal(next.DATA[flat].gallery.length, before.length + 1);

  next = cm.galleryRemove(next, flat, 0);
  assert.equal(next.DATA[flat].gallery.length, before.length);
  assert.equal(next.DATA[flat].gallery.includes(before[1]), false, 'the first one went');
});

test('an unsafe path never enters a gallery', () => {
  assert.throws(() => cm.galleryAdd(base(), flat, '../../etc/passwd'));
  assert.throws(() => cm.galleryAdd(base(), flat, 'images/nested/deep.jpg'));
});

// --- grouped gallery ----------------------------------------------------

test('a grouped project keeps its groups through every gallery edit', () => {
  const s = base();
  const groups = s.DATA[grouped].groups;
  const first = groups[0].images.slice();

  let next = cm.galleryMove(s, grouped, 0, 1, 0);
  assert.equal(next.DATA[grouped].gallery, undefined, 'it did not flatten');
  assert.equal(next.DATA[grouped].groups.length, groups.length);
  assert.deepEqual(next.DATA[grouped].groups[0].images, [first[1], first[0], ...first.slice(2)]);
  // every other group untouched
  for (let i = 1; i < groups.length; i++) {
    assert.deepEqual(next.DATA[grouped].groups[i], groups[i], 'group ' + i);
  }

  next = cm.galleryAdd(next, grouped, first[0], 1);
  assert.equal(next.DATA[grouped].groups[1].images.length, groups[1].images.length + 1);
  next = cm.galleryRemove(next, grouped, 0, 1);
  assert.equal(next.DATA[grouped].groups[1].images.length, groups[1].images.length);
});

test('group headings are edited, and stay in the project source', () => {
  const s = base();
  const next = cm.groupSet(s, grouped, 0, { head: 'A new heading', sub: 'and a subtitle' });
  assert.equal(next.DATA[grouped].groups[0].head, 'A new heading');
  assert.equal(next.DATA[grouped].groups[0].sub, 'and a subtitle');
  assert.deepEqual(next.DATA[grouped].groups[0].images, s.DATA[grouped].groups[0].images);
  // EDITORIAL never gains a copy of the words
  assert.deepEqual(next.EDITORIAL, s.EDITORIAL);
});

test('groups can be added and reordered', () => {
  const s = base();
  let next = cm.groupAdd(s, grouped, 'Added group');
  assert.equal(next.DATA[grouped].groups.length, s.DATA[grouped].groups.length + 1);
  assert.deepEqual(next.DATA[grouped].groups.at(-1).images, []);
  next = cm.groupMove(next, grouped, 0, 1);
  assert.equal(next.DATA[grouped].groups[1].head, s.DATA[grouped].groups[0].head);
});

test('removing a group re-bases the reading order rather than breaking it', () => {
  const s = base();
  const slug = Object.keys(s.EDITORIAL).find((k) => s.DATA[k] && s.DATA[k].groups);
  if (!slug) return;                       // no grouped project has a sequence
  const next = cm.groupRemove(s, slug, 0);
  const media = cm.projectMedia(next.DATA[slug]);
  for (const b of next.EDITORIAL[slug].seq) {
    for (const i of b.i || []) assert.ok(media[i], `block still points at image ${i} of ${media.length}`);
    if (typeof b.g === 'number') assert.ok(next.DATA[slug].groups[b.g], 'block points at a real group');
  }
  assert.equal(cm.validate(next, { slug, project: next.DATA[slug], editorial: next.EDITORIAL[slug] }).length, 0);
});

// --- related ------------------------------------------------------------

test('related projects are set, reordered and removed, and must resolve', () => {
  const s = base();
  const [a, b, c] = s.order;
  let next = cm.relatedSet(s, a, [{ key: b }, { key: c }]);
  assert.deepEqual(next.DATA[a].related.map((r) => r.key), [b, c]);
  assert.equal(next.DATA[a].related[0].name, s.DATA[b].title, 'the name is filled from the project');

  next = cm.relatedSet(next, a, [{ key: c }, { key: b }]);
  assert.deepEqual(next.DATA[a].related.map((r) => r.key), [c, b]);

  // a project that does not exist, and the project itself, are both dropped
  next = cm.relatedSet(next, a, [{ key: 'not-a-project' }, { key: a }, { key: b }]);
  assert.deepEqual(next.DATA[a].related.map((r) => r.key), [b]);
  assert.equal(cm.validate(next, { slug: a, project: next.DATA[a] }).length, 0);
});

// --- reading order ------------------------------------------------------

test('a reading order is reordered and re-typed, and holds no copy', () => {
  const s = base();
  const ed = s.EDITORIAL[withEditorial];
  const seq = ed.seq.slice();
  const moved = [seq[1], seq[0], ...seq.slice(2)];
  const next = cm.editorialSet(s, withEditorial, moved);
  assert.deepEqual(next.EDITORIAL[withEditorial].seq[0].i, seq[1].i);
  assert.equal(next.EDITORIAL[withEditorial].rhythm, ed.rhythm, 'rhythm kept');
  // composition only: no words, no paths
  const text = JSON.stringify(next.EDITORIAL[withEditorial]);
  assert.equal(text.includes('images/'), false, 'a file path leaked into EDITORIAL');
  assert.equal(text.includes(s.DATA[withEditorial].title), false, 'copy leaked into EDITORIAL');
});

test('an inset keeps its width and side inside the allowed range', () => {
  const s = base();
  const next = cm.editorialSet(s, withEditorial, [
    { t: 's', i: [0], w: 999, a: 'r' },
    { t: 's', i: [1], w: 2, a: 'x' },
    { t: 'f', i: [2] },
  ]);
  const seq = next.EDITORIAL[withEditorial].seq;
  assert.equal(seq[0].w, 92);
  assert.equal(seq[0].a, 'r');
  assert.equal(seq[1].w, 28);
  assert.equal(seq[1].a, 'l', 'an unknown side falls back to left');
  assert.equal(seq[2].w, undefined, 'a full-width block has no width');
});

test('a reading order that points past the images is refused', () => {
  const s = base();
  const media = cm.projectMedia(s.DATA[withEditorial]);
  const next = cm.editorialSet(s, withEditorial, [{ t: 'f', i: [media.length + 5] }]);
  const errors = cm.validate(next, {
    slug: withEditorial, project: next.DATA[withEditorial], editorial: next.EDITORIAL[withEditorial],
  });
  assert.ok(errors.some((e) => e.field === 'editorial'), JSON.stringify(errors));

  const pair = cm.editorialSet(s, withEditorial, [{ t: 'p', i: [0] }]);
  assert.ok(cm.validate(pair, {
    slug: withEditorial, project: pair.DATA[withEditorial], editorial: pair.EDITORIAL[withEditorial],
  }).some((e) => /pair needs exactly two/.test(e.message)));
});

// --- catalogue order ----------------------------------------------------

test('reordering the catalogue regenerates the counters and the next chain', () => {
  const s = base();
  const order = [s.order[3], ...s.order.filter((x) => x !== s.order[3])];
  const next = cm.setOrder(s, order);

  assert.deepEqual(next.order, order);
  assert.equal(next.DATA[order[0]].counter, `01 / ${order.length}`);
  assert.equal(next.DATA[order[0]].next, order[1]);
  assert.equal(next.DATA[order.at(-1)].counter, `${order.length} / ${order.length}`);
  assert.equal(next.DATA[order.at(-1)].next, order[0], 'the chain closes');
  order.forEach((slug, i) => {
    assert.equal(next.DATA[slug].counter, `${String(i + 1).padStart(2, '0')} / ${order.length}`, slug);
    assert.equal(next.DATA[slug].next, order[(i + 1) % order.length], slug);
  });
  // and the index rows followed
  assert.deepEqual(Object.keys(next.names), order);
});

test('a project left out of a new order keeps its place rather than vanishing', () => {
  const s = base();
  const next = cm.setOrder(s, [s.order[5]]);
  assert.equal(next.order.length, s.order.length);
  assert.equal(next.order[0], s.order[5]);
});

// --- add project --------------------------------------------------------

test('a new project arrives complete, in the order, with its index row', () => {
  const s = base();
  const gallery = cm.projectMedia(s.DATA[flat]).slice(0, 3);
  const { site: next, slug } = cm.addProject(s, {
    title: 'The New Building', eyebrow: 'Commercial', location: 'Edmonton, AB',
    scope: 'Architecture', status: 'In progress',
    lede: 'A first line.', body: 'A description.',
    heroSrc: gallery[0], gallery, related: [{ key: s.order[0] }],
  });

  assert.equal(slug, 'the-new-building');
  assert.ok(next.order.includes(slug));
  assert.equal(next.DATA[slug].title, 'The New Building');
  assert.deepEqual(next.DATA[slug].gallery, gallery);
  assert.equal(next.DATA[slug].heroSrc, gallery[0]);
  assert.deepEqual(next.DATA[slug].related.map((r) => r.key), [s.order[0]]);

  // derived, not typed
  const i = next.order.indexOf(slug);
  assert.equal(next.DATA[slug].counter, `${String(i + 1).padStart(2, '0')} / ${next.order.length}`);
  assert.equal(next.DATA[slug].next, next.order[(i + 1) % next.order.length]);

  // the work index knows about it
  assert.deepEqual(next.names[slug],
    { eyebrow: 'Commercial', title: 'The New Building', location: 'Edmonton, AB', thumb: gallery[0] });

  // every other project's counter was rewritten to the new total
  for (const other of s.order) {
    assert.match(next.DATA[other].counter, new RegExp(` / ${next.order.length}$`), other);
  }
  assert.equal(cm.validate(next, { slug, project: next.DATA[slug] }).length, 0);
});

test('a new project takes a rhythm and a reading order that resolves', () => {
  const s = base();
  const gallery = cm.projectMedia(s.DATA[flat]).slice(0, 4);
  const { site: next, slug } = cm.addProject(s, {
    title: 'Reading Order Test', eyebrow: 'Commercial', location: 'Alberta',
    gallery, rhythm: 'Monograph',
  });
  assert.equal(next.EDITORIAL[slug].rhythm, 'Monograph');
  assert.equal(next.EDITORIAL[slug].seq.length, gallery.length);
  assert.equal(cm.validate(next, {
    slug, project: next.DATA[slug], editorial: next.EDITORIAL[slug],
  }).length, 0);
});

test('a duplicate or unusable address is refused', () => {
  const s = base();
  assert.throws(() => cm.addProject(s, { title: s.DATA[s.order[0]].title }), /taken/);
  assert.throws(() => cm.addProject(s, { title: '///' }), /unusable/);
  assert.equal(cm.slugify('Hell’s Kitchen at Enoch'), 'hell-s-kitchen-at-enoch');
});

test('a new project survives being written to the source and read back', () => {
  const s = base();
  const { site: next, slug } = cm.addProject(s, {
    title: 'Round Trip', eyebrow: 'Commercial', location: 'Alberta',
    lede: 'Written and read back.', gallery: cm.projectMedia(s.DATA[flat]).slice(0, 2),
  });
  const { project, work } = cm.serialise(projectSrc, workSrc, next, s);
  const back = cm.readSite(project, work);
  assert.deepEqual(back.DATA[slug], next.DATA[slug]);
  assert.deepEqual(back.order, next.order);
  assert.deepEqual(back.names[slug], next.names[slug]);
  // and every existing project came through unchanged
  for (const other of s.order) assert.deepEqual(back.DATA[other], next.DATA[other], other);
});

// --- media usage --------------------------------------------------------

test('media usage names every project a file appears in', () => {
  const s = base();
  const used = cm.mediaUsage(s);
  const hero = s.DATA[flat].heroSrc;
  assert.ok(used.get(hero).includes(flat), 'the hero counts as used');
  for (const src of cm.projectMedia(s.DATA[grouped])) {
    assert.ok(used.get(src).includes(grouped), src);
  }
  const orphan = 'images/definitely-not-referenced-anywhere.jpg';
  assert.equal(used.get(orphan), undefined);
});

test('removing an image re-bases the reading order instead of stranding it', () => {
  const s = base();
  const slug = Object.keys(s.EDITORIAL).find((k) => s.DATA[k] && s.DATA[k].gallery);
  assert.ok(slug, 'a flat project with a reading order');
  const media = cm.projectMedia(s.DATA[slug]);
  const blocksShowingLast = s.EDITORIAL[slug].seq.filter((b) => (b.i || []).includes(media.length - 1)).length;

  const next = cm.galleryRemove(s, slug, media.length - 1);
  assert.equal(cm.projectMedia(next.DATA[slug]).length, media.length - 1);
  assert.equal(next.EDITORIAL[slug].seq.length, s.EDITORIAL[slug].seq.length - blocksShowingLast);
  assert.equal(cm.validate(next, {
    slug, project: next.DATA[slug], editorial: next.EDITORIAL[slug],
  }).length, 0, 'the sequence is valid again');

  // removing from the middle shifts the ones after it
  const mid = cm.galleryRemove(base(), slug, 0);
  const left = cm.projectMedia(mid.DATA[slug]);
  for (const b of mid.EDITORIAL[slug].seq) {
    for (const i of b.i || []) assert.ok(left[i], `block points at ${i} of ${left.length}`);
  }
});

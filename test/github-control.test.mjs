// The repository side of Control: what it asks GitHub to do, and what it
// refuses to do. Runs against the in-memory GitHub in test/mock-github.mjs,
// so it needs no credential and no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockGitHub, PREVIEW } from './mock-github.mjs';
import { client } from '../lib/github.mjs';
import { publicPartsOf } from '../lib/public-error.mjs';

// Each case gets its own repository and its own fetch, so order never matters.
async function withRepo(options, fn) {
  const gh = mockGitHub(options);
  gh.install();
  try { return await fn(client(gh.env), gh); } finally { gh.restore(); }
}

const edit = (gh) => gh.commit([{ path: 'notes.txt', content: 'one' }], 'An edit');

// Raised for real by publish() and commit(); caught so the mark can be read.
const thrownBy = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

test('creates the draft branch from main when it does not exist', async () => {
  await withRepo({}, async (gh, m) => {
    assert.equal(m.repo.draftSha, null);
    await gh.ensureDraft();
    const created = m.made('POST', /\/git\/refs$/);
    assert.equal(created.length, 1, 'one branch created');
    assert.equal(created[0].body.ref, 'refs/heads/control/draft');
    assert.equal(created[0].body.sha, 'main0', 'branched from main');
  });
});

test('one save is one commit, and the draft tip only fast-forwards', async () => {
  await withRepo({}, async (gh, m) => {
    await edit(gh);
    assert.equal(m.repo.commits.length, 1);
    const patches = m.made('PATCH', /\/git\/refs\/heads\//);
    assert.equal(patches.length, 1);
    assert.equal(patches[0].body.force, false, 'never a force-push');
    // and nothing was written anywhere but the draft branch
    assert.equal(patches[0].path.includes('control%2Fdraft'), true);
  });
});

test('a commit is refused when the draft moved under the editor', async () => {
  await withRepo({}, async (gh, m) => {
    await edit(gh);
    const e = await thrownBy(() => gh.commit([{ path: 'notes.txt', content: 'two' }], 'Later', 'a-stale-sha'));
    assert.equal(e.code, 'draft-moved');
    // this one is meant to be seen: it tells the editor what to do next
    assert.deepEqual(publicPartsOf(e), { message: 'The draft moved while you were editing.', status: 409 });
    assert.equal(m.repo.commits.length, 1, 'nothing more was written');
  });
});

test('opens exactly one pull request and reuses it', async () => {
  await withRepo({}, async (gh, m) => {
    await edit(gh);
    const a = await gh.ensurePR();
    const b = await gh.ensurePR();
    await gh.state();
    assert.equal(a.number, 99);
    assert.equal(b.number, 99);
    assert.equal(m.made('POST', /\/pulls$/).length, 1, 'only ever one PR created');
  });
});

test('reads the deploy gate from the exact preview context only', async () => {
  await withRepo({ statuses: [{ context: PREVIEW, state: 'success' }] }, async (gh) => {
    await edit(gh);
    const s = await gh.state();
    assert.equal(s.deploy.context, PREVIEW);
    assert.equal(s.deploy.state, 'success');
    assert.match(s.deploy.url, /^https:\/\/deploy-preview-99--/);
  });
});

test('another green Netlify check does not open publishing', async () => {
  const others = [
    { context: 'netlify/sudustudioarchitecture/deploy', state: 'success' },
    { context: 'netlify/sudustudioarchitecture/deploy-preview-headers', state: 'success' },
    { context: 'ci/build', state: 'success' },
  ];
  await withRepo({ statuses: others }, async (gh) => {
    await edit(gh);
    const s = await gh.state();
    assert.equal(s.deploy.state, 'pending', 'the preview itself has said nothing');
    assert.equal(s.canPublish, false);
  });
});

test('publishing needs ahead, level and a successful preview together', async () => {
  // ahead and successful, but behind main
  await withRepo({ statuses: [{ context: PREVIEW, state: 'success' }], behind: 3 }, async (gh) => {
    await edit(gh);
    assert.equal((await gh.state()).canPublish, false, 'behind main');
  });
  // level and successful, but nothing waiting
  await withRepo({ statuses: [{ context: PREVIEW, state: 'success' }] }, async (gh) => {
    assert.equal((await gh.state()).canPublish, false, 'nothing to publish');
  });
  // all three
  await withRepo({ statuses: [{ context: PREVIEW, state: 'success' }] }, async (gh) => {
    await edit(gh);
    assert.equal((await gh.state()).canPublish, true);
  });
});

test('publish refuses when there is nothing waiting', async () => {
  await withRepo({ statuses: [{ context: PREVIEW, state: 'success' }] }, async (gh, m) => {
    const e = await thrownBy(() => gh.publish());
    assert.deepEqual(publicPartsOf(e), { message: 'There is nothing to publish.', status: 409 });
    assert.equal(m.made('PUT', /\/merge$/).length, 0);
  });
});

test('publish refuses while the draft is behind main', async () => {
  await withRepo({ statuses: [{ context: PREVIEW, state: 'success' }], behind: 2 }, async (gh, m) => {
    await edit(gh);
    const e = await thrownBy(() => gh.publish());
    assert.match(publicPartsOf(e).message, /changed after this draft was started/);
    assert.equal(m.made('PUT', /\/merge$/).length, 0, 'never attempted');
  });
});

test('publish refuses every preview state that is not success', async () => {
  for (const state of ['pending', 'failure', 'error', 'expected']) {
    await withRepo({ statuses: [{ context: PREVIEW, state }] }, async (gh, m) => {
      await edit(gh);
      const e = await thrownBy(() => gh.publish());
      assert.match(publicPartsOf(e).message, /preview is not ready/, state);
      assert.equal(m.made('PUT', /\/merge$/).length, 0, state + ' must not merge');
    });
  }
});

test('publish merges the exact head, then levels the draft with the site', async () => {
  await withRepo({ statuses: [{ context: PREVIEW, state: 'success' }] }, async (gh, m) => {
    await edit(gh);
    const head = m.repo.draftSha;
    const out = await gh.publish();
    assert.equal(out.merged, true);

    const merge = m.made('PUT', /\/merge$/);
    assert.equal(merge.length, 1);
    assert.equal(merge[0].body.sha, head, 'merged the head it verified, not whatever is there now');
    assert.equal(merge[0].body.merge_method, 'merge');

    // the draft is moved onto the merge commit rather than left behind
    const reset = m.made('PATCH', /\/git\/refs\/heads\//).pop();
    assert.equal(reset.body.sha, out.sha);
    assert.equal(reset.body.force, false);
    assert.equal(m.repo.draftSha, m.repo.mainSha, 'draft and site are level');

    const after = await gh.state();
    assert.equal(after.hasChanges, false);
    assert.equal(after.behindBy, 0, 'the next edit is not asked to reconcile');
  });
});

test("a merge GitHub refuses says so in Control's own words", async () => {
  await withRepo({
    statuses: [{ context: PREVIEW, state: 'success' }],
    mergeRefusal: 'Pull Request is not mergeable: INTERNAL_SHOULD_NEVER_REACH_BROWSER',
  }, async (gh, m) => {
    await edit(gh);
    const e = await thrownBy(() => gh.publish());
    const shown = publicPartsOf(e);
    assert.equal(shown.message, 'GitHub did not merge the draft. Nothing else was changed.');
    assert.doesNotMatch(shown.message, /INTERNAL_SHOULD_NEVER_REACH_BROWSER/);
    assert.equal(m.repo.commits.length, 1, 'the draft is untouched');
    assert.equal(m.repo.draftSha !== m.repo.mainSha, true, 'nothing reached the site');
  });
});

test('reconcile merges main into the draft and never rewrites it', async () => {
  await withRepo({ behind: 4 }, async (gh, m) => {
    await edit(gh);
    assert.equal((await gh.state()).behindBy, 4);
    const s = await gh.reconcile();
    const merges = m.made('POST', /\/merges$/);
    assert.equal(merges.length, 1);
    assert.equal(merges[0].body.base, 'control/draft', 'main goes into the draft');
    assert.equal(merges[0].body.head, 'main');
    assert.equal(s.behindBy, 0);
    for (const patch of m.made('PATCH', /\/git\/refs\/heads\//)) {
      assert.equal(patch.body.force, false, 'reconciling never force-pushes');
    }
  });
});

test("GitHub's own error wording is never marked public", async () => {
  await withRepo({}, async (gh, m) => {
    m.failNext(/\/compare\//, 422, 'INTERNAL_SHOULD_NEVER_REACH_BROWSER: token=ghp_secret');
    const e = await thrownBy(() => gh.state());
    assert.ok(e, 'it did fail');
    assert.equal(publicPartsOf(e), null, 'unmarked, so the handler will replace it');
    assert.equal(e.status, 422, 'the status is kept for the log');
  });
});

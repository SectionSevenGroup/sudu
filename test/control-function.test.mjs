// The privileged endpoint, end to end.
//
// The real function runs here — the same session check, the same validation,
// the same content model, the same publish gate — against the in-memory GitHub
// in test/mock-github.mjs. No credential and no network are involved: the
// values below are obvious fakes, and the point of several of these cases is
// that they never appear in anything the browser is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockGitHub, ENV, PREVIEW, siteFiles } from './mock-github.mjs';
import { publicError, publicPartsOf, redactSecrets } from '../lib/public-error.mjs';
import * as model from '../lib/content-model.mjs';

const ENDPOINT = 'https://sudu.studio/.netlify/functions/control';
const handler = (await import('../netlify/functions/control.mjs')).default;

// A string a real response must never contain, planted in errors that come
// from below Control: GitHub, the network, the parser.
const INTERNAL = 'INTERNAL_SHOULD_NEVER_REACH_BROWSER';
const SECRETS = [ENV.GITHUB_TOKEN, ENV.SUDU_CONTROL_PASSWORD, ENV.SUDU_CONTROL_SESSION_SECRET];

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const JPEG = b64([0xFF, 0xD8, 0xFF, 0xE0, ...Array(64).fill(0x20)]);
const PNG = b64([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...Array(64).fill(0x20)]);
const WEBP = b64([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), ...Array(64).fill(0x20)]);
const TEXT = b64(Buffer.from('this is definitely not an image at all'));

// Every response any case produced, so one test can sweep the lot for secrets.
const seen = [];

async function withControl(options, fn) {
  const gh = mockGitHub(options);
  gh.install();
  const before = {};
  for (const [k, v] of Object.entries(ENV)) { before[k] = process.env[k]; process.env[k] = v; }

  let cookie = '';
  const logged = [];
  const realError = console.error;
  console.error = (...args) => logged.push(args.map(String).join(' '));

  const post = async (body, headers = {}) => {
    const res = await handler(new Request(ENDPOINT, {
      method: headers.method || 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sudu-control': '1',
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(headers.method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }));
    const text = await res.text();
    seen.push(text);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie && !/Max-Age=0/.test(setCookie)) cookie = setCookie.split(';')[0];
    let parsed = {};
    try { parsed = JSON.parse(text); } catch { /* body is not JSON */ }
    return { status: res.status, body: parsed, text, setCookie, headers: res.headers };
  };
  const signIn = () => post({ action: 'signIn', password: ENV.SUDU_CONTROL_PASSWORD });

  try {
    return await fn({ post, signIn, gh, repo: gh.repo, logged, cookie: () => cookie });
  } finally {
    console.error = realError;
    gh.restore();
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

// A slug that really is in the site, so the test does not go stale when the
// studio adds or renames work.
const anySlug = (() => {
  const f = siteFiles();
  return model.readSite(f['project.html'], f['work.html']).order[0];
})();

test('only POST reaches the endpoint', async () => {
  await withControl({}, async ({ post }) => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const r = await post({ action: 'status' }, { method });
      assert.equal(r.status, 405, method);
      assert.equal(r.headers.get('allow'), 'POST');
    }
  });
});

test('a request without the Control header is blocked', async () => {
  await withControl({}, async ({ post, signIn }) => {
    await signIn();
    // a cross-site form post can set neither this header nor, under
    // SameSite=Strict, the cookie: two locks on the same door
    const r = await post({ action: 'projects' }, { 'x-sudu-control': '' });
    assert.equal(r.status, 403);
  });
});

test('an unconfigured install refuses everything and names what is missing', async () => {
  await withControl({}, async ({ post }) => {
    const saved = process.env.SUDU_CONTROL_SESSION_SECRET;
    process.env.SUDU_CONTROL_SESSION_SECRET = 'too short';   // under 32 bytes
    const r = await post({ action: 'signIn', password: ENV.SUDU_CONTROL_PASSWORD });
    process.env.SUDU_CONTROL_SESSION_SECRET = saved;
    assert.equal(r.status, 503);
    assert.match(r.body.error, /SUDU_CONTROL_SESSION_SECRET/);
    assert.equal(r.setCookie, null, 'no session was issued');
  });
});

test('the wrong password is refused and issues nothing', async () => {
  await withControl({}, async ({ post }) => {
    const r = await post({ action: 'signIn', password: 'not it' });
    assert.equal(r.status, 401);
    assert.equal(r.setCookie, null);
    assert.equal(r.body.error, 'That password is not right.', 'and it says nothing about which part was wrong');
    for (const secret of SECRETS) assert.equal(r.text.includes(secret), false);
  });
});

test('the right password issues a locked-down cookie and no token', async () => {
  await withControl({}, async ({ signIn }) => {
    const r = await signIn();
    assert.equal(r.status, 200);
    assert.match(r.setCookie, /HttpOnly/i);
    assert.match(r.setCookie, /Secure/i);
    assert.match(r.setCookie, /SameSite=Strict/i);
    assert.match(r.setCookie, /Path=\//);
    for (const secret of SECRETS) assert.equal(r.setCookie.includes(secret), false);
    assert.deepEqual(r.body, { ok: true }, 'the body carries nothing else');
  });
});

test('a privileged action needs a session that verifies', async () => {
  await withControl({}, async ({ post, signIn, cookie }) => {
    let r = await post({ action: 'projects' });
    assert.equal(r.status, 401, 'no cookie');

    await signIn();
    r = await post({ action: 'session' });
    assert.equal(r.status, 200, 'a real session works');

    const [name, value] = cookie().split('=');
    r = await post({ action: 'projects' }, { cookie: `${name}=${value.slice(0, -3)}zzz` });
    assert.equal(r.status, 401, 'a tampered signature');

    r = await post({ action: 'signOut' });
    assert.match(r.setCookie, /Max-Age=0/);
  });
});

test('an unknown action and a malformed body are refused before any work', async () => {
  await withControl({}, async ({ post, signIn, gh }) => {
    await signIn();
    let r = await post({ action: 'rm -rf' });
    assert.equal(r.status, 400);
    r = await post('{ not json', {});
    assert.equal(r.status, 400);
    assert.equal(gh.calls.length, 0, 'GitHub was never contacted');
  });
});

test('a valid edit becomes one commit on the draft, and main is untouched', async () => {
  await withControl({}, async ({ post, signIn, repo }) => {
    await signIn();
    const before = repo.files['project.html'];

    let r = await post({ action: 'saveProject', slug: anySlug, patch: { lede: 'A line written by the test.' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.changed, true);
    assert.deepEqual(r.body.files, ['project.html']);
    assert.equal(repo.commits.length, 1);
    assert.deepEqual(repo.commits[0].paths, ['project.html']);
    assert.equal(repo.files['project.html'], before, 'main did not move');

    r = await post({ action: 'projects' });
    const project = r.body.projects.find((p) => p.slug === anySlug);
    assert.equal(project.lede, 'A line written by the test.', 'it reads back from the draft');
    assert.equal(r.body.state.pr.number, 99, 'one pull request is open');
  });
});

test('invalid input is refused and commits nothing', async () => {
  await withControl({}, async ({ post, signIn, repo }) => {
    await signIn();
    let r = await post({ action: 'saveProject', slug: anySlug, patch: { title: '' } });
    assert.equal(r.body.ok, false);
    assert.ok(r.body.errors.some((e) => e.field === 'title'));

    r = await post({ action: 'saveProject', slug: anySlug, patch: { heroSrc: '../../secret.jpg' } });
    assert.ok(r.body.errors.some((e) => e.field === 'heroSrc'), 'a hero outside images/');

    assert.equal(repo.commits.length, 0, 'nothing was written');
  });
});

test('an upload is accepted only when the bytes are the format they claim', async () => {
  await withControl({}, async ({ post, signIn, repo }) => {
    await signIn();
    const up = (name, type, base64) => post({ action: 'upload', file: { name, type, base64 } });

    for (const [name, type, bytes, ext] of [['a.jpg', 'image/jpeg', JPEG, 'jpg'],
                                            ['b.png', 'image/png', PNG, 'png'],
                                            ['c.webp', 'image/webp', WEBP, 'webp']]) {
      const r = await up(name, type, bytes);
      assert.equal(r.status, 200, name);
      assert.match(r.body.path, new RegExp(`^images/[a-z0-9-]+\\.${ext}$`), r.body.path);
    }
    assert.equal(repo.commits.length, 3);

    const mismatch = /contents do not match/i;
    for (const [name, type, bytes] of [['spoof.jpg', 'image/jpeg', PNG],
                                       ['spoof.png', 'image/png', TEXT],
                                       ['spoof.webp', 'image/webp', JPEG],
                                       ['half.webp', 'image/webp', b64([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('AVI '), 0, 0, 0, 0])]]) {
      const r = await up(name, type, bytes);
      assert.equal(r.status, 400, name);
      assert.match(r.body.error, mismatch, name);
    }
    assert.equal(repo.commits.length, 3, 'no refused upload was written');
  });
});

test('an upload is refused for its type, its size, its emptiness or its name', async () => {
  await withControl({}, async ({ post, signIn, repo }) => {
    await signIn();
    const up = (name, type, base64) => post({ action: 'upload', file: { name, type, base64 } });

    let r = await up('x.gif', 'image/gif', JPEG);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /JPEG, PNG or WebP/);

    r = await up('shell.sh', 'application/x-sh', b64(Buffer.from('#!/bin/sh')));
    assert.equal(r.status, 400);

    r = await up('empty.jpg', 'image/jpeg', '');
    assert.equal(r.status, 400);

    const tooBig = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF]), Buffer.alloc(5 * 1024 * 1024)]);
    r = await up('big.jpg', 'image/jpeg', tooBig.toString('base64'));
    assert.equal(r.status, 400);
    assert.match(r.body.error, /under 4 MB/);

    // a hostile name is refused, not quietly cleaned up into a safe one
    for (const name of ['../../netlify.toml', '../../../etc/passwd', 'a/../../b.jpg', 'nested\\dir.jpg']) {
      r = await up(name, 'image/jpeg', JPEG);
      assert.equal(r.status, 400, name);
      assert.match(r.body.error, /without any folders/, name);
    }
    assert.equal(repo.commits.length, 0, 'nothing was written');
  });
});

test('media lists what the draft holds and which projects use it', async () => {
  await withControl({}, async ({ post, signIn }) => {
    await signIn();
    const r = await post({ action: 'media' });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.files));
    assert.ok(Array.isArray(r.body.missing));
    assert.ok(r.body.files.every((f) => f.path.startsWith('images/') && Array.isArray(f.usedBy)));
  });
});

test('publishing is closed until the preview itself is green, then it resets the draft', async () => {
  await withControl({}, async ({ post, signIn, gh, repo }) => {
    await signIn();
    await post({ action: 'saveProject', slug: anySlug, patch: { lede: 'Publish gate check.' } });

    let r = await post({ action: 'status' });
    assert.equal(r.body.state.canPublish, false, 'the preview is still pending');
    r = await post({ action: 'publish' });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /preview is not ready/);
    assert.equal(gh.made('PUT', /\/merge$/).length, 0);

    repo.statuses = [{ context: PREVIEW, state: 'success' }];
    r = await post({ action: 'status' });
    assert.equal(r.body.state.canPublish, true);

    r = await post({ action: 'publish' });
    assert.equal(r.status, 200);
    assert.equal(r.body.merged, true);
    assert.equal(r.body.state.hasChanges, false);
    assert.equal(r.body.state.behindBy, 0, 'the next edit is not asked to reconcile');
    assert.equal(repo.draftSha, repo.mainSha);

    r = await post({ action: 'projects' });
    assert.equal(r.body.projects.find((p) => p.slug === anySlug).lede, 'Publish gate check.');
  });
});

test('a diverged site is reported, refused and then reconciled', async () => {
  await withControl({ behind: 3, statuses: [{ context: PREVIEW, state: 'success' }] }, async ({ post, signIn }) => {
    await signIn();
    await post({ action: 'saveProject', slug: anySlug, patch: { lede: 'Written while behind.' } });

    let r = await post({ action: 'status' });
    assert.equal(r.body.state.behindBy, 3);
    assert.equal(r.body.state.canPublish, false);

    r = await post({ action: 'publish' });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /changed after this draft was started/);

    r = await post({ action: 'reconcile' });
    assert.equal(r.status, 200);
    assert.equal(r.body.state.behindBy, 0);
  });
});

// --- error redaction ---------------------------------------------------
//
// The invariant: a message reaches the browser only where Control wrote it and
// marked it public. Everything else is one fixed sentence, however much detail
// the exception was carrying.

test('having a message is not what makes an error public', () => {
  // the failure class this replaced: an exception was shown because it had a
  // .message, which every exception has
  assert.equal(publicPartsOf(new Error('Bad credentials')), null);
  assert.equal(publicPartsOf(Object.assign(new Error('Not Found'), { status: 404 })), null);
  assert.equal(publicPartsOf(new TypeError('fetch failed')), null);
  assert.equal(publicPartsOf(null), null);

  assert.deepEqual(publicPartsOf(publicError('Say this.')), { message: 'Say this.', status: 400 });
  assert.deepEqual(publicPartsOf(publicError('And this.', 409)), { message: 'And this.', status: 409 });
  // a marked error can only ever describe itself as a client error
  assert.equal(publicPartsOf(publicError('Nope.', 500)).status, 400);
  assert.equal(publicPartsOf({ publicMessage: '', publicStatus: 400 }), null);
});

test('the log line is written with the live values struck out', () => {
  const env = { ...ENV };
  assert.equal(redactSecrets(`token ${env.GITHUB_TOKEN} used`, env), 'token [redacted] used');
  assert.equal(redactSecrets(`password ${env.SUDU_CONTROL_PASSWORD}!`, env), 'password [redacted]!');
  assert.equal(redactSecrets(env.SUDU_CONTROL_SESSION_SECRET, env), '[redacted]');
  // and anything token-shaped, whether or not it is one of ours
  assert.equal(redactSecrets('ghp_abc123DEF and github_pat_zzz9', {}), '[redacted] and [redacted]');
  assert.equal(redactSecrets('Authorization: Bearer abc.def', {}), 'Authorization: Bearer [redacted]');
  assert.equal(redactSecrets('x'.repeat(500), {}).length, 300, 'and it is bounded');
  assert.equal(redactSecrets(undefined, env), '');
});

test("an error from GitHub never reaches the browser", async () => {
  await withControl({}, async ({ post, signIn, gh, logged }) => {
    await signIn();
    gh.failNext(/\/compare\//, 422, `${INTERNAL}: repository blocked, token ${ENV.GITHUB_TOKEN}`);
    const r = await post({ action: 'status' });

    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { error: 'That did not work. Nothing was changed.' });
    assert.equal(r.text.includes(INTERNAL), false, 'the detail did not travel');
    for (const secret of SECRETS) assert.equal(r.text.includes(secret), false);

    // it was written down, with the live values struck out of it
    const line = logged.join('\n');
    assert.match(line, /control: status/);
    for (const secret of SECRETS) assert.equal(line.includes(secret), false, 'a secret was logged');
    assert.match(line, /\[redacted\]/);
  });
});

test('a network failure never reaches the browser', async () => {
  await withControl({}, async ({ post, signIn, gh }) => {
    await signIn();
    gh.throwNext(/\/compare\//, `fetch failed: ${INTERNAL} https://x:${ENV.GITHUB_TOKEN}@api.github.com/repos`);
    const r = await post({ action: 'status' });
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { error: 'That did not work. Nothing was changed.' });
    assert.equal(r.text.includes(INTERNAL), false);
    for (const secret of SECRETS) assert.equal(r.text.includes(secret), false);
  });
});

test("the content model's own diagnostics never reach the browser", async () => {
  const broken = { 'project.html': `<html>${INTERNAL}</html>`, 'work.html': '<html></html>' };
  await withControl({ files: broken }, async ({ post, signIn }) => {
    await signIn();
    const r = await post({ action: 'projects' });
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { error: 'That did not work. Nothing was changed.' });
    assert.equal(r.text.includes('content-model'), false, 'no parser wording');
    assert.equal(r.text.includes(INTERNAL), false);
  });
});

test('an error Control marked public does reach the browser', async () => {
  await withControl({}, async ({ post, signIn }) => {
    await signIn();
    // written in netlify/functions/control.mjs and marked there
    let r = await post({ action: 'saveProject', slug: 'no-such-project', patch: { lede: 'x' } });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'That project does not exist.');

    // written in lib/github.mjs and marked there
    r = await post({ action: 'publish' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'There is nothing to publish.');

    // and the browser is told what to do about a rejected upload
    r = await post({ action: 'upload', file: { name: 'a.jpg', type: 'image/jpeg', base64: TEXT } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'The file contents do not match its image type.');
  });
});

test('a merge GitHub refuses is reported without repeating its reason', async () => {
  await withControl({
    statuses: [{ context: PREVIEW, state: 'success' }],
    mergeRefusal: `not mergeable: ${INTERNAL}`,
  }, async ({ post, signIn }) => {
    await signIn();
    await post({ action: 'saveProject', slug: anySlug, patch: { lede: 'About to be refused.' } });
    const r = await post({ action: 'publish' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'GitHub did not merge the draft. Nothing else was changed.');
    assert.equal(r.text.includes(INTERNAL), false);
  });
});

test('nothing any case sent back carries a secret', async () => {
  assert.ok(seen.length > 40, `only ${seen.length} responses were collected`);
  const all = seen.join('\n');
  for (const secret of SECRETS) assert.equal(all.includes(secret), false, 'a secret appeared in a response');
  assert.equal(/ghp_|github_pat_|Bearer /.test(all), false, 'a credential shape appeared in a response');
  assert.equal(all.includes(INTERNAL), false, 'internal detail appeared in a response');
});

import assert from 'node:assert/strict';
import * as s from '../lib/session.mjs';

let pass = 0, fail = 0;
const test = (n, f) => { try { f(); pass++; console.log('PASS  ' + n); }
  catch (e) { fail++; console.log('FAIL  ' + n + '\n      ' + e.message.split('\n')[0]); } };

const env = { GITHUB_TOKEN: 'ghp_x', SUDU_CONTROL_PASSWORD: 'correct horse', SUDU_CONTROL_SESSION_SECRET: 'a'.repeat(48) };

test('reports missing configuration', () => {
  assert.equal(s.configured({}), false);
  assert.equal(s.configured({ GITHUB_TOKEN: 'x', SUDU_CONTROL_PASSWORD: 'y' }), false);
  assert.equal(s.configured(env), true);
});

test('password comparison accepts only the exact secret', () => {
  assert.ok(s.secretEqual('correct horse', env.SUDU_CONTROL_PASSWORD));
  for (const wrong of ['', 'correct hors', 'correct horses', 'CORRECT HORSE', null, undefined, 'x'.repeat(500)]) {
    assert.equal(s.secretEqual(wrong, env.SUDU_CONTROL_PASSWORD), false, JSON.stringify(wrong));
  }
});

test('a freshly issued session verifies', () => {
  assert.ok(s.verify(env, s.issue(env)));
});

test('rejects a tampered payload, signature or shape', () => {
  const good = s.issue(env);
  const [payload, sig] = good.split('.');
  assert.equal(s.verify(env, payload + '.' + 'x'.repeat(sig.length)), false, 'forged signature');
  const far = Buffer.from(JSON.stringify({ exp: Date.now() + 9e9, epoch: '1' })).toString('base64url');
  assert.equal(s.verify(env, far + '.' + sig), false, 'swapped payload keeps old signature');
  for (const bad of ['', '.', 'nodot', 'a.b', null, undefined, 42, good + 'x', 'x' + good]) {
    assert.equal(s.verify(env, bad), false, JSON.stringify(bad));
  }
});

test('rejects an expired session', () => {
  const old = s.issue(env, Date.now() - s.TTL_MS - 1000);
  assert.equal(s.verify(env, old), false);
});

test('rejects a session signed with a different secret', () => {
  const other = { ...env, SUDU_CONTROL_SESSION_SECRET: 'b'.repeat(48) };
  assert.equal(s.verify(env, s.issue(other)), false);
});

test('rotating the epoch revokes every existing session', () => {
  const token = s.issue(env);
  assert.ok(s.verify(env, token));
  assert.equal(s.verify({ ...env, SUDU_CONTROL_SESSION_EPOCH: '2' }, token), false);
});

test('the cookie is HttpOnly, Secure and SameSite=Strict', () => {
  const c = s.grant(env);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(c.includes(flag), flag);
  assert.ok(/Max-Age=\d+/.test(c));
  assert.ok(s.revoke().includes('Max-Age=0'));
});

test('reads its cookie out of a crowded header', () => {
  assert.equal(s.readCookie('a=1; sudu_control=abc.def; z=2'), 'abc.def');
  assert.equal(s.readCookie('other_sudu_control=nope'), '');
  assert.equal(s.readCookie(''), '');
  assert.equal(s.readCookie(undefined), '');
});

console.log(`\nsession: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);

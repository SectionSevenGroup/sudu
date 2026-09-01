// Control's session.
//
// The password, the GitHub token and the signing secret are Netlify
// environment variables and never leave the function. What the browser gets
// is a cookie it cannot read: HttpOnly so no script can touch it, Secure so it
// only travels over TLS, SameSite=Strict so another origin cannot make the
// browser send it. The cookie carries an expiry and a signature over that
// expiry, and nothing else — there is no user record to leak.
import crypto from 'node:crypto';

export const COOKIE = 'sudu_control';
export const TTL_MS = 8 * 60 * 60 * 1000;

export const configured = (env) =>
  Boolean(env.GITHUB_TOKEN && env.SUDU_CONTROL_PASSWORD && env.SUDU_CONTROL_SESSION_SECRET);

// Compare in constant time, and compare a digest rather than the raw values so
// two different lengths cannot be told apart by how long the check takes.
export function secretEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a ?? ''), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b ?? ''), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

const sign = (payload, secret) =>
  crypto.createHmac('sha256', secret).update(payload).digest('base64url');

export function issue(env, now = Date.now()) {
  // The epoch lets every existing session be revoked at once by changing an
  // environment variable — the only server-side handle a stateless cookie has.
  const payload = Buffer.from(JSON.stringify({
    exp: now + TTL_MS,
    epoch: env.SUDU_CONTROL_SESSION_EPOCH || '1',
  })).toString('base64url');
  return payload + '.' + sign(payload, env.SUDU_CONTROL_SESSION_SECRET);
}

export function verify(env, token, now = Date.now()) {
  if (typeof token !== 'string' || !token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);
  if (!secretEqual(given, sign(payload, env.SUDU_CONTROL_SESSION_SECRET))) return false;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { return false; }
  if (String(data.epoch) !== String(env.SUDU_CONTROL_SESSION_EPOCH || '1')) return false;
  return Number(data.exp) > now;
}

export function cookieHeader(value, maxAgeSeconds) {
  const parts = [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join('; ');
}

export const grant = (env) => cookieHeader(issue(env), Math.floor(TTL_MS / 1000));
export const revoke = () => cookieHeader('', 0);

export function readCookie(header, name = COOKIE) {
  if (!header) return '';
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}

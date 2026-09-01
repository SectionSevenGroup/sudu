// The only way an error message is allowed to reach the browser.
//
// An exception having a .message is not evidence that the message is safe to
// show. GitHub's API errors, fetch and network errors, and the content-model
// parser's own diagnostics all have one, and none of them are ours to publish.
// So a message travels to the client only when Control itself wrote it here
// and marked it, and everything unmarked becomes one fixed sentence.
export function publicError(message, status = 400, code) {
  const err = new Error(message);
  err.publicMessage = message;
  err.publicStatus = status;
  if (code) err.code = code;
  return err;
}

// Reads the mark back. The status is honoured only inside the client-error
// range, so nothing can arrange for a server fault to be described as one.
export function publicPartsOf(e) {
  if (!e || typeof e.publicMessage !== 'string' || !e.publicMessage) return null;
  const status = Number.isInteger(e.publicStatus) && e.publicStatus >= 400 && e.publicStatus <= 499
    ? e.publicStatus
    : 400;
  return { message: e.publicMessage, status };
}

// Defence in depth for the one place detail is written down. Nothing in
// Control puts a secret into an exception, but the log line is only emitted
// after the live values have been struck out of it, together with anything
// shaped like a GitHub token or an Authorization header.
export function redactSecrets(text, env = {}) {
  let out = String(text == null ? '' : text);
  for (const key of ['GITHUB_TOKEN', 'SUDU_CONTROL_PASSWORD', 'SUDU_CONTROL_SESSION_SECRET']) {
    const value = env[key];
    if (typeof value === 'string' && value.length >= 8) out = out.split(value).join('[redacted]');
  }
  return out
    .replace(/\b(gh[posur]_|github_pat_)[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 300);
}

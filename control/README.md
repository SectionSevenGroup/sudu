# SuDu Control

The studio's private side of the site, at `/control/`.

## What it edits

SuDu has no content database. Everything Control changes is the site's own
source, in place:

| What | Where it lives |
| --- | --- |
| Project title, category, location, scope, status, copy, hero | `static DATA` in `project.html` |
| Reading order for the five editorial projects | `static EDITORIAL` in `project.html` |
| Image proportions | `static DIMS` in `project.html` |
| Index order, and its mirror of name/category/location/thumbnail | `const order` / `const names` in `work.html` |
| Images | `images/` |

`lib/content-model.mjs` reads and writes those objects. It rewrites only the
entry that changed, so a one-field edit is a thirty-line diff rather than a
seven-hundred-line reformat, and a save that changes nothing produces a
byte-identical file.

## How a change reaches the site

    edit  →  Save draft  →  control/draft branch  →  one pull request
          →  Netlify deploy preview  →  Publish  →  merge  →  production

Control never writes to `main`. Publishing is only possible when the preview
has built successfully and the draft is not behind `main`; if the site changed
after the draft was started, Control says so and offers to bring the draft up
to date by merging `main` into it, never by rewriting the branch.

## Configuration

Set these in Netlify, server-side only. They are read inside the function and
never reach the browser, the page, or a log line.

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Fine-grained, this repository only. Contents: read/write. Pull requests: read/write. |
| `SUDU_CONTROL_PASSWORD` | The sign-in password. |
| `SUDU_CONTROL_SESSION_SECRET` | Random, **at least 32 bytes**. Signs the session cookie. A shorter value counts as not configured. |

Optional: `SUDU_CONTROL_SESSION_EPOCH` (change it to sign everyone out),
`SUDU_GITHUB_OWNER`, `SUDU_GITHUB_REPO`, `SUDU_GITHUB_BASE`,
`SUDU_GITHUB_DRAFT`, `SUDU_NETLIFY_SITE`.

Until all three are set — and the secret is long enough — Control answers every
request with a 503 explaining what is missing. Nothing is exposed in the
meantime.

Uploads are JPEG, PNG or WebP, up to 4 MB. The declared type has to match the
file's actual leading bytes, so renaming a file does not get it past the check;
the whole upload is buffered into the function as base64, which is what sets
the ceiling.

## What the browser is told when something fails

An exception is shown to the editor only where Control wrote the sentence and
marked it public, with `publicError()` in `lib/public-error.mjs`. Having a
`.message` is not what makes an error safe to show: GitHub's API errors, failed
fetches and the content model's own parser diagnostics all have one.

Anything unmarked becomes a single fixed line — *That did not work. Nothing was
changed.* — whatever detail it was carrying. The detail is written to the
function log instead, after `redactSecrets()` has struck out the live values of
`GITHUB_TOKEN`, `SUDU_CONTROL_PASSWORD` and `SUDU_CONTROL_SESSION_SECRET`, plus
anything shaped like a GitHub token or an `Authorization` header. If GitHub
refuses a merge, its reason goes to the log and the editor is told that the
draft was not merged and nothing else moved.

## The session

Signing in sets one cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, eight
hours. It carries an expiry and an HMAC over that expiry and nothing else, so
there is no record to leak and no token for a script to read. Every privileged
request also has to carry `X-SuDu-Control: 1`, which a cross-site form post
cannot set.

## Running the tests

From the repository root, with nothing installed:

    node --test test/*.test.mjs

Node 18 or later; there is no framework and no `package.json`. The suite needs
no credential and makes no network request — `test/mock-github.mjs` stands in
for everything under `api.github.com`, and the environment values it uses are
obvious fakes.

| File | What it covers |
| --- | --- |
| `test/content-model.test.mjs` | Reading and rewriting `project.html` and `work.html`: a no-op save is byte-identical, a one-field edit touches one entry. |
| `test/session.test.mjs` | Password comparison, secret strength, signing, expiry, the cookie's flags. |
| `test/github-control.test.mjs` | The repository side: branch creation, fast-forward-only writes, one pull request, the exact deploy-preview gate, publish, the draft reset, reconcile. |
| `test/control-function.test.mjs` | The endpoint end to end: method and header checks, the session, validation, uploads, the publish gate, and error redaction. |

The redaction cases plant `INTERNAL_SHOULD_NEVER_REACH_BROWSER` inside errors
raised below Control — from GitHub, from a failed fetch, from the parser — and
assert that it never appears in a response, while an error Control marked
public does reach the client.

Authenticated production integration is not covered: it needs the private
Control environment values, which are set in Netlify and are not available to
the test suite.

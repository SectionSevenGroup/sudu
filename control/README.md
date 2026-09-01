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

## The draft branch

Control resolves `control/draft` to one exact commit before it reads anything,
and offers every save back to GitHub against that same commit. If the branch
moved in between — someone else pushed, or a second Control tab saved first —
the save is refused with *The draft moved while you were editing.* and nothing
is written. Stale source is never replayed over newer work.

One case is resolved automatically. A draft that carries **no** Control commits
but sits behind `main` is not a conflict: there is nothing on it to preserve,
and reading from it would show the editor stale copies of files someone else
changed. So it is fast-forwarded onto `main` first — a real fast-forward, with
`force` false, since the draft is a strict ancestor. A draft with work on it is
never touched this way however far behind it is; that is a conflict, and it
goes through Reconcile.

## Publishing

Publishing is pinned to one commit. `state()` resolves the draft to a SHA and
then asks every question of that SHA — how it compares to `main`, which files
it touches, whether its deploy preview built — and returns it as `headSha`.
`publish()` merges **that** SHA. It never re-reads the branch for a merge
target, so the commit GitHub merges is always the commit whose preview was
verified. If the draft moved in between, Control says so; and the merge request
carries the verified SHA as GitHub's own precondition, so even a move in the
last instant is refused by GitHub rather than published.

## What Control can change

Only what the interface exposes. `saveProject` accepts exactly the seven
fields the editor renders — `title`, `eyebrow`, `location`, `scope`, `status`,
`lede`, `body` — and drops everything else at the function boundary. The
content model can also write `heroSrc`, `groups`, `gallery` and `related`,
because the features that need them are coming, but none of them has an editor
in this version and so none is reachable through the endpoint. `EDITORIAL` and
the work index order are read, displayed and validated, and likewise not
writable: a reading order sent to `saveProject` is ignored, and there is no
reorder action.

The server's capability and the interface's are the same set on purpose. A
mutating endpoint with no interface is a way in that nobody is looking at.

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
| `test/control-function.test.mjs` | The endpoint end to end: method and header checks, the session, validation, uploads, the publish gate, error redaction, the expected-parent guard, the clean-draft fast-forward, and the absence of any mutation the interface does not expose. |

The redaction cases plant `INTERNAL_SHOULD_NEVER_REACH_BROWSER` inside errors
raised below Control — from GitHub, from a failed fetch, from the parser — and
assert that it never appears in a response, while an error Control marked
public does reach the client.

Authenticated production integration is not covered: it needs the private
Control environment values, which are set in Netlify and are not available to
the test suite.

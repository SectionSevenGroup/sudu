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
| `SUDU_CONTROL_SESSION_SECRET` | Random, at least 32 bytes. Signs the session cookie. |

Optional: `SUDU_CONTROL_SESSION_EPOCH` (change it to sign everyone out),
`SUDU_GITHUB_OWNER`, `SUDU_GITHUB_REPO`, `SUDU_GITHUB_BASE`,
`SUDU_GITHUB_DRAFT`, `SUDU_NETLIFY_SITE`.

Until all three are set, Control answers every request with a 503 explaining
what is missing. Nothing is exposed in the meantime.

## The session

Signing in sets one cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, eight
hours. It carries an expiry and an HMAC over that expiry and nothing else, so
there is no record to leak and no token for a script to read. Every privileged
request also has to carry `X-SuDu-Control: 1`, which a cross-site form post
cannot set.

## Running it locally

The tests in `test/` cover the content model and the session without any
network. The interface and the whole draft/publish state machine can be driven
against a mock GitHub — see the pull request for the harness.

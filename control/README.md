# SuDu Control

The studio's private side of the site, at `/control/`.

## What it edits

SuDu has no content database. Everything Control changes is the site's own
source, in place:

| What | Where it lives |
| --- | --- |
| Home, Work, Studio and Contact copy | `static COPY` in each page under `src/` |
| Contact's common questions | `COPY.faqs` in `src/contact.html` |
| Project title, category, location, scope, status, copy, hero | `static DATA` in `src/project.html` |
| Reading order for the five editorial projects | `static EDITORIAL` in `src/project.html` |
| Image proportions | `static DIMS` in `src/project.html` |
| Index order, and its mirror of name/category/location/thumbnail | `const order` / `const names` in `src/work.html` |
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

## Page copy and translation

The authored text of Home, Work, Studio and Contact lives in `static COPY` on
each page. The markup binds to it and every editable node carries a stable
identifier — `home.heroStatement`, `contact.faq.0.answer` — which is what
`i18n.js` translates against.

That identifier is the point. The old table keyed translations on the exact
English sentence, which works only while the sentence never changes; the
moment copy became editable it would have un-translated the site in four
languages the first time anyone rewrote a line. Now the English can change
freely and the French, Spanish, German and Japanese stay under the same key.
`KEN` in `i18n.js` records the English each translation was made against, so a
changed sentence marks its translations as worth revisiting instead of
dropping them. A key with no entry for a language simply stays in English.

Chrome, navigation labels, system text and the design constants are
deliberately not editable.

## The work index is derived

`work.html` used to carry a hand-kept second copy of every project's title,
category, location and thumbnail. It is now generated from `static DATA` in
`project.html`: `scripts/derive-work-index.mjs` runs first in the Netlify
build, and `reindex()` regenerates it on every Control save. Counters and the
next-project chain come from the order the same way. Nothing about a project
is typed in two places.

## What Control can change

Only what the interface exposes, and every mutation has its own action so the
allowlist stays legible:

| | |
| --- | --- |
| `savePage` | the seven-to-twelve copy fields each page declares, plus Contact's questions |
| `saveProject` | title, category, location, scope, status, opening line, description |
| `hero` | the hero, and the proportions recorded into `DIMS` |
| `addImage` `removeImage` `moveImage` | the gallery, in whichever shape the project already uses |
| `saveGroup` `addGroup` `removeGroup` `moveGroup` | grouped galleries |
| `related` | related projects, which must resolve |
| `editorial` | the reading order — composition only |
| `reorder` | the catalogue order; counters and the next chain follow |
| `addProject` | a new project, its index row and its page |
| `upload` `removeMedia` | the image library |
| `reconcile` `publish` | the draft and the site |

`saveProject` drops any other field at the function boundary. The content model
can write more than this — it has to, for what comes next — but nothing beyond
the list is reachable through the endpoint. `design` is read-only: the grounds,
the typeface, the rail and the hairline are shown so the work stays legible,
and there is no action that changes them.

A mutating endpoint with no interface is a way in that nobody is looking at.

## Configuration

Set these in Netlify, server-side only. They are read inside the function and
never reach the browser, the page, or a log line.

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Fine-grained, this repository only. **Contents: read/write** *and* **Pull requests: read/write**. These are separate permissions and Control needs both: the first lets it commit, the second lets it open the review pull request Netlify builds the preview from. With only the first, a save lands on the draft, no preview is ever built, and Control reports *Draft saved · review needs attention* rather than claiming the save failed. |
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
| `test/control-function.test.mjs` | The endpoint end to end: method and header checks, the session, validation, uploads, the publish gate, error redaction, the expected-parent guard, the clean-draft fast-forward, the SHA-pinned publish, partial success when the review cannot be opened, page copy, every project mutation, Add Project, media safety, and the absence of any mutation the interface does not expose. |
| `test/page-copy.test.mjs` | The four pages against their real source: every field present and bound, a one-field save touching nothing else, a no-op byte-identical, the FAQ, and the translation keys — all four languages present, keys that name a field rather than a sentence, and an English edit leaving them intact. |
| `test/project-editing.test.mjs` | Hero and `DIMS`, both gallery shapes, groups, related projects, the reading order and its bounds, catalogue order with derived counters, Add Project including a round trip through the source, and media usage. |

The redaction cases plant `INTERNAL_SHOULD_NEVER_REACH_BROWSER` inside errors
raised below Control — from GitHub, from a failed fetch, from the parser — and
assert that it never appears in a response, while an error Control marked
public does reach the client.

Authenticated production integration is not covered: it needs the private
Control environment values, which are set in Netlify and are not available to
the test suite.

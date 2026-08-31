# SuDu / Control

Private administration for the static SuDu site.

## Design intent

Control inherits the Off-white SuDu field, Urbanist, the 1760px content rail, restrained hairlines, negative space and the existing mark/header/footer language. It is deliberately not a generic CMS dashboard or visual page builder.

## Current scope

- search/select existing projects;
- edit project name, category, location, scope, status, lede and body copy;
- replace a project hero image;
- add/remove/reorder gallery groups and images;
- select related projects;
- reorder the Work catalogue;
- create a new project;
- save changes to a review branch;
- review a Netlify Deploy Preview;
- explicitly publish or discard the draft.

Global colour tokens, typography, navigation and layout structure remain protected in v1.

## Architecture

Browser:

`/control/` -> `/.netlify/functions/control`

Server-side function:

`control/content-draft` -> GitHub PR -> Netlify Deploy Preview -> explicit Publish -> `main` -> production deploy

GitHub remains the source of truth. The browser never receives the GitHub token.

The existing `scripts/build-projects.mjs` generator now runs as the Netlify build command. This keeps the public output static while allowing Control to update `project.html` and `work.html` as their existing source structures.

## Required Netlify environment variables

Configure as secret/runtime variables on the existing `sudustudioarchitecture` project:

- `GITHUB_TOKEN`
- `SUDU_CONTROL_PASSWORD`
- `SUDU_CONTROL_SESSION_SECRET`

Recommended `GITHUB_TOKEN`: a fine-grained GitHub personal access token restricted to `SectionSevenGroup/sudu` only, with repository **Contents: Read and write** and **Pull requests: Read and write**. Metadata read access is implicit.

`SUDU_CONTROL_SESSION_SECRET` should be at least 32 random bytes.

After changing any of these variables, trigger a fresh deploy. An already-built Netlify Function does not retroactively receive newly configured environment values.

Optional overrides, normally unnecessary:

- `SUDU_GITHUB_OWNER`
- `SUDU_GITHUB_REPO`
- `SUDU_GITHUB_BASE`
- `SUDU_GITHUB_DRAFT`
- `SUDU_NETLIFY_SITE`

## Security model

- `/control/*` is `noindex`, `noarchive`, `no-store` and `DENY` framed through `_headers`.
- The static shell contains no credentials.
- Password verification occurs only inside the Netlify Function.
- A signed 12-hour session token is kept in `sessionStorage`.
- Project writes go to a draft branch, never directly to production.
- Production requires the explicit Publish action.
- Git commits provide an audit/rollback trail.

## Image handling

Control currently accepts JPEG, PNG and WebP up to 12 MB each. Hero image pixel dimensions are recorded in the existing `DIMS` map so generated project pages retain explicit image dimensions.

The public visual crop remains governed by the project template; uploading an image does not change the page composition.

## Pre-merge QA

Review the Deploy Preview at minimum:

- 390px;
- 1440px;
- 2560px;
- project edit/save;
- image upload/replace;
- new-project generation;
- draft preview;
- discard;
- publish only after all above pass.

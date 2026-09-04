# STACK local runtime bundle

`stack-deps.js` is a browser ESM bundle used only by `/stack`.

Pinned sources:
- Three.js `0.180.0`
- `@dimforge/rapier3d-compat` `0.19.0`
- bundled with esbuild `0.25.9`

The bundle is committed deliberately because the SuDu production site is static-first and Netlify publishes the repository root without a required build step. No STACK runtime dependency is loaded by the homepage.

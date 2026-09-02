# SuDu Studio — Design Manifesto & Working Guideline

**For anyone touching sudu.studio: designers, developers, agents, contractors.**

Read this before you open a file. It describes what the site is, what governs it, and what you are not allowed to change without a decision from the studio.

---

## 0. How to use this document

- Sections 1–3 are the argument. Read once.
- Sections 4–11 are the law. Check against them every time you write CSS or markup.
- Section 12 tells you where a given change belongs.
- Section 15 is a checklist. Run it before you open a pull request.
- Section 16 is the list of things that will get a change reverted.

If a rule here conflicts with something you find in the code, the code may be drift. Flag it, do not copy it.

---

## 1. The premise

The site is a drawing, not an interface.

SuDu is an architecture practice. The site borrows the conventions of architectural drawing: one paper stock, one hairline weight, one measured datum, hard-edged type, and photographs that carry the argument. It does not borrow the conventions of contemporary web product design: no cards, no shadows, no rounded corners, no gradients, no badges, no illustration system, no accent-coloured buttons scattered across the page.

Everything on the page sits directly on the ground. When you need to separate two things, you draw one 1px line. That is the whole vocabulary for separation.

## 2. What the site is trying to feel like

Quiet, exact, and confident enough to leave space empty. A visitor should notice the buildings, not the website. The reward for good work here is that nobody comments on the design.

Three tests for anything you add:

1. **Would this look at home on a drawing set?** If it looks like it came from a SaaS dashboard, cut it.
2. **Can the imagery still breathe?** If your addition competes with a photograph, the photograph wins.
3. **Does it survive all three grounds?** Off-white, Charcoal and Burnt. If it only works on one, it is not finished.

## 3. Restraint is the brief

Contributors usually break this site by adding, not by subtracting. A new divider, a second accent colour, a hover lift, a badge on a project card: each is small, and together they turn a drawing into a template.

When you think the page needs something, the answer is usually more space.

---

## 4. Tokens

These are fixed. Control (`/control/`) shows them read-only on purpose: they are design decisions, not settings. There is no endpoint that changes them.

### Grounds

| Token | Value | Use |
|---|---|---|
| Off-white | `#F3F1EA` | The default ground. Every page starts here. |
| Charcoal | `#121110` | Inverted ground, night reading. |
| Burnt | `#C0431F` | The studio colour, used as a full ground. |
| Plate | `#E8E5DC` | The ground behind a gallery tile and the Home hover preview while its image loads. |

The visitor picks the ground from the chrome bar. The choice persists in `localStorage` under `sudu-dm-bg`.

### Ink and its steps

| Token | Value | Use |
|---|---|---|
| Ink | `#171613` | All primary type on the off-white ground. |
| Muted | `#67655D` | Body copy, secondary lines, lede text. |
| Faint | `#A6A399` | Counters, meta labels, footer, image captions. |
| Ink on dark | `#F5F3EC` | Type and rules on Charcoal and Burnt. |

There is no grey ramp beyond these four. Do not introduce `#888`, `#ccc`, or any Tailwind-style neutral scale.

### Line

| Token | Value | Use |
|---|---|---|
| Hairline weight | `1px` on off-white; `0.5px` on Charcoal and Burnt | Every rule, divider, field underline and chip edge. Authored at `1px` in the element's own style attribute; the dark-ground stylesheets then set `border-width:0.5px !important` on everything inside `section` and `footer`, so the same rule renders at half weight on the dark grounds. |
| Rule colour | `rgba(23,22,19,0.13)` | Section rules and dividers on off-white. |
| Rule on dark | `rgba(245,243,236,0.45)` | The same rules on Charcoal and Burnt. |
| Hover wash | `rgba(23,22,19,0.05)` | Whole-row and whole-card hover ground. |

One weight per ground. Author every rule at `1px`; the dark grounds take it to `0.5px` themselves, and that is what ships. What reads as a mistake is two weights side by side on the same ground: a rule authored at `0.5px` on off-white next to a `1px` one, or a border set from a stylesheet with `!important` that escapes the dark-ground rule.

### Rail and gutter

```css
--sudu-gutter: clamp(20px, 4.5vw, 64px);
--sudu-rail:   1760px;
--sudu-inset:  max(var(--sudu-gutter), calc((100% - var(--sudu-rail)) / 2));
```

Live in `css/rail.css`. The rail is expressed as horizontal **padding**, never as a container element. Below roughly 1888px it computes identically to the bare gutter, so there is no breakpoint and no jump.

### Typeface

Urbanist, one family, weights 400 / 500 / 600 / 700 / 900. Home additionally loads 800. Loaded from Google Fonts with `preconnect`. Nothing else ships. No serif companion, no monospace, no icon font.

The two Galano files under `fonts/` are unreferenced. Nothing loads them.

---

## 5. The rail and the canvas

Two layers, and they never mix.

**The canvas is the viewport.** Grounds, section rules, the hero drawing, the header background and the chrome bar run edge to edge. They ignore the rail.

**The rail is where reading happens.** Ordinary content stops at 1760px and centres past that width. Applied by listing a section's `data-screen-label` in `css/rail.css`, or by naming its selector in a page's `:root` block.

### Do

- Add a new section's `data-screen-label` to the list in `css/rail.css` so it inherits the rail.
- Use `var(--sudu-inset)` for horizontal padding on anything the visitor reads.
- Let a section that carries its own internal padding pull back by exactly that amount, so its *content* lands on the rail while its ground still reaches past. The Offerings cards on the home page do this with `--sudu-card-pad`.

### Don't

- Wrap content in a `max-width` div. The rail is padding. A container element breaks the full-bleed canvas underneath it.
- Add a media query to make the rail engage. The crossover is continuous by design.
- Put a vertical value in a rail rule. Those rules are horizontal only.

---

## 6. Typography

One family, five weights, and a small set of fixed roles. Do not invent a new role.

| Role | Size | Weight | Tracking | Leading | Colour |
|---|---|---|---|---|---|
| Hero statement | `clamp(30px, 5.2vw, 81px)` | 900 | `-0.035em` | `0.94` | Ink |
| Page H1 | `clamp(26px, 3.4vw, 44px)` | 900 | `-0.03em` | `1.05` | Ink |
| Home intro heading | `clamp(26px, 3.4vw, 38px)` | 900 | `-0.03em` | `1.1` | Ink |
| Featured title (Home) | `clamp(20px, 2.2vw, 26px)` uppercase | 900 | `-0.02em` | `1.05` | Ink |
| Offering heading (Home) | `16px` uppercase | 900 | `-0.015em` | `1.1` | Ink |
| Section heading | `13px` uppercase | 900 | `+0.02em` | `1` | Ink |
| Eyebrow / label | `10.5px` uppercase | 500 | `+0.1em` | — | Muted or Faint |
| Counter / meta | `11px` | 500 | `+0.08em` | — | Faint |
| Nav link | `13px` | 500 | — | `1.4` | Ink |
| Lede | `15px` | 400 | — | `1.85` | Muted |
| Body | `13–15px` | 400 | — | `1.55–1.7` | Muted |
| Footer | `10.5px` | 400 | — | — | Faint |

Display type is uppercase and tight. Everything else is sentence case and loose.

### Measure

Cap every text block. The site already uses `11ch` and `12ch` for display lines, `39ch`, `44ch`, `58ch` and `62ch` for prose. Pick the one closest to the role you are filling rather than inventing a new number. Use `text-wrap: pretty` on long prose.

### Do

- Set section headings at exactly `13px / 900 / uppercase / +0.02em`. That combination is the site's signature and appears on Work, Founders, Related Work, and the editorial group labels.
- Keep the hero statement to three short lines.

### Don't

- Add a font. Ever.
- Use weight 300 or italic. Neither is loaded.
- Underline body links. Links are `color: inherit; text-decoration: none` and signal themselves through hover.
- Tighten display tracking past `-0.04em`. Letters start touching.

---

## 7. Colour and the three grounds

The dark grounds are not a second stylesheet. `html.dm` applies `filter: invert(1) hue-rotate(180deg)` to sections, then re-inverts images so photographs stay true. Header, footer and the chrome bar are excluded and coloured directly.

The consequences matter more than the mechanism:

- **State colour once, in the element's own style attribute.** The `dm-flat` and `dm-wrap` markers scan inline styles for `#F3F1EA` to decide what is a ground. Colour set from a stylesheet is invisible to that scan.
- **Never set a colour inside a rail rule.** A colour there makes the marker mistake spacing for a cream panel.
- **Test every new surface on all three grounds.** Burnt is the one that catches mistakes: it needs ink type and off-white chrome at the same time.
- **Images that must not invert** are the hero drawing, the team illustration and the SuDu mark. They are exempted by `src` match. A new drawing needs its own exemption.

### The accent, and a live inconsistency

Control declares Burnt `#C0431F` as the studio colour. `css/sketch.css` and `control/control.css` agree. The public pages do not: `contact.html` and its siblings set `a:hover`, `::selection` and `:focus-visible` to `#E17B3E`, a lighter orange, and `work.html` and `studio.html` hard-code the same value into nav hover.

**Do not resolve this on your own.** Flag it and ask the studio which is correct. Whichever wins, it should then be stated once and inherited, not repeated across four pages. Until then, do not add a third orange.

---

## 8. Surface, edge and shadow

There are no cards on this site, even where a grid of rectangles might look like one. The Offerings blocks and the index rows are surfaces that take a hover wash. They have no border, no radius, no shadow and no background of their own.

| Property | Value |
|---|---|
| `border-radius` | `0`, everywhere, without exception |
| `box-shadow` | none, with one exception below |
| `background` on content blocks | transparent, until hover |
| Hover ground | `rgba(23,22,19,0.05)` on the whole row |
| Focus | `2px` solid accent outline, `3px` offset |

An edge, where one is drawn, is the hairline from section 4: `1px` on off-white, rendered at `0.5px` on Charcoal and Burnt by the dark-ground stylesheets. There is no second edge weight.

Hover changes the ground, not the type. When a row lights up, nothing inside it changes colour. Set `color: inherit` on the hover state if a global rule would otherwise turn the label orange.

**The one shadow.** The Home hover preview card (`#suduPreview`), which follows the pointer over the Experience Index rows, carries `box-shadow: 0 18px 44px rgba(23,22,19,.2)` by design. It floats above the page rather than sitting on it, and the shadow is what says so. It is the only shadow on the site. Do not use it as a precedent for a second one.

Header and chrome bar use `backdrop-filter: blur()` over a translucent ground. That is the only blur on the site, and it belongs to fixed chrome. Do not blur content.

---

## 9. Imagery

Photographs are the argument. The layout exists to pace them.

### Editorial sequence (project pages)

Three block types, and no more: **full width**, **pair**, **inset**. An inset is a single image given a width between 28% and 92% and an edge, left or right. It is the pause between two large images.

- Images in the sequence are **never cropped**. Each carries its own `width` and `height` so it reserves its exact proportion and nothing shifts on load.
- A pair shares a bottom datum and allows unequal heights. Below its comfortable width it stacks rather than shrinking, because two 40%-wide architectural photographs on a phone are neither.
- Block rhythm: `padding-top: clamp(56px, 8vw, 132px)`, with the first block at `clamp(36px, 4.5vw, 64px)`.
- Group labels use the section-heading role, above a `1px` top rule, with the counter in Faint on the right.

### Gallery tiles and slots

Grid tiles use `aspect-ratio: 4/3` with `object-fit: cover`. Paired slots are `4/3`; the wide slot is `21/9`. Grids use `repeat(auto-fit, minmax(300px, 1fr))` with a `clamp(16px, 2vw, 28px)` gap.

### Delivery

Responsive sources come from `/.netlify/images` with widths `480, 768, 1080, 1440, 1920` at `q=82`. The studio portrait is authored by hand at `q=88` against a 680px display maximum, because a build script once pattern-matched its tag and left it stuck at opacity zero.

### Do

- Give every image `width` and `height`. Layout shift is a defect here, not a nuisance.
- Write real alt text describing the space, not the filename.
- Add new hero art to the invert-exemption list if it is a drawing.

### Don't

- Crop an editorial-sequence image to make a row line up.
- Put a caption plate or scrim over an image slot's bottom-left corner. The credit overlay renders there.
- Add a fourth block type to the sequence.

---

## 10. Motion

Motion is felt, not seen. Opacity carries the reveal; movement is a few pixels.

**One easing curve for everything:** `cubic-bezier(.16, 1, .3, 1)`.

### The reveal vocabulary

An element opts in with `data-reveal` and declares its role with `data-motion`. The role comes from its place in the composition, never from its index or its file type.

| `data-motion` | Rise | Opacity | Transform | Meaning |
|---|---|---|---|---|
| `major` | `0px` | `1.15s` | `1.15s` | Full-width imagery. Nothing moves. |
| `pair` | `6px` | `0.95s` | `1.05s` | Row members, staggered left to right at 0.1s. |
| `detail` | `7px` | `1.0s` | `1.1s` | Editorial content and grouped galleries. |
| *(none)* | `8px` | `1.0s` | `1.1s` | The quiet default. |

A clip reveal (`data-reveal-clip`) runs `clip-path: inset(0 0 92% 0)` to zero over 1.5s with opacity over 1.2s.

Hover transitions are `.3s ease` for colour and border. Image hover scale is `1.04` over `.8s` on the shared curve.

### Do

- Let a `pair` take its stagger from its own left position in the row. Nothing is hard-coded.
- Force-reveal anything scrolled past before the observer fired. Fast scroll and anchor jumps must never leave a blank block.
- Give the hero a CSS animation fallback that makes it visible after 3.2s regardless of what the script did.

### Don't

- Add a bounce, an elastic curve, or a second easing function.
- Gate content visibility on a transition with no fallback. Transitions pause on hidden tabs and never fire in headless renderers, and the section ships blank.
- Apply one uniform entrance to every section. The reveal should fit what it reveals.
- Forget reduced motion. `@media (prefers-reduced-motion: reduce)` strips every animation and transition site-wide. Anything that depends on a transition to become visible needs an `!important` override there. The hero already has one.

---

## 11. Chrome and interaction

### Header

Fixed, full width, `padding: 34px [inset] 30px`, translucent ground at `rgba(243,241,234,0.94)`. The mark sits at 38px, links at 13px/500 with a transparent 1px bottom border that fills in on hover. The current page carries a solid ink border instead.

### Chrome bar

A fixed 52px strip across the bottom, plus `env(safe-area-inset-bottom)`. It holds three pills: language on the left, music centred, ground swatches on the right. Separators are a 1px `currentColor` rule at 32% opacity, drawn as a `::before` on the second and later visible buttons.

**The bar lives on `<html>`, not `<body>`.** Two reasons, and both will bite you if you move it: Turbo replaces the body on every visit and would orphan it; and a filtered ancestor becomes the containing block for fixed descendants, so the dark-mode filter would break its positioning.

`chrome-bar.js` is a singleton marked `data-turbo-track="reload"`. If you change it, `stamp-assets.mjs` gives it a new content hash and Turbo forces a full document reload so no stale copy survives in an open tab.

### Cursor

The site hides the native cursor (`cursor: none`) and draws a crosshair that stretches with pointer velocity. It is the one piece of pure atmosphere on the site. `js/cursor.js` draws it, for mouse users only: a coarse pointer, a hybrid driven by touch, and a `prefers-reduced-motion: reduce` preference all keep the native cursor, and the script watches those queries live, so the cursor comes back the moment a preference changes.

Keep it working for keyboard users: every interactive element needs a visible `:focus-visible` outline, since focus is the only affordance a keyboard visitor gets. If accessibility work ever removes the crosshair, restore the native cursor in the same change.

### Copy and translation

Every translatable string carries a `data-i18n` key. `i18n.js` translates against **the key, never the English sentence**, because the English sentence is the thing an editor changes. Five languages: EN, FR, ES, DE, JA.

If you add copy, add the key. If you edit copy through Control, the key stays and the FR/ES/DE/JA entries are flagged for review rather than deleted, because retranslation is a decision a person makes.

---

## 12. Where a change belongs

| You want to change | Go to |
|---|---|
| Project title, category, location, scope, status, lede, body | Control → Projects (7 fields, nothing else) |
| Home / Work / Studio / Contact copy, FAQs | Control → Pages |
| Images, hero selection, image order | Control → the project's media |
| Reading order of the five editorial projects | Control → reading order |
| Colour, type, rail, hairline | Nowhere. These are decisions. Ask the studio. |
| Section markup, layout, motion | The source page under `src/`, then rebuild |
| A new project page | `src/project.html` (`DATA`, `DIMS`), plus `order` and `names` in `src/work.html`, then `node scripts/build-projects.mjs` |

The files under `src/` are the source of truth. Everything `scripts/render-static.mjs` and `scripts/build-projects.mjs` emit is generated: the root pages listed in `render-static.mjs` and everything under `/work/<slug>/`. Editing a generated file is wasted work: the next build overwrites it.

`build-projects.mjs` checks `order`, the project `DATA` and the `NN / total` counters against each other and fails loudly on a mismatch, so a half-added project cannot ship.

---

## 13. Code conventions

The pages carry inline styles by design. This is not legacy and it is not laziness: the theme system reads inline style attributes to classify surfaces, and Control's content model rewrites single entries in place so a one-word edit produces a thirty-line diff a human can review.

Follow the site's own hand when you write data: single quotes, two-space steps, short objects on one line, wrapping past 96 characters.

### Do

- Comment the reason, not the mechanism. The existing comments explain what broke last time and why the current shape prevents it. Keep that habit.
- Keep `scripts/audit-hardening.mjs` idempotent. Running it twice must produce identical files.

### Don't

- Put a Turbo router tag in the body. Turbo re-activates body scripts on every visit, so it starts a second Turbo session on every navigation.
- Add a second script that owns an element another script already owns. The founders portrait broke exactly this way.

---

## 14. Accessibility floor

- Focus is always visible: `2px` outline, `3px` offset, on every button, link and field.
- Reduced motion is honoured site-wide, and nothing depends on a transition to become visible.
- Placeholders are set explicitly per ground. Pseudo-elements are not reached by `*` selectors, which is how they once went invisible on Charcoal.
- Body copy must clear 4.5:1 against its ground. Muted `#67655D` on off-white passes. Check any new pairing, especially on Burnt.
- Language buttons carry a `::after` hit-area expansion of `-12px -6px` so a 10.5px target is still tappable.

---

## 15. Review checklist

Before opening a pull request:

- [ ] Every new rule is `1px` and uses the site's rule colour
- [ ] No `border-radius`, no `box-shadow`, no gradient
- [ ] No new font, weight, or colour outside the token table
- [ ] New sections are registered in `css/rail.css`
- [ ] Every image has `width` and `height` and real alt text
- [ ] Type roles match the table in section 6
- [ ] Motion uses the one easing curve and the four `data-motion` roles
- [ ] Checked on off-white, Charcoal **and** Burnt
- [ ] Checked at 360px, 768px, 1440px and 2200px (past the rail)
- [ ] Checked with reduced motion on, and with keyboard only
- [ ] New copy has a `data-i18n` key
- [ ] `node scripts/build-projects.mjs` runs clean
- [ ] `node --test` passes

---

## 16. The short list of things that get reverted

1. A card, a rounded corner, a gradient, or a shadow anywhere other than the Home hover preview card.
2. A second typeface, or a weight the site does not load.
3. A colour outside the token table. Especially a third orange.
4. A `max-width` container element instead of the rail padding.
5. A breakpoint added to make the rail engage.
6. Motion with a bounce, a second easing curve, or a uniform per-section fade.
7. Content that only becomes visible after a transition fires.
8. An edit to a generated file: any root page that `render-static.mjs` emits, or anything under `/work/<slug>/`.
9. A change checked on one ground only.
10. Copy added without a `data-i18n` key.

---

## 17. Open decisions for the studio

Three things in the code disagree with themselves. None should be settled by a contributor.

1. **The accent colour.** Burnt `#C0431F` is declared; `#E17B3E` ships on the public pages for hover, selection and focus. Pick one, state it once, inherit it everywhere.
2. **Rule opacity.** `css/sketch.css` declares `--rule` at `rgba(23,22,19,.13)` and `--rule-strong` at `rgba(23,22,19,.34)`. The pages use `0.13` for most rules, and also `0.22`, `0.3`, `0.32` and `0.4` for heavier lines, with `0.05` as the hover wash. On the dark grounds the rule opacity ranges from `0.18` to `0.72`, with `0.45` and `0.5` the most common. Decide which of these are roles and which are drift.
3. **Hidden cursor and accessibility.** `cursor: none` is atmospheric and load-bearing for the site's character. Reduced motion and coarse pointers already restore the native cursor (`js/cursor.js`); the open question is a keyboard user on a mouse device. Confirm the focus-visible coverage is complete enough to carry them on its own, or add a preference of the site's own.

---

*Last reviewed against the repository at the time of writing. When a rule here and the code disagree, the code is a candidate for correction, not a precedent.*

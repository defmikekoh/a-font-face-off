Font Fetch + Apply Logic
========================

Overview
--------
- The extension lets you pick any Google Font (and some custom ones) and apply it to two preview panes (Top/Bottom).
- Variable axes are discovered dynamically and exposed as sliders; only axes you “activate” get applied.
- State (font, basic props, active axes/values) persists across popup opens.

Sources & Permissions
---------------------
- Google Fonts:
  - Metadata: `https://fonts.google.com/metadata/fonts` (used to build the family list).
  - CSS: `https://fonts.googleapis.com/css2?family=<Family+Name>&display=swap` (used to load the font and discover axis hints).
  - Font files: served by Google (TTF/OTF or WOFF2).
- Custom fonts:
  - BBC Reith Serif: loaded via `@font-face` rules in `popup.css`.
  - ABC Ginto Normal Unlicensed Trial: stylesheet injected from `fonts.cdnfonts.com` and activation checked via `document.fonts.load()`.
- Manifest permissions/CSP allow all above hosts for style and font loading.

Selection → Load Flow
---------------------
1) User opens the Font Picker modal and clicks a family.
2) `loadFont(position, fontName)` applies the choice and kicks off loading:
   - Google families: adds a `css2` `<link>` (if not present).
   - ABC Ginto: injects the CDN stylesheet, then waits on `document.fonts.load('400 1em "ABC Ginto Normal Unlicensed Trial"')` before applying.
   - BBC Reith: relies on the static `@font-face` declarations in CSS.

Axis Discovery (getOrCreateFontDefinition)
------------------------------------------
File refs: `popup.js:136`, `popup.js:240`, `popup.js:378`
- Fetch metadata (once per session): `ensureGfMetadata()` → family list and axis tags.
- Get the family’s CSS: `fetchGoogleCssInfo()` builds the `css2` URL correctly (spaces → `+`, no extra encoding).
- Prefer exact fvar parsing:
  - Extract a font URL from the CSS (`extractFirstFontUrl`), preferring `.ttf`/`.otf` when present.
  - If TTF/OTF: fetch and parse `fvar` via `opentype.js`.
  - If only WOFF2: lazy‑load the vendored decoder (fonteditor‑core wasm) and convert WOFF2→TTF, then parse `fvar`.
- If fvar is unavailable: fall back to CSS hints for registered axes:
  - `font-weight: 100 900` → `wght` range
  - `font-stretch: 75% 125%` → `wdth` range
  - `font-style: oblique -10deg 0deg` → `slnt` range
  - Presence of italic blocks → `ital`
- Build `axes/defaults/ranges/steps`, merge with metadata tags, cache in `dynamicFontDefinitions`.

Controls UI (generateFontControls)
----------------------------------
File ref: `popup.js:1141`
- If the selected family has axes, build sliders + number inputs for each axis.
- Each axis starts “unset”; moving a control “activates” it and undims the group.
- `axisInfo` provides human‑readable descriptions shown via tooltips.

Applying Styles (applyFont)
---------------------------
File ref: `popup.js:1386`
- Sets `font-family` to the chosen family on heading + paragraph.
- Applies basic properties (size, line‑height, color).
- Weight: applied only if you’ve “touched” the Weight control; otherwise the font’s default weight shows.
- Variable axes: only axes you’ve activated are written to `font-variation-settings`.
- Non‑variable fonts: any previous `font-variation-settings` are cleared.

Persistence
-----------
- Current config for both panes is saved in `localStorage` (`fontFaceoffState`) on every apply.
- On popup open, the saved state is restored and re‑applied (including active controls/axes).
- Favorites are stored separately (`fontFaceoffFavorites`) and surfaced in the picker under “Favorites”.

Font Picker Modal
-----------------
File refs: `popup.js:720` (setup), `popup.html` (modal markup), `popup.css` (styles)
- Lists “Custom Fonts” (BBC Reith, ABC Ginto) first, then optional “Favorites”, then A–Z sections.
- Search filters the list; A–Z rail jumps within the scrollable list (title bar and rail remain fixed).
- Opens by clicking the Font Family field; closes via X, overlay click, or Esc.

Decoder & Parsers
-----------------
- opentype.js (vendored as `lib/opentype.min.js`) parses `fvar` from TTF/OTF.
- WOFF2 decoder: vendored from `fonteditor-core@2.6.3` (as `lib/fonteditor-woff2.js/.wasm`).
  - Loaded on demand; configured via `ensureFonteditorWoff2()` so the wasm path resolves.

Notable Edge Cases
------------------
- css2 URL building must preserve `+` between words (don’t `encodeURIComponent` the family string after adding `+`).
- If a family serves only WOFF2, the decoder is required for exact custom axis sliders; without it, only registered axes are shown.
- ABC Ginto is static; weight is available at specific steps. It’s activated deterministically by waiting on `document.fonts`.
- BBC Reith loads via CSS @font‑face; CSP + server CORS enable use within the extension.

Key Code References
-------------------
- `popup.js:1034` — `loadFont(position, fontName)`
- `popup.js:1107` — `loadGoogleFont(fontName)` (css2 link)
- `popup.js:136` — `getOrCreateFontDefinition(fontName)` (fvar/CSS axes discovery + cache)
- `popup.js:240` — `extractFirstFontUrl(cssText)` (prefer TTF/OTF)
- `popup.js:378` — `deriveAxisRangesFromCss(cssText)` (registered axes)
- `popup.js:1386` — `applyFont(position)` (style application + persistence)

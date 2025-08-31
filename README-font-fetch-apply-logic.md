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
  - Metadata: bundled `data/gf-axis-registry.json` (family list + axis tags/ranges/defaults). Update via `npm run gf:update`.
  - CSS2: axis‑tag URL built from metadata (see “CSS2 Axis Map”) and added via a `<link>`.
  - Font files: downloaded by the browser via the css2 stylesheet (no host permissions required).
- Custom fonts:
  - BBC Reith Serif: loaded via `@font-face` rules in `popup.css`.
  - ABC Ginto Normal Unlicensed Trial: stylesheet injected from `fonts.cdnfonts.com` and activation checked via `document.fonts.load()`.
- Permissions: no host permissions requested. CSP allows style/font loads from required CDNs.

Selection → Load Flow
---------------------
1) User opens the Font Picker modal and clicks a family.
2) `loadFont(position, fontName)` applies the choice and kicks off loading:
   - Google families: adds a `css2` `<link>`. If metadata provides axis information for the family, we request an axis‑tag css2 URL with exact ranges and all axes; otherwise we request the plain css2 URL.
   - ABC Ginto: injects the CDN stylesheet, then waits on `document.fonts.load('400 1em "ABC Ginto Normal Unlicensed Trial"')` before applying.
   - BBC Reith: relies on the static `@font-face` declarations in CSS.

Axis Discovery (getOrCreateFontDefinition)
-----------------------------------------
File refs: `popup.js:136`
- Load bundled metadata once: `ensureGfMetadata()` → family list + axis tags/ranges/defaults.
- Build `axes/defaults/ranges/steps` entirely from metadata (no remote CSS probing, no fvar parsing), cache in `dynamicFontDefinitions`.

CSS2 Axis Map (no probing)
--------------------------
- We no longer “probe” css2 to guess ranges. At runtime we derive axis‑tag css2 URLs from Google Fonts metadata (via `ensureGfMetadata`).
- Runtime map (in memory), per family:
  - `tags`: all axes (ital and any custom axes), ordered for css2 (lowercase tags first, then uppercase; alphabetical within each group)
  - `ranges`: numeric `[min, max]` for every non‑ital axis
  - `defaults`: axis default values from metadata (when provided per family)

- URL composition: `buildCss2Url()`
  - Uses the runtime map to compose `family=<Name>:<tags>@<tuple>[;…]&display=swap`. Ital yields two tuples (0,…;1,…).
  - If metadata lacks entries for a family, falls back to the plain css2 URL; only registered axes inferred by the browser will apply.
  - Example (Merriweather): `family=Merriweather:ital,opsz,wdth,wght@0,18..144,87..112,300..900;1,18..144,87..112,300..900`
  - Example (Roboto Flex): `family=Roboto+Flex:opsz,slnt,wdth,wght,GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC@…`

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
- Registered axis mapping: when active, wdth → `font-stretch: <wdth>%`, slnt/ital → `font-style: oblique <deg>` / `italic`. These take precedence for visible changes.
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
- css2 family param must preserve `+` between words (don’t over‑encode after replacing spaces).
- Only list axes that have numeric ranges in tuples; ital is handled as 0/1.
- If a family serves only WOFF2, the decoder is required for exact custom axis sliders; otherwise only registered axes may be shown.
- ABC Ginto is static; weight is available at specific steps. It’s activated deterministically by waiting on `document.fonts`.
- BBC Reith loads via CSS @font‑face; CSP + server CORS enable use within the extension.

Logging
-------
- The loader logs:
  - `Loading css2 …` / `css2 loaded` / `css2 failed`
  - `Using metadata-derived axis-tag css2 …` (when map is used)
  - `Downloading font binary …` and whether WOFF2→TTF decoding is used

Key Code References
-------------------
- `popup.js:1034` — `loadFont(position, fontName)`
- `popup.js:1107` — `loadGoogleFont(fontName)` (css2 link)
- `popup.js:136` — `getOrCreateFontDefinition(fontName)` (fvar/CSS axes discovery + cache)
- `popup.js:240` — `extractFirstFontUrl(cssText)` (prefer TTF/OTF)
- `popup.js:378` — `deriveAxisRangesFromCss(cssText)` (registered axes)
- `popup.js:1386` — `applyFont(position)` (style application + persistence)

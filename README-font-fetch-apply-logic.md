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
  - CSS2: axis‑tag URL built from metadata (see "CSS2 Axis Map") and added via a `<link>` (standard domains).
  - FontFace-only domains (default: x.com): WOFF2 files fetched via background script and loaded through FontFace API to bypass CSP.
  - Font files: downloaded by the browser via css2 stylesheet (standard) or background script (FontFace-only).
- Custom fonts:
  - BBC Reith Serif: loaded via `@font-face` rules in `popup.css`.
  - ABC Ginto Normal Unlicensed Trial: stylesheet injected from `fonts.cdnfonts.com` and activation checked via `document.fonts.load()`.
- Permissions: host permissions requested for cross-origin font fetching on FontFace-only domains.

Font Caching System
-------------------
File ref: `background.js:1-125`
- **Cache Storage**: All WOFF2 font files fetched via background script are cached in browser.storage.local with 1-year expiry.
- **Cache Key**: Font URL (each unique URL cached separately).
- **Cache Limits**: 80MB maximum total cache size (optimized for Firefox). No count limit.
- **Cache Management**: 
  - Smart cleanup when size limit approached - keeps newest fonts within size constraints
  - Cache hit/miss logging for performance monitoring
  - Manual cache clearing via options page
- **Benefits**: Faster font loading on repeated visits, works across tabs/page reloads, reduces network usage.
- **Persistence**: Cache survives browser restarts and works across all tabs visiting FontFace-only domains.

Selection → Load Flow
---------------------
1) User opens the Font Picker modal and clicks a family.
2) `loadFont(position, fontName)` applies the choice and kicks off loading:
   - Google families (standard domains): adds a `css2` `<link>`. If metadata provides axis information for the family, we request an axis‑tag css2 URL with exact ranges and all axes; otherwise we request the plain css2 URL.
   - Google families (FontFace-only domains): uses background script to fetch WOFF2 files and loads via FontFace API to bypass CSP restrictions.
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
- Weight: applied only if you've "touched" the Weight control; otherwise the font's default weight shows.
- Variable axes: only axes you've activated are written to `font-variation-settings`.
- Registered axis mapping: when active, wdth → `font-stretch: <wdth>%`, slnt/ital → `font-style: oblique <deg>` / `italic`. These take precedence for visible changes.
- Non‑variable fonts: any previous `font-variation-settings` are cleared.

Style Application Methods
-------------------------
File ref: `content.js`
- **Standard domains**: CSS stylesheets injected into page `<head>` via `insertCSS` or style elements.
- **Inline apply domains** (default: x.com): Font properties applied directly to DOM elements via `element.style.setProperty()` with `!important` to resist CSP and SPA overrides.
- **Body mode**: Applies to body and most descendants (excluding headers). Uses broad selectors for maximum coverage.
- **Third Man In mode**: 
  - Standard sites: Uses element walker to mark text elements by type (serif/sans/mono) before applying styles to marked elements only.
  - x.com hybrid approach: Uses broad CSS selectors targeting x.com's specific DOM patterns instead of marked elements for better persistence against aggressive JavaScript.

SPA Resilience and Protection Layers
------------------------------------
File ref: `content.js:171-390`
For inline apply domains (especially x.com), multiple protection layers combat aggressive JavaScript style clearing:
- **Primary**: Inline styles with `!important` priority
- **Secondary**: CSS custom properties (`--affo-font-family`) with `!important`
- **Tertiary**: Data attributes as backup storage (`data-affo-font-family`)
- **Active monitoring**: Every 1-5 seconds style re-application for 10 minutes
- **Event-based restoration**: Focus/visibility change listeners
- **MutationObserver**: Monitors DOM changes and applies styles to new elements
- **History API hooks**: Detects SPA navigation and re-applies styles
- **Style manipulation detection**: Checks computed styles vs expected and restores overridden fonts

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

No Remote Probing
-----------------
- No CSS probing or fvar parsing. Axes and defaults come from metadata only.

Domain-Specific Configurations
------------------------------
File refs: `options.html`, `options.js`, `content.js`
- **FontFace-only domains**: List of domains (default: x.com) where fonts are loaded via FontFace API with background script WOFF2 fetching instead of CSS links to bypass CSP restrictions.
- **Inline apply domains**: List of domains (default: x.com) where font styles are applied via inline styles directly to elements instead of CSS stylesheets to resist CSP and SPA overrides.
- Both lists are configurable via the extension's options page and stored in browser.storage.local.
- Background script (`background.js`) handles cross-origin WOFF2 fetching with host permissions.

x.com Specific Optimizations
----------------------------
File refs: `content.js:419-437`, `content.js:158-202`
- **Hybrid selectors**: Third Man In mode uses broad CSS selectors instead of marked elements:
  - Sans: `div[data-testid], span[data-testid], a[data-testid], button[data-testid], div[role], span[role], a[role], button[role], p, div:not([class*="icon"]), span:not([class*="icon"])`
  - Serif: `div[data-testid*="tweet"] span, article span, p, blockquote, div[role="article"] span`
  - Mono: `code, pre, span[style*="mono"], div[style*="mono"]`
- **Enhanced monitoring frequency**: 1-second intervals for first 2 minutes, then 5-second intervals for 8 more minutes
- **ArrayBuffer font loading**: WOFF2 files loaded as ArrayBuffer (not data URLs or blob URLs) to bypass CSP restrictions
- **Custom font support**: All custom fonts (National, BBC Reith Serif, ABC Ginto, FK Roman, TiemposText) work on x.com via background script fetching

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
  - `Loading css2 …` / `css2 loaded` / `css2 failed` (standard domains)
  - `Using metadata-derived axis-tag css2 …` (when map is used)
  - `Trying background script WOFF2 fetch …` / `Background script WOFF2 fetch successful` (FontFace-only domains)
  - `Applying inline styles …` / `Applied inline styles to N elements` (inline apply domains)

Key Code References
-------------------
- `popup.js:1034` — `loadFont(position, fontName)`
- `popup.js:1107` — `loadGoogleFont(fontName)` (css2 link)
- `popup.js:136` — `getOrCreateFontDefinition(fontName)` (metadata-derived axes/defaults)
- `popup.js:1386` — `applyFont(position)` (style application + persistence)
- `content.js:497` — `tryFontFaceAPI(fontName)` (FontFace-only domains with background script WOFF2 fetching)
- `content.js:66` — `applyInlineStyles(fontConfig, fontType)` (inline apply domains with SPA resilience)
- `content.js:58` — `shouldUseFontFaceOnly()` / `shouldUseInlineApply()` (domain detection)
- `content.js:419` — `getHybridSelector(fontType)` (x.com broad selectors for Third Man In mode)
- `content.js:440` — `restoreManipulatedStyles()` (style manipulation detection and restoration)
- `content.js:571` — `runElementWalker(fontType)` (semantic text classification for Third Man In mode)
- `background.js:2` — WOFF2 fetching for cross-origin font loading with persistent caching
- `options.js:87` — `saveInline()` / `resetInline()` (inline apply domain management)

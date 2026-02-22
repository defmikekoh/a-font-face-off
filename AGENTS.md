# AGENTS.md

This file provides guidance to Codex, Claude Code (claude.ai/code), and Gemini when working with code in this repository.

## Project Overview

A Font Face-off is a Firefox browser extension (Manifest V2) that replaces and compares fonts on web pages in real-time. No font files are bundled; all fonts are fetched at runtime from Google Fonts or custom CDN hosts. The extension uses a single injected `<style>` element (Facade pattern) rather than per-node DOM mutations.

## Key Commands

- `npm run build` — Build extension with web-ext (toggles AFFO_DEBUG to false, builds, toggles back to true)
- `npm run build:latest` — Build and copy to `web-ext-artifacts/latest.xpi`
- `npm run gf:update` — Update Google Fonts metadata into `data/gf-axis-registry.json`
- `npm run lint` — Run ESLint across all source files

- `npm test` — Run unit tests (Node's built-in test runner, `node:test`)

## Development Guidelines

- `docs/architecture/DATA_STRUCTURES.md` should be a point of reference and updated accordingly when data structures change.
- Don't run `web-ext run` — it opens an interactive browser you can't control. Tell the user to run it for manual testing. For programmatic inspection, use `npm run build:latest` + Selenium/geckodriver (see `.claude/skills/desktop-testing/`) or ADB for Android devices (see the `firefox-extension-debug` and `android-use` skills).
- Generally, don't create fallbacks to fix errors unless specifically told to.
- `zothercode/fontonic-firefox-android/` is another font changing extension that may occasionally be used as a point of reference.
- zothercode/fontonic-android-styler-v2.user.js is a user script that changed Substack fonts which this extension largely does also.
- use ztemp/ as temporary area instead of /tmp/
- at ztemp/violentmonkey is a cloned copy of the violentmonkey extension

## Architecture

### Source Files (no build step — raw JS served directly)

| File | Role |
|---|---|
| `config-utils.js` | Pure logic functions (normalizeConfig, determineButtonState, axis helpers, buildAllAxisSettings) — shared between popup.js and Node tests |
| `popup.js` | Primary UI logic: font selection, axis controls, mode switching, favorites, state management |
| `popup.html` / `popup.css` | Extension popup markup and styles |
| `content.js` | Injected into pages at `document_end`; handles font application, inline styles, MutationObserver, SPA resilience (idempotent hook registry), unified element walker, preconnect hints |
| `css-generators.js` | Shared CSS generation functions (body, body-contact, TMI) with conditional `!important`, italic/bold-italic rules for `<em>`/`<i>` elements |
| `background.js` | Non-persistent background script; CORS-safe font fetching, WOFF2 caching (80MB cap), Google Drive sync, Quick Pick message handlers (`quickApplyFavorite`, `quickUnapplyFonts`, `quickRewalk`) |
| `left-toolbar.js` | Toolbar overlay injected at `document_start`; performs early font preloading by reading domain configs and injecting Google Fonts `<link>` tags + preconnect hints as soon as `document.head` is available. Also hosts the Quick Pick panel (injected into page DOM with `data-affo-guard` + Shadow DOM-style isolation via explicit baseline styles: `font-family: system-ui, sans-serif`, `font-size: 14px`) for applying top-5 favorites, Rewalk (re-walks DOM for dynamic content when TMI fonts are applied), and toggling per-domain settings (FontFace-only, Inline Apply, Aggressive Override). Scroll settings (overlap, longpress overlap, scroll type) are cached in the `options` object at startup and invalidated via `storage.onChanged` — page-up/down handlers read synchronously from cache instead of async storage round-trips |
| `left-toolbar-iframe.js` | Iframe-based toolbar implementation |
| `options.js` / `options.html` | Settings page for domain configs and cache management |
| `whatfont_core.js` | Font detection overlay (injected at `document_idle` with `jquery.js`) — detects font name, size, weight, variable axes (registered axes via CSS properties, custom axes via `font-variation-settings`) |
| `custom-fonts.css` | @font-face rules for non-Google custom fonts (BBC Reith, Graphik Trial, etc.) |
| `data/gf-axis-registry.json` | Google Fonts metadata (~2.4MB, updated via `npm run gf:update`) |

### Three View Modes

- **Body Contact** — Single font applied to body text (excludes headings, code, nav, form controls, syntax highlighting, ARIA roles, metadata/bylines, widgets/ads). Per-origin persistence via `affoApplyMap`.
- **Face-off** — Split-screen font comparison inside the popup. No page interaction.
- **Third Man In** — Three panels (Serif, Sans, Mono) each targeting their font family type on the page. Content script marks elements with `data-affo-font-type` using a unified walker (`runElementWalkerAll`) that classifies all active types in a single DOM pass. Walker uses chunked processing (2000 elements per chunk, yielding to main thread via `setTimeout(0)` between chunks) to avoid blocking the UI on large pages. Markers are updated incrementally without upfront clearing to prevent "revert flash" during rechecks. Includes delayed rechecks (`document.fonts.ready`, plus 700ms/1600ms on pages under 5,000 elements) for dynamic/lazy-loaded content, and SPA navigation hooks to re-walk on route changes.

### Storage Keys (browser.storage.local)

Core keys: `affoApplyMap` (domain font configs), `affoUIState` (current UI state per mode), `affoCurrentMode`, `affoFavorites`, `affoFavoritesOrder`, `affoFontCache` (WOFF2 cache), `affoAggressiveDomains` (domains using `!important`), `affoPreservedFonts` (icon font families never replaced). See `docs/architecture/DATA_STRUCTURES.md` for full details.

### Google Drive Sync

- Google Drive sync covers `custom-fonts.css`, domain settings (`affoApplyMap`), favorites (`affoFavorites`, `affoFavoritesOrder`), aggressive domains, preserved fonts, and Substack roulette settings.
- OAuth via tab-based flow with PKCE (opens tab + intercepts redirect via webRequest; works on both desktop and Android Firefox). Tokens stored in `affoGDriveTokens`.
- Files stored in a visible "A Font Face-off{suffix}" folder in the user's Google Drive. All synced items are single files in the root folder (no subfolders): `domains.json`, `favorites.json`, `custom-fonts.css`, `known-serif.json`, `known-sans.json`, `fontface-only-domains.json`, `inline-apply-domains.json`, `aggressive-domains.json`, `preserved-fonts.json`, `substack-roulette.json`.
- A `sync-manifest.json` tracks modification timestamps for all synced items.
- **Bidirectional merge**: compares local vs remote timestamps per item; newer version wins. Entire file is atomic (no per-entry merge within a file).
- Domain settings (`affoApplyMap`) are stored as a single `domains.json` file. Any change to any domain marks the whole file as modified.
- Domain settings auto-sync from `background.js` when `affoApplyMap` changes. Favorites auto-sync when `affoFavorites` or `affoFavoritesOrder` changes. All other synced settings auto-sync on storage change.
- Manual sync via "Sync Now" button in Advanced Options. "Clear Local Sync" button resets local sync metadata without disconnecting OAuth.
- `self.addEventListener('online', ...)` triggers sync when connectivity returns (covers wake-from-sleep). `gdriveFetch()` throws when offline to prevent futile requests mid-sync.
- Auto-sync failures emit `affoSyncFailed` runtime messages consumed by Options page modal retry UX.
- Key functions: `runSync()` (core bidirectional merge), `gdriveFetch()` (auth + retry wrapper), `ensureAppFolder()`, `scheduleAutoSync()`, `markLocalItemModified()`.

### Font Config "No Key" Architecture

Only store properties with actual values — no nulls, no defaults. `fontName` is always present when configured; `variableAxes` is always an object (even if empty `{}`). Primitive properties like `fontSize`, `fontColor` only appear when explicitly set. `letterSpacing` (em units, range -0.05 to 0.15) uses `!= null` checks everywhere since `0` is a valid value (falsy in JS).

### Key Config Functions (popup.js)

- `getCurrentUIConfig(position)` — reads current UI state into canonical config (respects active/unset controls); includes `fontFaceRule` for custom fonts
- `normalizeConfig(raw)` — converts any external data (favorites, domain storage, legacy formats) into canonical config
- `buildPayload(position, config?)` — builds payload for domain storage; adds `styleId` for TMI; does NOT include `fontFaceRule` or `css2Url` (both looked up on-demand to avoid per-domain duplication)
- `storeCss2UrlInCache(fontName, css2Url)` — stores Google Fonts URL in global `affoCss2UrlCache`
- `getFontMemory(position)` — returns runtime font memory object for a panel position
- `MODE_CONFIG` — data-driven mode metadata (positions, stateKeys, useDomain) used by save/switch/applied-check functions
- `PANEL_ROUTE` — routing table mapping `(mode, panelId)` → `{ apply, unapply }` functions, replacing mode-branching if/else chains
- `determineButtonState(changeCount, allDefaults, domainHasApplied)` — shared apply/reset/hide decision logic
- `getPositionCallbacks(position)` — returns mode-appropriate preview/button/save callbacks for a panel position
- `setupSliderControl(position, controlId, options?)` — generic factory for slider + text input handlers
- `cloneControlPanel(position)` — clones body-font-controls template to create top/bottom/serif/sans/mono panels at startup (position-aware headings, button text)
- `resetFontForPosition(position)` — generic reset for any panel position (sliders, text inputs, value displays, variable axes)
- `togglePanel(panelId)` — unified panel toggle for all modes (handles face-off overlay/grip state, narrow-screen enforcement)

### Variable Font Axes

Registered axes (`wght`, `wdth`, `slnt`, `ital`, `opsz`) map to high-level CSS properties (`font-weight`, `font-stretch`, `font-style`) AND are also included in `font-variation-settings` via `buildAllAxisSettings()`. This dual strategy keeps high-level properties for cascade/inheritance while bypassing `@font-face` descriptor clamping (e.g. Google Fonts serving `font-weight: 400` single-value descriptors that silently clamp `font-weight: 470` to 400). Custom axes use only `font-variation-settings`. Only "activated" axes get applied. Metadata comes from `data/gf-axis-registry.json`. WhatFont (`whatfont_core.js`) detects registered axes by reading their high-level CSS properties (`font-weight`, `font-stretch`, `font-style`) and mapping non-default values back to axis tags, since browsers don't expose them in `font-variation-settings`.

### SPA Hook Infrastructure (content.js)

SPA navigation hooks (`history.pushState`/`replaceState` wrappers, `popstate` listener) are installed once globally via `installSpaHooks()` with an idempotent guard (`spaHooksInstalled` flag). All code paths register handlers via `registerSpaHandler(fn)` which deduplicates by reference. Focus/visibility listeners use the same pattern via `registerFocusHandler(fn)`. This prevents unbounded listener stacking when fonts are reapplied.

### Storage Change Listener (content.js)

The `affoApplyMap` storage change listener diffs `oldValue[origin]` vs `newValue[origin]` using `JSON.stringify` comparison. Only tears down and reapplies styles when the current origin's config actually changed, avoiding unnecessary work on tabs showing unrelated domains.

### Unified Element Walker (content.js)

`runElementWalkerAll(fontTypes)` classifies all requested TMI types (serif/sans/mono) in a single DOM pass. Returns a `Promise<markedCounts>` that resolves when the chunked walk finishes (or `Promise.resolve({})` when all types are already completed). Uses chunked processing (`WALKER_CHUNK_SIZE = 2000` elements per chunk) with `setTimeout(0)` yielding between chunks to keep the UI responsive on large pages. A single `getComputedStyle` call per element serves both the visibility check and font type detection (passed as parameter to `getElementFontType`). `knownSerifFonts`, `knownSansFonts`, and `preservedFonts` are `Set` objects for O(1) lookup. `scheduleElementWalkerRechecks(fontTypes)` skips timed rechecks (700ms/1600ms) on large pages (>5,000 elements), keeping only `document.fonts.ready`. In-flight coalescing via `elementWalkerInFlight` (fontType → Promise) prevents concurrent walkers for the same types — the same promise is stored under each in-flight type key and returned to subsequent callers. Internal fire-and-forget callers ignore the returned promise (no behavior change).

### x.com Special Handling

x.com requires unique treatment due to aggressive style clearing:
- **FontFace-only loading** — background script fetches WOFF2 with unicode-range filtering
- **Inline style application** — direct DOM element styles with `!important`
- **Hybrid CSS selectors** — `getHybridSelector(fontType)` returns broad, x.com-specific CSS selectors (targeting `data-testid`, `div[role]`, tweet patterns, etc.) instead of `[data-affo-font-type]` attribute selectors. This is necessary because x.com's aggressive SPA constantly recreates DOM nodes, causing walker-placed `data-affo-font-type` marks to disappear. The hybrid selectors match elements by semantic structure so inline-apply, MutationObserver, and polling can re-find and restyle elements without relying on marks persisting. Routed via `getAffoSelector()` which checks the `isXCom` flag. The element walker still runs on x.com (marks elements as usual) but the marks are supplementary — the hybrid selectors provide the primary targeting.
- **SPA resilience** — single shared MutationObserver + shared polling interval for all active font types (via `inlineConfigs` registry), History API hooks, computed style restoration. Per-type expiry tracked via `expiresAt` timestamps; shared observer disconnects when all types expire or are removed.
- Domain lists configurable via `affoFontFaceOnlyDomains` and `affoInlineApplyDomains` storage keys

### Element Exclusions and Guards

Both Body Contact and TMI walkers exclude elements that should not have their font replaced:
- **Shared exclusions**: headings (h1-h6), code/pre/kbd, nav, form elements, ARIA roles (navigation, button, tab, toolbar, menu, alert, status, log), syntax highlighting classes, small-caps, metadata/bylines, widget/ad patterns, WhatFont compatibility
- **Container exclusions (ancestor-aware)**: Elements inside `figcaption`, `button`, `.post-header`, `[role="dialog"]`, or `.comments-page` (Substack comments) are excluded via `element.closest()` in the TMI walker. Body Contact CSS uses `:not(button):not(button *)`, `:not([class*="byline"])`, `:not([class*="subtitle"])`, `:not([role="dialog"]):not([role="dialog"] *)`, `:not(.comments-page):not(.comments-page *)` selectors
- **Guard mechanism**: Elements (or their ancestors) with class `.no-affo` or attribute `data-affo-guard` are skipped entirely by both walkers and by all CSS selectors (Body, Body Contact, TMI). The `data-affo-guard` attribute is used on the quick pick overlay (`left-toolbar.js`) to fully isolate it from the extension's own font overrides. CSS selectors include `:not([data-affo-guard]):not([data-affo-guard] *)` to exclude guarded containers and their descendants
- **Preserved fonts** (`affoPreservedFonts`): Icon font families (Font Awesome, Material Icons, bootstrap-icons, etc.) are never replaced. Configurable via Options page; checked against computed `font-family` stack
- **Implementation difference**: Body Contact uses CSS `:not()` selectors; TMI uses JS runtime checks in the element walker. Kept separate intentionally due to fundamentally different mechanisms

### Aggressive Mode (`affoAggressiveDomains`)

By default, CSS declarations are applied WITHOUT `!important` (relying on `cssOrigin: 'user'` for priority). Domains listed in `affoAggressiveDomains` get `!important` on all font declarations for sites with very strong style rules. Configurable via Options page textarea (one domain per line, defaults to empty). On page reload, `affoAggressiveDomains` is loaded in the same `storage.local.get()` call as `affoApplyMap` to avoid a race condition where aggressive mode CSS would be generated without `!important`. CSS is injected immediately on reapply (before font file loads) to prevent flash of original fonts; the font file loads in parallel and the browser swaps it in via `font-display: swap`.

### Async Architecture

All async operations are Promise-based (2024 refactor complete). No setTimeout polling for sequencing. CSS injection, font loading, button state updates, and storage operations all use async/await.

**Font loading optimizations for page reload**:
1. **Early preloading from `left-toolbar.js`** (`document_start`): Reads `affoApplyMap` and `affoCss2UrlCache` from storage; injects preconnect hints + Google Fonts `<link>` tags as soon as `document.head` is available. This gives the browser maximum lead time to start fetching fonts before the page is even parsed.
2. **Eager storage reads in `content.js`** (module load): `ensureCustomFontsLoaded()` and `ensureCss2UrlCache()` are kicked off immediately when the script loads, not lazily when first needed. By the time `reapplyStoredFonts` runs, these promises are likely already resolved.
3. **Early font link injection in reapply path**: The Google Fonts `<link>` tag is injected immediately alongside the CSS `<style>` element, before entering the `loadFont()` async chain. Uses cached css2Url if available, otherwise falls back to simple URL.
4. **CSS injection before font loads**: CSS rules targeting `[data-affo-font-type="..."]` are injected immediately, before font files load. The browser shows fallback fonts until the font file loads, then swaps in via `font-display: swap`.

Result: Font loading starts at `document_start` (earliest possible), eliminating sequential async waits from the critical path.

### Debug Flag

`AFFO_DEBUG` constant at top of `popup.js`, `content.js`, `background.js`, `left-toolbar.js` controls logging. Toggled by `scripts/set-debug.js` (automatically set to false during build, true otherwise).

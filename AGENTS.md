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
- use ztemp/ as temporary area instead of /tmp/
- at ztemp/violentmonkey is a cloned copy of the violentmonkey extension

## Architecture

### Source Files (no build step — raw JS served directly)

| File | Role |
|---|---|
| `config-utils.js` | Pure logic functions (normalizeConfig, determineButtonState, axis helpers) — shared between popup.js and Node tests |
| `popup.js` | Primary UI logic: font selection, axis controls, mode switching, favorites, state management |
| `popup.html` / `popup.css` | Extension popup markup and styles |
| `content.js` | Injected into pages; handles font application, inline styles, MutationObserver, SPA resilience, element walker rechecks, preconnect hints |
| `css-generators.js` | Shared CSS generation functions (body, body-contact, TMI) with conditional `!important`, element walker script generation |
| `background.js` | Non-persistent background script; CORS-safe font fetching, WOFF2 caching (80MB cap), Google Drive sync |
| `left-toolbar.js` | Toolbar overlay injected at `document_start` |
| `left-toolbar-iframe.js` | Iframe-based toolbar implementation |
| `options.js` / `options.html` | Settings page for domain configs and cache management |
| `whatfont_core.js` | Font detection overlay — detects font name, size, weight, variable axes (registered axes via CSS properties, custom axes via `font-variation-settings`) |
| `custom-fonts.css` | @font-face rules for non-Google custom fonts (BBC Reith, Graphik Trial, etc.) |
| `data/gf-axis-registry.json` | Google Fonts metadata (~2.4MB, updated via `npm run gf:update`) |

### Three View Modes

- **Body Contact** — Single font applied to body text (excludes headings, code, nav, form controls, syntax highlighting, ARIA roles, metadata/bylines, widgets/ads). Per-origin persistence via `affoApplyMap`.
- **Face-off** — Split-screen font comparison inside the popup. No page interaction.
- **Third Man In** — Three panels (Serif, Sans, Mono) each targeting their font family type on the page. Content script marks elements with `data-affo-font-type`. Includes delayed rechecks (700ms/1600ms + `document.fonts.ready`) for dynamic/lazy-loaded content, and SPA navigation hooks (`pushState`/`replaceState`/`popstate`) to re-walk on route changes.

### Storage Keys (browser.storage.local)

Core keys: `affoApplyMap` (domain font configs), `affoUIState` (current UI state per mode), `affoCurrentMode`, `affoFavorites`, `affoFavoritesOrder`, `affoFontCache` (WOFF2 cache), `affoAggressiveDomains` (domains using `!important`), `affoPreservedFonts` (icon font families never replaced). See `docs/architecture/DATA_STRUCTURES.md` for full details.

### Google Drive Sync

- Google Drive sync covers `custom-fonts.css`, domain settings (`affoApplyMap`), favorites (`affoFavorites`, `affoFavoritesOrder`), aggressive domains, preserved fonts, and Substack roulette settings.
- OAuth via `browser.identity.launchWebAuthFlow()` with PKCE. Tokens stored in `affoGDriveTokens`.
- Files stored in a visible "A Font Face-off{suffix}" folder in the user's Google Drive. All synced items are single files in the root folder (no subfolders): `domains.json`, `favorites.json`, `custom-fonts.css`, `known-serif.json`, `known-sans.json`, `fontface-only-domains.json`, `inline-apply-domains.json`, `aggressive-domains.json`, `preserved-fonts.json`, `substack-roulette.json`.
- A `sync-manifest.json` tracks modification timestamps for all synced items.
- **Bidirectional merge**: compares local vs remote timestamps per item; newer version wins. Entire file is atomic (no per-entry merge within a file).
- Domain settings (`affoApplyMap`) are stored as a single `domains.json` file. Any change to any domain marks the whole file as modified.
- Domain settings auto-sync from `background.js` when `affoApplyMap` changes. Favorites auto-sync when `affoFavorites` or `affoFavoritesOrder` changes. All other synced settings auto-sync on storage change.
- Manual sync via "Sync Now" button in Advanced Options. "Clear Local Sync" button resets local sync metadata without disconnecting OAuth.
- `navigator.onLine` check before sync; auto-sync skips silently when offline.
- Auto-sync failures emit `affoSyncFailed` runtime messages consumed by Options page modal retry UX.
- Key functions: `runSync()` (core bidirectional merge), `gdriveFetch()` (auth + retry wrapper), `ensureAppFolder()`, `scheduleAutoSync()`, `markLocalItemModified()`.

### Font Config "No Key" Architecture

Only store properties with actual values — no nulls, no defaults. `fontName` is always present when configured; `variableAxes` is always an object (even if empty `{}`). Primitive properties like `fontSize`, `fontColor` only appear when explicitly set.

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

Registered axes (`wght`, `wdth`, `slnt`, `ital`, `opsz`) map to CSS properties. Custom axes use `font-variation-settings`. Only "activated" axes get applied. Metadata comes from `data/gf-axis-registry.json`. WhatFont (`whatfont_core.js`) detects registered axes by reading their high-level CSS properties (`font-weight`, `font-stretch`, `font-style`) and mapping non-default values back to axis tags, since browsers don't expose them in `font-variation-settings`.

### x.com Special Handling

x.com requires unique treatment due to aggressive style clearing:
- **FontFace-only loading** — background script fetches WOFF2 with unicode-range filtering
- **Inline style application** — direct DOM element styles with `!important`
- **SPA resilience** — polling timers, MutationObserver, History API hooks, computed style restoration
- Domain lists configurable via `affoFontFaceOnlyDomains` and `affoInlineApplyDomains` storage keys

### Element Exclusions and Guards

Both Body Contact and TMI walkers exclude elements that should not have their font replaced:
- **Shared exclusions**: headings (h1-h6), code/pre/kbd, nav, form elements, ARIA roles (navigation, button, tab, toolbar, menu, alert, status, log), syntax highlighting classes, small-caps, metadata/bylines, widget/ad patterns, WhatFont compatibility
- **Guard mechanism**: Elements (or their ancestors) with class `.no-affo` or attribute `data-affo-guard` are skipped entirely by both walkers
- **Preserved fonts** (`affoPreservedFonts`): Icon font families (Font Awesome, Material Icons, bootstrap-icons, etc.) are never replaced. Configurable via Options page; checked against computed `font-family` stack
- **Implementation difference**: Body Contact uses CSS `:not()` selectors; TMI uses JS runtime checks in the element walker. Kept separate intentionally due to fundamentally different mechanisms

### Aggressive Mode (`affoAggressiveDomains`)

By default, CSS declarations are applied WITHOUT `!important` (relying on `cssOrigin: 'user'` for priority). Domains listed in `affoAggressiveDomains` get `!important` on all font declarations for sites with very strong style rules. Configurable via Options page textarea (one domain per line, defaults to empty).

### Async Architecture

All async operations are Promise-based (2024 refactor complete). No setTimeout polling for sequencing. CSS injection, font loading, button state updates, and storage operations all use async/await.

### Debug Flag

`AFFO_DEBUG` constant at top of `popup.js`, `content.js`, `background.js`, `left-toolbar.js` controls logging. Toggled by `scripts/set-debug.js` (automatically set to false during build, true otherwise).

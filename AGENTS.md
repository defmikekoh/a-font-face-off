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

## Architecture

### Source Files (no build step — raw JS served directly)

| File | Role |
|---|---|
| `config-utils.js` | Pure logic functions (normalizeConfig, determineButtonState, axis helpers) — shared between popup.js and Node tests |
| `popup.js` | Primary UI logic: font selection, axis controls, mode switching, favorites, state management |
| `popup.html` / `popup.css` | Extension popup markup and styles |
| `content.js` | Injected into pages; handles font application, inline styles, MutationObserver, SPA resilience |
| `background.js` | Non-persistent background script; CORS-safe font fetching, WOFF2 caching (80MB cap), Google Drive sync |
| `left-toolbar.js` | Toolbar overlay injected at `document_start` |
| `left-toolbar-iframe.js` | Iframe-based toolbar implementation |
| `options.js` / `options.html` | Settings page for domain configs and cache management |
| `whatfont_core.js` | Font detection utilities |
| `custom-fonts.css` | @font-face rules for non-Google custom fonts (BBC Reith, Graphik Trial, etc.) |
| `data/gf-axis-registry.json` | Google Fonts metadata (~2.4MB, updated via `npm run gf:update`) |

### Three View Modes

- **Body Contact** — Single font applied to body text (excludes headings, code, nav, form controls). Per-origin persistence via `affoApplyMap`.
- **Face-off** — Split-screen font comparison inside the popup. No page interaction.
- **Third Man In** — Three panels (Serif, Sans, Mono) each targeting their font family type on the page. Content script marks elements with `data-affo-font-type`.

### Storage Keys (browser.storage.local)

Core keys: `affoApplyMap` (domain font configs), `affoUIState` (current UI state per mode), `affoCurrentMode`, `affoFavorites`, `affoFavoritesOrder`, `affoFontCache` (WOFF2 cache). See `docs/architecture/DATA_STRUCTURES.md` for full details.

### Google Drive Sync

- Google Drive sync covers `custom-fonts.css`, domain settings (`affoApplyMap`), and favorites (`affoFavorites`, `affoFavoritesOrder`).
- OAuth via `browser.identity.launchWebAuthFlow()` with PKCE. Tokens stored in `affoGDriveTokens`.
- Files stored in a visible "A Font Face-off{suffix}" folder in the user's Google Drive, with per-domain JSON files in a `domains/` subfolder.
- A `sync-manifest.json` tracks modification timestamps for all synced items.
- **Bidirectional merge**: compares local vs remote timestamps per item; newer version wins.
- Domain settings auto-sync from `background.js` when `affoApplyMap` changes. Favorites auto-sync when `affoFavorites` or `affoFavoritesOrder` changes.
- Manual sync via single "Sync Now" button in Advanced Options.
- `navigator.onLine` check before sync; auto-sync skips silently when offline.
- Auto-sync failures emit `affoSyncFailed` runtime messages consumed by Options page modal retry UX.
- Key functions: `runSync()` (core bidirectional merge), `gdriveFetch()` (auth + retry wrapper), `ensureAppFolder()`, `scheduleAutoSync()`, `markLocalItemModified()`.

### Font Config "No Key" Architecture

Only store properties with actual values — no nulls, no defaults. `fontName` is always present when configured; `variableAxes` is always an object (even if empty `{}`). Primitive properties like `fontSize`, `fontColor` only appear when explicitly set.

### Key Config Functions (popup.js)

- `getCurrentUIConfig(position)` — reads current UI state into canonical config (respects active/unset controls)
- `normalizeConfig(raw)` — converts any external data (favorites, domain storage, legacy formats) into canonical config
- `buildPayload(position, config?)` — builds enriched payload (adds `css2Url`, `styleId`, `fontFaceRule`) for domain storage / content.js
- `getFontMemory(position)` — returns runtime font memory object for a panel position
- `MODE_CONFIG` — data-driven mode metadata (positions, stateKeys, useDomain) used by save/switch/applied-check functions
- `determineButtonState(changeCount, allDefaults, domainHasApplied)` — shared apply/reset/hide decision logic
- `getPositionCallbacks(position)` — returns mode-appropriate preview/button/save callbacks for a panel position
- `setupSliderControl(position, controlId, options?)` — generic factory for slider + text input handlers

### Variable Font Axes

Registered axes (`wght`, `wdth`, `slnt`, `ital`, `opsz`) map to CSS properties. Custom axes use `font-variation-settings`. Only "activated" axes get applied. Metadata comes from `data/gf-axis-registry.json`.

### x.com Special Handling

x.com requires unique treatment due to aggressive style clearing:
- **FontFace-only loading** — background script fetches WOFF2 with unicode-range filtering
- **Inline style application** — direct DOM element styles with `!important`
- **SPA resilience** — polling timers, MutationObserver, History API hooks, computed style restoration
- Domain lists configurable via `affoFontFaceOnlyDomains` and `affoInlineApplyDomains` storage keys

### Async Architecture

All async operations are Promise-based (2024 refactor complete). No setTimeout polling for sequencing. CSS injection, font loading, button state updates, and storage operations all use async/await.

### Debug Flag

`AFFO_DEBUG` constant at top of `popup.js`, `content.js`, `background.js`, `left-toolbar.js` controls logging. Toggled by `scripts/set-debug.js` (automatically set to false during build, true otherwise).

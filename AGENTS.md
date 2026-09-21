# AGENTS.md

This file provides guidance to Codex, Claude Code (claude.ai/code), and Gemini when working with code in this repository.

## Project Overview

A Font Face-off is a shared Manifest V3 browser extension for Firefox and Chromium (Chrome, Vivaldi, and Edge) that replaces and compares fonts on web pages in real-time. No font files are bundled; remote fonts are fetched at runtime from Google Fonts or custom CDN hosts, and local desktop fonts are also supported. Font application uses per-type styles, element-walker attributes, inline styles on configured domains, and tracked `browser.scripting.insertCSS` calls for Sroulette TMI targets. See `docs/architecture/CONTENT_SCRIPT.md` for the application paths.

## Key Commands

- `npm run build` — Build extension with web-ext (toggles AFFO_DEBUG to false, builds, restores true after a successful build)
- `npm run build:latest` — Build Firefox extension as `web-ext-artifacts/latest.xpi`
- `npm run gf:update` — Update Google Fonts metadata into `src/data/gf-axis-registry.json`
- `npm run lint` — Run ESLint across all source files
- `npm test` — Run unit tests (Node's built-in test runner, `node:test`)
- `npm run test:integration` — Build Firefox extension and run integration tests serially with Selenium/geckodriver
- `npm run test:chrome` — Build Chromium extension and run desktop Chromium tests

## Development Guidelines

- `docs/architecture/DATA_STRUCTURES.md` should be a point of reference and updated accordingly when data structures change.
- Don't run `web-ext run` — it opens an interactive browser you can't control. Tell the user to run it for manual testing. For programmatic inspection, use `npm run build:latest` + Selenium/geckodriver (see `.agents/skills/desktop-testing/`) or ADB for Android devices (see the `firefox-extension-debug` and `android-use` skills).
- The canonical desktop/Android extension-testing skill directory is `.agents/skills/desktop-testing/`; `.claude/skills/desktop-testing` is a symlink to it for Claude Code discovery. Edit the canonical `.agents` files rather than duplicating or relocating them without a deliberate compatibility change.
- **Safety boundary:** Android Selenium/geckodriver clears the selected Firefox package data when creating a session. Disposable browser testing is pre-approved on Samsung Galaxy Note10 `RF8M81WSL1V` for Firefox Nightly (`org.mozilla.fenix`), Vivaldi Snapshot (`com.vivaldi.browser.snapshot`), and Edge Canary (`com.microsoft.emmx.canary`). Snapshot and Canary permission includes app/profile resets, force-stop/relaunch, local extension install/reload/removal, and the developer settings needed for extension testing. Vivaldi stable (`com.vivaldi.browser`), Edge stable, other browser packages, devices, and Android users/work profiles require new explicit approval for destructive testing. The Firefox harness remains Firefox-only. (Tooling behavior, device specifics, and which paths are/aren't destructive are documented in the `desktop-testing` and `firefox-extension-debug` skills.)
- Generally, don't create fallbacks to fix errors unless specifically told to.
- ESLint config (`eslint.config.mjs`) uses flat config format — `files` patterns are relative to the config file. Use `src/` for extension source (e.g., `"src/*.js"`), `scripts/` for scripts, and `tests/` for tests; incorrect paths can silently leave rules unapplied.

## Source Files (in `src/` — no build step, no ES modules, raw JS served directly)

| File | Role |
|---|---|
| `src/config-utils.js` | Pure logic functions shared between popup.js and Node tests |
| `src/local-font-utils.js` | Shared helpers for user-managed local desktop font names and local font source metadata |
| `src/sroulette-utils.js` | Shared Substack Roulette helpers for pools, targets, intent storage, and pseudo-favorite metadata |
| `src/popup-panel-utils.js` | Popup panel state, Sroulette comparison, and Apply All planning helpers |
| `src/popup.js` | Primary UI logic: font selection, axis controls, mode switching, favorites, state management |
| `src/favorites.js` | Favorites UI and storage, with private state and explicit popup callbacks |
| `src/font-picker.js` | Font picker UI, with private state and explicit popup callbacks |
| `src/popup.html` / `src/popup.css` | Extension popup markup and styles. Shell is a 3-rectangle flex column (tabs / `#preview-region` / `#panel-grips`); see `docs/architecture/POPUP.md` → Shell Layout |
| `src/popup-context.js` | Loaded first in `popup.html` `<head>` (external because the extension CSP blocks inline scripts); tags `<html>` with `affo-mobile` on Android so popup.css sizes the desktop panel vs the full-viewport Android popup/tab |
| `src/content.js` | Injected into pages; font application, element walker, SPA resilience |
| `src/content-sroulette-runtime.js` | Content-script Sroulette materialization and tracked CSS messaging helpers |
| `src/css-generators.js` | Shared CSS generation functions (body, body-contact, TMI) |
| `src/background.js` | Non-persistent background script; cloud sync, runtime message routing, Quick Pick handlers |
| `src/background-font-runtime.js` | Background font fetch/cache service and Google Fonts CSS2 URL resolution |
| `src/block-javascript-utils.js` | Firefox response-header and Chromium dynamic-rule helpers for per-domain page JavaScript blocking |
| `src/left-toolbar.js` | Toolbar overlay injected at `document_start`; early font preloading, Quick Pick panel |
| `src/left-toolbar-iframe.js` | Iframe-based toolbar implementation |
| `src/options.js` / `src/options.html` | Settings page for domain configs and cache management |
| `src/whatfont_core.js` | Font detection overlay (injected at `document_idle` with `jquery.js`) |
| `src/page-font-face-capture.js` | Page-realm document-start observer for string-backed `FontFace` constructor calls used by WhatFont → Face-off |
| `src/custom-fonts.css` | @font-face rules for non-Google custom fonts |
| `src/data/gf-axis-registry.json` | Google Fonts metadata (~2.4MB, updated via `npm run gf:update`) |

## Three View Modes

- **Body Contact** — Single font applied to body text (excludes headings, code, nav, etc.). Per-origin persistence via `affoApplyMap`.
- **Face-off** — Split-screen font comparison inside the popup. No page interaction.
- **Third Man In (TMI)** — Three panels (Serif, Sans, Mono) each targeting their font family type on the page via element walker.

## Storage Keys (browser.storage.local)

Core keys: `affoApplyMap` (domain font configs), `affoUIState` (current UI state per mode), `affoCurrentMode`, `affoFavorites`, `affoFavoritesOrder`, `affoFontCacheLastMaintenance` (IndexedDB cache-maintenance timestamp), `affoAggressiveDomains` (domains using `!important`), `affoPreservedFonts` (icon font families never replaced). WOFF2 binaries live in IndexedDB, not `storage.local`. See `docs/architecture/DATA_STRUCTURES.md` for full details.

## Font Config "No Key" Architecture

Only store properties with actual values — no nulls, no defaults. `fontName` is always present in a configured font. Normalized configs always contain a `variableAxes` object (even if empty `{}`), but `buildPayload()` omits empty axes from domain storage. Primitive properties like `fontSize`, `fontColor` only appear when explicitly set. `letterSpacing` (em units, range -0.05 to 0.15) uses `!= null` checks everywhere since `0` is a valid value (falsy in JS).

`fontSize` (absolute px) and `fontSizeScale` (percentage of each matched element's original computed size) are mutually exclusive. Local fonts use `fontSource: 'local'`.

Sroulette domain entries store pool/target intent in `affoApplyMap[origin].sroulette`. Resolve the sampled font at runtime; do not persist the random result. See `docs/architecture/DATA_STRUCTURES.md` for the schema.

## Config Pipeline

- `getCurrentUIConfig(position)` (`popup.js`) — reads current UI state into canonical config
- `normalizeConfig(raw)` (`config-utils.js`) — converts external data (favorites, domain storage, legacy formats) into canonical config
- `buildPayload(position, config?)` (`popup.js`) — builds payload for domain storage; does NOT include `fontFaceRule` or `css2Url`
- `resolveCss2Url(fontName, options?)` (`popup.js`) — asks the background runtime to derive Google Fonts CSS2 URLs; only short-lived in-memory memoization is used

## Debug Flag

`AFFO_DEBUG` flag at top of `popup.js`, `content.js`, `background.js`, `left-toolbar.js` controls logging. `npm run build` uses `scripts/set-debug.js` to set it to false before packaging and restore true after a successful build. If a build fails after disabling debug, restore it with `node scripts/set-debug.js true` before continuing local development.

Logging rules:

- Local/dev runs should keep `AFFO_DEBUG = true`; packaged builds must have `AFFO_DEBUG = false` via `npm run build` / `scripts/set-debug.js`.
- Do not patch or override `console.log` / `console.warn`. Use local debug helpers (`affoDebugLog`, `affoDebugWarn`, or `debugLog` / `debugWarn` in `content.js`) for diagnostic output.
- Helper files loaded before `popup.js` and Node-tested files should gate debug output with `globalThis.AFFO_DEBUG === true` so tests and non-debug contexts stay quiet.
- `console.error` is acceptable for real failures. Routine status, cache hits, generated CSS dumps, verification traces, and expected fallback notes should be debug-gated.
- Code injected into page context cannot call popup/background helper functions; either skip those scripts when `AFFO_DEBUG` is false or embed a literal `if (${AFFO_DEBUG}) console.log(...)` guard.

## Shared MV3 Builds

`src/manifest.json` is the Firefox MV3 baseline. `npm run build:latest` packages Firefox; `npm run build:chromium` generates the Chrome/Vivaldi/Edge directory at `ztemp/chromium-mv3-src/`. The older `build:chromium-mv3` command remains an alias for existing CRX workflows. Shared scripts use `browser.scripting` and `browser.action`; `browser-api.js` supplies Chromium Promise/messaging adaptation and leaves native Firefox APIs untouched. Preserve the per-domain aggressive setting and AUTHOR/USER CSS origins. See `docs/architecture/MV3.md`.

## Architecture Deep Dives

For detailed documentation on specific subsystems, see `docs/architecture/`:

| Doc | Covers |
|---|---|
| `DATA_STRUCTURES.md` | Storage schemas, config shapes, UI state format |
| `POPUP.md` | MODE_CONFIG, PANEL_ROUTE, key functions, slider factories, panel toggle |
| `CSS_GENERATORS.md` | Shared CSS helpers, registered vs custom axes, italic/bold-italic override strategy |
| `CONTENT_SCRIPT.md` | Element walker, SPA hooks, inline-apply infrastructure, exclusions/guards, aggressive mode |
| `SYNC.md` | Google Drive + WebDAV sync (OAuth, bidirectional merge, auto-sync, file list) |
| `FONT_LOADING.md` | Async architecture, 4-stage preload pipeline, css2Url caching |
| `VARIABLE_AXES.md` | Registered vs custom axes, dual CSS strategy, WhatFont detection |
| `XCOM.md` | x.com FontFace-only, inline styles, hybrid selectors, SPA resilience |

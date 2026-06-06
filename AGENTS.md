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
- The canonical desktop/Android extension-testing skill directory is `.agents/skills/desktop-testing/`; `.claude/skills/desktop-testing` is a symlink to it for Claude Code discovery. Edit the canonical `.agents` files rather than duplicating or relocating them without a deliberate compatibility change.
- **Safety boundary:** Android Selenium/geckodriver clears the selected Firefox package data when creating a session. Destructive automation is pre-approved ONLY for Firefox Nightly (`org.mozilla.fenix`) on the Samsung Galaxy Note10 (ADB serial `RF8M81WSL1V`). Do not target other Firefox packages on that Note10, or Firefox on any other Android device, without new explicit approval. (Tooling behavior, device specifics, and which paths are/aren't destructive are documented in the `desktop-testing` and `firefox-extension-debug` skills.)
- Generally, don't create fallbacks to fix errors unless specifically told to.
- ESLint config (`eslint.config.mjs`) uses flat config format — all `files` patterns must use `src/` prefix (e.g., `"src/*.js"`). Without it, rules silently don't apply.

## Source Files (in `src/` — no build step, no ES modules, raw JS served directly)

| File | Role |
|---|---|
| `src/config-utils.js` | Pure logic functions shared between popup.js and Node tests |
| `src/sroulette-utils.js` | Shared Substack Roulette helpers for pools, targets, intent storage, and pseudo-favorite metadata |
| `src/popup-panel-utils.js` | Popup panel state, Sroulette comparison, and Apply All planning helpers |
| `src/popup.js` | Primary UI logic: font selection, axis controls, mode switching, favorites, state management |
| `src/popup.html` / `src/popup.css` | Extension popup markup and styles. Shell is a 3-rectangle flex column (tabs / `#preview-region` / `#panel-grips`); see `docs/architecture/POPUP.md` → Shell Layout |
| `src/popup-context.js` | Loaded first in `popup.html` `<head>` (external because the extension CSP blocks inline scripts); tags `<html>` with `affo-mobile` on Android so popup.css sizes the desktop panel vs the full-viewport Android popup/tab |
| `src/content.js` | Injected into pages; font application, element walker, SPA resilience |
| `src/content-sroulette-runtime.js` | Content-script Sroulette materialization and tracked CSS messaging helpers |
| `src/css-generators.js` | Shared CSS generation functions (body, body-contact, TMI) |
| `src/background.js` | Non-persistent background script; cloud sync, runtime message routing, Quick Pick handlers |
| `src/background-font-runtime.js` | Background font fetch/cache service and Google Fonts CSS2 URL resolution |
| `src/left-toolbar.js` | Toolbar overlay injected at `document_start`; early font preloading, Quick Pick panel |
| `src/left-toolbar-iframe.js` | Iframe-based toolbar implementation |
| `src/options.js` / `src/options.html` | Settings page for domain configs and cache management |
| `src/whatfont_core.js` | Font detection overlay (injected at `document_idle` with `jquery.js`) |
| `src/custom-fonts.css` | @font-face rules for non-Google custom fonts |
| `src/data/gf-axis-registry.json` | Google Fonts metadata (~2.4MB, updated via `npm run gf:update`) |

## Three View Modes

- **Body Contact** — Single font applied to body text (excludes headings, code, nav, etc.). Per-origin persistence via `affoApplyMap`.
- **Face-off** — Split-screen font comparison inside the popup. No page interaction.
- **Third Man In (TMI)** — Three panels (Serif, Sans, Mono) each targeting their font family type on the page via element walker.

## Storage Keys (browser.storage.local)

Core keys: `affoApplyMap` (domain font configs), `affoUIState` (current UI state per mode), `affoCurrentMode`, `affoFavorites`, `affoFavoritesOrder`, `affoFontCache` (WOFF2 cache), `affoAggressiveDomains` (domains using `!important`), `affoPreservedFonts` (icon font families never replaced). See `docs/architecture/DATA_STRUCTURES.md` for full details.

## Font Config "No Key" Architecture

Only store properties with actual values — no nulls, no defaults. `fontName` is always present when configured; `variableAxes` is always an object (even if empty `{}`). Primitive properties like `fontSize`, `fontColor` only appear when explicitly set. `letterSpacing` (em units, range -0.05 to 0.15) uses `!= null` checks everywhere since `0` is a valid value (falsy in JS).

## Config Pipeline (popup.js)

- `getCurrentUIConfig(position)` — reads current UI state into canonical config
- `normalizeConfig(raw)` — converts external data (favorites, domain storage, legacy formats) into canonical config
- `buildPayload(position, config?)` — builds payload for domain storage; does NOT include `fontFaceRule` or `css2Url`
- `storeCss2UrlInCache(fontName, css2Url)` — stores Google Fonts URL in global `affoCss2UrlCache`

## Debug Flag

`AFFO_DEBUG` constant at top of `popup.js`, `content.js`, `background.js`, `left-toolbar.js` controls logging. Toggled by `scripts/set-debug.js` (automatically set to false during build, true otherwise).

Logging rules:

- Local/dev runs should keep `AFFO_DEBUG = true`; packaged builds must have `AFFO_DEBUG = false` via `npm run build` / `scripts/set-debug.js`.
- Do not patch or override `console.log` / `console.warn`. Use local debug helpers (`affoDebugLog`, `affoDebugWarn`, or `debugLog` / `debugWarn` in `content.js`) for diagnostic output.
- Helper files loaded before `popup.js` and Node-tested files should gate debug output with `globalThis.AFFO_DEBUG === true` so tests and non-debug contexts stay quiet.
- `console.error` is acceptable for real failures. Routine status, cache hits, generated CSS dumps, verification traces, and expected fallback notes should be debug-gated.
- Code injected into page context cannot call popup/background helper functions; either skip those scripts when `AFFO_DEBUG` is false or embed a literal `if (${AFFO_DEBUG}) console.log(...)` guard.

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

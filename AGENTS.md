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
- ESLint config (`eslint.config.mjs`) uses flat config format — all `files` patterns must use `src/` prefix (e.g., `"src/*.js"`). Without it, rules silently don't apply.
- `zothercode/fontonic-firefox-android/` is another font changing extension that may occasionally be used as a point of reference.
- zothercode/fontonic-android-styler-v2.user.js is a user script that changed Substack fonts which this extension largely does also.
- use ztemp/ as temporary area instead of /tmp/
- at ztemp/violentmonkey is a cloned copy of the violentmonkey extension

## Source Files (in `src/` — no build step, no ES modules, raw JS served directly)

| File | Role |
|---|---|
| `src/config-utils.js` | Pure logic functions shared between popup.js and Node tests |
| `src/popup.js` | Primary UI logic: font selection, axis controls, mode switching, favorites, state management |
| `src/popup.html` / `src/popup.css` | Extension popup markup and styles |
| `src/content.js` | Injected into pages; font application, element walker, SPA resilience |
| `src/css-generators.js` | Shared CSS generation functions (body, body-contact, TMI) |
| `src/background.js` | Non-persistent background script; CORS-safe font fetching, WOFF2 caching, cloud sync, Quick Pick handlers |
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

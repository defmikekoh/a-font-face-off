# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Font Face-off is a Firefox browser extension (Manifest V2) that replaces and compares fonts on web pages in real-time. No font files are bundled; all fonts are fetched at runtime from Google Fonts or custom CDN hosts. The extension uses a single injected `<style>` element (Facade pattern) rather than per-node DOM mutations.

## Key Commands

- `npm run build` — Build extension with web-ext (toggles AFFO_DEBUG to false, builds, toggles back to true)
- `npm run build:latest` — Build and copy to `web-ext-artifacts/latest.xpi`
- `npm run gf:update` — Update Google Fonts metadata into `data/gf-axis-registry.json`

There are no tests or linting configured.

## Development Guidelines

- `docs/architecture/DATA_STRUCTURES.md` should be a point of reference and updated accordingly when data structures change.
- Since you can't inspect and control the results of `web-ext run`, don't run it yourself — tell the user to run it instead.
- Generally, don't create fallbacks to fix errors unless specifically told to.
- `zothercode/fontonic-firefox-android/` is another font changing extension that may occasionally be used as a point of reference.

## Architecture

### Source Files (no build step — raw JS served directly)

| File | Role |
|---|---|
| `popup.js` | Primary UI logic: font selection, axis controls, mode switching, favorites, state management |
| `popup.html` / `popup.css` | Extension popup markup and styles |
| `content.js` | Injected into pages; handles font application, inline styles, MutationObserver, SPA resilience |
| `background.js` | Non-persistent background script; CORS-safe font fetching, WOFF2 caching (80MB cap), WebDAV support |
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

### Font Config "No Key" Architecture

Only store properties with actual values — no nulls, no defaults. `fontName` is always present when configured; `variableAxes` is always an object (even if empty `{}`). Primitive properties like `fontSize`, `fontColor` only appear when explicitly set.

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

# A Font (Facade) Face‑off — Font Application Notes

This document explains how the extension applies your chosen fonts to web pages, why it’s fast (even on late‑hydration sites and e‑ink devices), and where the logic lives in the codebase.

## Overview

- Popup builds a payload: Selected `fontName`, generic fallback, size/line‑height/weight/color, and only the variable axes you’ve actually activated (wdth/slnt/ital or arbitrary tags).
- Payload is saved per‑origin: Stored to `browser.storage.local` in an `affoApplyMap` keyed by the site origin.
- Content script applies styles: Listens for storage changes and injects/updates a single `<style>` element targeting body text while excluding headings, code, UI, and form controls.
- Fonts load in parallel: Ensures a Google Fonts css2 `<link>` is present to begin fetching quickly; also parses css2 to extract a matching WOFF2 and preloads it via `FontFace` for fast activation. Falls back to `<link>` only if needed.
- Background fetch is CORS‑safe: Background script performs the cross‑origin fetches for css2 and WOFF2, returning the data to the content script.

## Flow

1) Choose font + controls in the popup → build apply payload
2) Save per‑origin payload to storage (`affoApplyMap`)
3) Content script injects or updates a single `<style>` node with `!important` rules that affect typical body text only
4) Font activation: css2 `<link>` + direct WOFF2 via `FontFace` ensure the selected family is available quickly

## Why It’s Fast

- One style node: We update a single `<style>` rather than touching many DOM nodes.
- Minimal scope: The selector targets body content and excludes headings, code, UI, and form controls → fewer elements restyle.
- Native primitives: Uses `FontFace`/`document.fonts` and standard CSS (`font-family`, `font-weight`, `font-style`, `font-stretch`, `font-variation-settings`), so the browser optimizes restyle/paint.
- Early/parallel fetching: A css2 `<link>` starts the network fetch; parsing css2 to preload a WOFF2 activates the font faster and warms cache.
- Hydration‑friendly: Content script runs at `document_end` and applies global CSS overrides; it cooperates with late client‑side hydration.

## Implementation Details (Code Pointers)

- Popup (UI, payload, css2 URL building, axis handling)
  - `popup.js` — builds payloads, derives css2 axis‑tag URLs, applies styles in the preview, and manages per‑origin Apply/Applied state.
- Storage (per‑origin apply map)
  - `popup.js` — writes `affoApplyMap` in `browser.storage.local` keyed by origin.
- Content script (page application)
  - `content.js` — listens to storage changes and injects/updates a single `<style>` that sets `font-family` and activated properties with `!important`.
  - Also fetches css2 via background, extracts a WOFF2, loads it with `new FontFace(...)`, and falls back to adding a css2 `<link>`.
- Background (CORS bypass for fetch)
  - `background.js` — handles `affoFetch` messages to fetch css2 or WOFF2 and returns text/binary data.
- Manifest
  - `manifest.json` — content script runs at `document_end`; CSP allows fonts and styles from Google Fonts/CDN.

## Applied CSS (Selector Strategy)

The injected stylesheet targets typical body text and intentionally avoids headings, code/monospace content, nav/UI regions, and form controls. This keeps the visual change focused and reduces layout churn.

See: `content.js` (selector + style text authoring and updates)

## Variable Axes Mapping

- Explicit axis values you activate are written to `font-variation-settings`.
- Registered axes get mapped to higher‑level CSS when helpful:
  - `wdth` → `font-stretch: <percent>%`
  - `ital`/`slnt` → `font-style: italic | oblique <deg>`
- Non‑active axes are cleared so no stale variations linger when switching families.

## Apply Button Readiness ✅ **Promise-based Flow Architecture**

The Apply button system now uses a Promise-based Flow architecture (2024 refactor) that eliminates race conditions:

**Previous System (polling-based):**
- Applied font configuration immediately
- Polled `document.fonts.check('16px "<Family>"')` to detect readiness
- Updated button state asynchronously
- Race conditions possible between font application and button updates

**Current System (Promise-based):**
- Font application operations are fully awaitable
- Button state updates only after font operations complete
- Sequential flow: `await applyFontConfig()` → `await updateButtons()`
- Atomic operations prevent race conditions by design

**Key Benefits:**
- ✅ Apply button state always reflects actual application status
- ✅ No timing issues between font loading and UI updates
- ✅ Predictable button behavior across all font types
- ✅ Eliminated the race condition that caused inconsistent reset button behavior

## Files

- `popup.js` — UI, payload construction, css2 URL building, preview apply, per‑origin Apply/Applied
- `content.js` — css2 fetch + WOFF2 load via `FontFace`, single `<style>` injection, storage change listener
- `background.js` — CORS‑safe fetch handler for CSS/WOFF2
- `manifest.json` — permissions, CSP, `document_end` injection timing

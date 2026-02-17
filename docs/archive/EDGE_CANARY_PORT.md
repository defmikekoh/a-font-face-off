# Edge Canary Android Port — What Would Have to Happen

> Assumes Firefox MV2 → MV3 migration is already complete.
> Research date: Feb 2026. Edge Android extension support is Canary-only for sideloading.

## Overview

Edge Android (Canary) supports Chrome-format MV3 extensions installed via developer options ("Extension install by ID" or "Extension install by crx"). A Firefox MV3 extension cannot run on Edge directly — a separate Chrome/Edge build is required.

## What the Firefox MV3 migration already solves

These items would be done before this port begins:

- `tabs.insertCSS`/`removeCSS` → `scripting.insertCSS`/`removeCSS` (new call signature)
- Persistent background → event page (non-persistent background with lifecycle management)
- `host_permissions` separated from `permissions` in manifest
- `executeScript` no longer uses `code` parameter (uses `files`/`func`)
- CSP tightened (no remote code execution)

## Remaining differences: Firefox MV3 → Edge/Chrome MV3

### 1. `origin: 'USER'` in `scripting.insertCSS` — DOES NOT EXIST IN CHROME

**The single biggest issue.** Firefox's `scripting.insertCSS({ origin: 'USER' })` injects CSS at user-agent priority, overriding page styles without `!important`. Chrome/Edge has no equivalent — the `origin` parameter is Firefox-only.

**Required workaround:** Add `!important` to all CSS declarations (run in "aggressive mode always"). This has known trade-offs:
- Can break icon fonts (Font Awesome, Material Icons) if selectors are too broad
- Can override form element/button styling
- Fights with sites that also use `!important` (CSS-in-JS, Tailwind)
- `font-size`/`line-height`/`font-weight` with `!important` on broad selectors causes collateral damage on non-body-text elements

**Mitigations already in place:**
- Extensive `:not()` exclusion selectors (headings, code, nav, forms, ARIA roles, syntax highlighting, etc.)
- Preserved fonts set (icon fonts checked by name against computed `font-family`)
- `.no-affo` / `data-affo-guard` opt-out mechanism
- TMI mode uses narrow `[data-affo-font-type="..."]` attribute selectors (less risky with `!important`)

**Potential additional mitigations:**
- Restrict `!important` to `font-family` only; apply size/weight/line-height/color without it
- Use CSS `@layer` for priority control without `!important` arms race
- Expand preserved font checks into CSS selectors (`:not([class*="icon"])`, `:not([class*="fa-"])`)

### 2. `browser.*` namespace → `chrome.*` namespace

Firefox uses `browser.*` with native Promises. Chrome/Edge uses `chrome.*` (MV3 added Promise support to most APIs but some edge cases remain callback-only).

**Solution:** Use [webextension-polyfill](https://github.com/nicedoc/webextension-polyfill). Write for `browser.*`, polyfill handles Chrome. Or use a build step to swap namespaces.

### 3. Event pages (Firefox) → service workers (Chrome/Edge)

Firefox MV3 uses non-persistent background scripts (event pages) with DOM access. Chrome/Edge MV3 requires service workers — no DOM, no `XMLHttpRequest`, no `localStorage`, no `window`.

**Changes needed in background.js:**
- Replace any DOM API usage (if any remains after MV3 migration)
- Replace `XMLHttpRequest` with `fetch` (likely already done)
- Handle service worker termination/restart lifecycle (30-second idle timeout in Chrome)
- Ensure GDrive sync and WOFF2 caching survive worker restarts
- `browser.alarms` already required by Firefox MV3, so that carries over

### 4. `browser.identity` OAuth flow differences

Firefox: `browser.identity.getRedirectURL()` returns `https://<random-uuid>.extensions.allizom.org/`.
Chrome/Edge: `chrome.identity.getRedirectURL()` returns `https://<extension-id>.chromiumapp.org/`.

**Changes needed:**
- Different redirect URI registered with Google OAuth
- Possibly different OAuth client ID for Chrome/Edge build
- `browser.identity.launchWebAuthFlow()` exists in Chrome but behavior differs slightly

### 5. Extension URL format

Firefox: `moz-extension://<random-UUID>/` (changes per install).
Chrome/Edge: `chrome-extension://<fixed-ID>/` (deterministic with `"key"` in manifest).

Affects any code that constructs extension URLs. The `web_accessible_resources` format also differs between Firefox and Chrome MV3.

### 6. Content script isolation model

Firefox: Xray vision (content scripts can't directly access page JS objects).
Chrome/Edge: Isolated worlds (similar restrictions, different mechanism).

The SPA hooks (`history.pushState`/`replaceState` wrapping) may behave differently. Needs testing on Edge Android.

### 7. Manifest format differences

A Chrome/Edge manifest.json would need:
- `"background": { "service_worker": "background.js" }` instead of `"background": { "scripts": ["background.js"] }`
- Different `web_accessible_resources` format (Chrome MV3 uses `resources`/`matches` objects)
- `"key"` property for deterministic extension ID (optional but useful)
- Remove any Firefox-specific manifest keys (`browser_specific_settings`, etc.)

### 8. Data URL handling in @font-face

Firefox extension popups won't render fonts from `data:` URLs (workaround: convert to blob URLs at runtime). Chrome/Edge may handle `data:` URLs natively in extension contexts — needs testing. The blob URL workaround should work on both.

### 9. AP fonts on FontFace-only domains

The `FontFace` API approach for x.com (decode base64 → ArrayBuffer → FontFace constructor) should work identically on Chrome/Edge since `FontFace` is a web standard.

## Build strategy

A build step would produce two outputs from the same source:

1. **Firefox build** (`.xpi`): Firefox manifest, `browser.*` namespace, event page background, `origin: 'USER'` in insertCSS
2. **Chrome/Edge build** (`.crx`): Chrome manifest, polyfill or `chrome.*` namespace, service worker background, `!important` on all declarations

Shared code (no changes needed):
- `css-generators.js` (already accepts `aggressive` parameter)
- `config-utils.js` (pure logic, no browser APIs)
- `popup.html` / `popup.css` (browser-agnostic)
- Element walker classification logic in `content.js`
- Font metadata and axis handling
- Google Fonts URL construction and caching

Platform-specific code:
- `background.js` (event page vs service worker, OAuth redirect URI)
- `popup.js` (insertCSS/removeCSS call sites, ~12 occurrences)
- `content.js` (namespace, SPA hook differences)
- `manifest.json` (two versions)

## Testing on Edge Canary Android

- Install Edge Canary from Play Store (coexists with stable Edge)
- Enable `edge://flags` → "Android extensions" / "Android extensions v3"
- Settings → About → tap version 5 times → Developer Options
- Install via "Extension install by crx" with built .crx file
- Debug via `edge://inspect` on desktop Edge/Chrome (USB + Chrome DevTools Protocol)

## Decision

As of Feb 2026, this port is **not worth pursuing**:
- Edge Android sideloading is Canary-only (daily builds, crash-prone)
- No path to stable Edge Android distribution without Microsoft curation
- The `cssOrigin` gap means permanently degraded font override quality
- Firefox Android is the proven, stable target with full MV2 support and no deprecation timeline

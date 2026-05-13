# Edge Canary Android Port — What Would Have to Happen

> Assumes Firefox MV2 → MV3 migration is already complete.
> Research date: Feb 2026. Updated May 2026 for the visible CRX sideload option.
> Edge Android extension support is Canary-only for arbitrary sideloading.

## Overview

Edge Android (Canary) supports Chrome-format MV3 extensions installed via developer options ("Extension install by ID" or "Extension install by crx"). A Firefox MV3 extension cannot run on Edge directly — a separate Chrome/Edge build is required.

**May 2026 note:** the visible "Extension install by crx" item is useful for local testing because it can install a self-packed Chrome/Edge `.crx` directly, instead of requiring an extension ID from Microsoft Edge Add-ons. Stable Edge Android now has a curated extension store, but arbitrary/local extension testing still belongs to Canary developer options. The CRX option does **not** make the current Firefox `.xpi` or MV2 manifest installable on Edge Android; all Chrome/Edge MV3 compatibility work below still applies.

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

The Firefox extension popup path converts embedded AP/APVar font URLs from `data:` to `blob:` before injecting `@font-face` rules. This is an extension-popup compatibility workaround based on unreliable raw `data:` font rendering in that context, not a general claim that Firefox cannot load `data:` fonts. Chrome/Edge may handle raw `data:` URLs natively in extension contexts — needs testing. The blob URL workaround should work on both.

### 9. AP fonts on FontFace-only domains

The `FontFace` API approach for x.com (decode base64 → ArrayBuffer → FontFace constructor) should work identically on Chrome/Edge since `FontFace` is a web standard.

## Build strategy

A build step would produce two outputs from the same source:

1. **Firefox build** (`.xpi`): Firefox manifest, `browser.*` namespace, event page background, `origin: 'USER'` in insertCSS
2. **Chrome/Edge build** (`.crx`): Chrome manifest, polyfill or `chrome.*` namespace, service worker background, `!important` on all declarations

### Side-by-side prototype build

The repo now has a generated Edge MV3 prototype path that leaves the Firefox MV2 source untouched:

```sh
npm run build:edge-crx
```

Outputs:
- Generated MV3 source: `ztemp/edge-mv3-src/`
- Reusable local CRX signing key: `ztemp/edge-mv3-key.pem`
- Source ZIP used for packing: `ztemp/edge-mv3.zip`
- Installable CRX: `web-ext-artifacts/a-font-face-off-edge-mv3.crx`

Packing note: `scripts/pack-edge-crx.js` uses a local Chromium/Chrome/Edge binary's native `--pack-extension` implementation. A hand-written CRX3 packer produced files that Edge Canary Android accepted from the file picker but then silently ignored. The native-packed control CRX produced the expected permission prompt and appeared in the Extensions list. Set `AFFO_EDGE_CRX_PACKER=/path/to/browser` or pass `--packer /path/to/browser` if the auto-detected browser is not the one to use.

### GitHub Actions latest CRX

`.github/workflows/edge-crx-prerelease.yml` mirrors the Firefox Android prerelease pattern with a separate moving tag:

- Tag/release: `edge-test-latest`
- Release asset: `web-ext-artifacts/a-font-face-off-edge-mv3.crx`
- Trigger: manual `workflow_dispatch`
- Version bump: generated MV3 manifest gets a fourth component from `GITHUB_RUN_NUMBER + 100`

Set the repository secret `EDGE_CRX_PRIVATE_KEY_PEM` to the local `ztemp/edge-mv3-key.pem` contents before running it. Keeping this key stable keeps the CRX extension ID stable across GitHub Actions builds. The workflow also uses the existing `GDRIVE_CLIENT_ID` and `GDRIVE_CLIENT_SECRET` secrets to include `src/gdrive-config.js` in the generated MV3 source.

The generated build:
- Converts `browser_action` to `action`
- Converts host match patterns from `permissions` into MV3 `host_permissions`
- Uses a service worker wrapper (`edge-mv3-service-worker.js`) that imports the current background scripts
- Injects `browser-polyfill-lite.js` before extension scripts so existing `browser.*` calls can run on Chrome/Edge
- Adapts old `tabs.insertCSS`/`removeCSS`/`executeScript` call sites to MV3 `chrome.scripting`
- Forces CSS generators into aggressive mode so generated CSS uses `!important`

Prototype caveat: the `tabs.executeScript({ code })` adapter uses an MV3 scripting wrapper to evaluate existing dynamic code strings in the target tab. That is good enough for local Canary testing, but it is not a store-ready architecture; a production MV3 port should replace those dynamic code strings with fixed content-script message handlers.

Google Drive sync prototype caveat: the current code still uses the desktop OAuth loopback flow. Firefox can cancel the loopback redirect with a blocking `webRequest` listener; Edge/Chrome MV3 may not allow that listener, so `background.js` also observes the redirect through non-blocking `webRequest`/`tabs.onUpdated` and closes the auth tab after capturing the code. Edge Canary Android does not currently surface the extension `options_ui` as a Settings item in the extension menu; the Quick Pick panel includes a `Connect Google Drive` action as a mobile-accessible sync entry point.

WebDAV sync path note: configure the WebDAV server URL to the DAV root that answers `PROPFIND` with `207 Multi-Status`, then use the WebDAV folder suffix field to create a separate Chrome/Edge namespace such as `A Font Face-off Chrome`. Do not assume a human-browsable WebDAVNav URL path is also a DAV collection path.

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
- Build a Chrome/Edge MV3 package and pack it as `.crx` (not the Firefox `.xpi`)
- Install via "Extension install by crx" for local testing, or "Extension install by ID" for an Edge Add-ons hosted extension
- A successful CRX install shows a permissions prompt and then appears under Edge menu → Extensions. Silent return to the previous web page means the CRX did not register.
- If Edge Canary hangs on an extension Details page, avoid the Details page. The extension menu may only show Details and Permissions; use the in-page AFFO toolbar → Quick Pick → `Connect Google Drive` for sync testing.
- Preserve the CRX signing key/PEM between builds if a stable extension ID is needed for testing OAuth redirect URIs or stored extension data
- Debug via `edge://inspect` on desktop Edge/Chrome (USB + Chrome DevTools Protocol)

## Decision

As of May 2026, this port is **not worth pursuing**:
- Arbitrary Edge Android sideloading is still Canary/developer-option territory
- Stable Edge Android has a curated extension store, but no general stable-channel CRX distribution path without Microsoft curation/listing
- The `cssOrigin` gap means permanently degraded font override quality
- Firefox Android is the proven, stable target with full MV2 support and no deprecation timeline

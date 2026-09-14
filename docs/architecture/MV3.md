# Shared Manifest V3 architecture

AFFO uses the same MV3 JavaScript and popup/content UI on Firefox and Chromium (Chrome, Vivaldi, and Edge). `src/manifest.json` is the Firefox baseline. The minimum versions are Firefox desktop 140 and Firefox Android 142; the Android minimum also covers the manifest's existing data-collection permission declaration.

## Builds

- `npm run build:latest`: production Firefox package at `web-ext-artifacts/latest.xpi`.
- `npm run build:chromium`: unpacked Chromium extension at `ztemp/edge-mv3-src/`. Load this directory in the browser's extension developer mode.
- `npm run build:edge-mv3`: same Chromium build, retained for existing tooling.
- `npm run build:edge-crx`: existing signed CRX packaging path. Existing output names and signing key paths are retained to keep local installs and CI compatible.

The Chromium builder copies the shared source, disables diagnostic logging in the copied files, removes Firefox-specific manifest settings, replaces `webRequestBlocking` with `declarativeNetRequestWithHostAccess`, and generates a service worker that imports the shared background scripts. It retains the Chromium options-page CSS class. It does not translate source APIs or alter generated font CSS. Firefox packaging uses the existing debug-toggle hooks.

### CRX packaging and prereleases

`npm run build:edge-crx` builds the shared Chromium source and packs `web-ext-artifacts/a-font-face-off-edge-mv3.crx`. The packer also produces `ztemp/edge-mv3.zip` and creates or reuses `ztemp/edge-mv3-key.pem`. Preserve that signing key to retain the CRX extension ID across builds.

[`scripts/pack-edge-crx.js`](../../scripts/pack-edge-crx.js) uses a local Chromium, Chrome, or Edge binary's native `--pack-extension` implementation. Earlier Edge Canary Android testing found that a hand-written CRX3 package was silently ignored, while native packing produced the expected permission prompt and installed extension. Override browser detection with `AFFO_EDGE_CRX_PACKER=/path/to/browser` or `npm run pack:edge-crx -- --packer /path/to/browser`.

The manually dispatched [`edge-crx-prerelease.yml`](../../.github/workflows/edge-crx-prerelease.yml) workflow publishes to the moving `edge-test-latest` prerelease. It appends `GITHUB_RUN_NUMBER + 100` as the generated manifest version's fourth component and uploads `a-font-face-off-edge-mv3-<version>.crx`. Configure `EDGE_CRX_PRIVATE_KEY_PEM` with the same signing key for stable IDs; `GDRIVE_CLIENT_ID` and `GDRIVE_CLIENT_SECRET` supply the generated Google Drive configuration.

For device installation and troubleshooting, see the [Edge Canary testing instructions](../../.agents/skills/desktop-testing/SKILL.md#edge-canary-android-mv3-prototype) or the [Vivaldi Snapshot workflow](../../.agents/skills/desktop-testing/references/vivaldi-snapshot.md). Snapshot supports loading the unpacked Chromium build directly.

## Browser differences

Firefox uses a non-persistent background event page. Chromium uses a service worker. Background code must therefore remain usable without a DOM. `browser-api.js`, loaded before extension code, leaves Firefox's native `browser` object untouched and supplies Chromium callback/Promise and async-message handling where needed. It also preserves the Android Chromium options-tab workaround.

Firefox's declared `webRequestBlocking` permission selects the response-header implementation of Block JavaScript. Chromium declares DNR and uses the existing dynamic CSP rule instead. Google Drive's redirect handling retains its existing Firefox blocking and Chromium observation paths.

## Script and CSS injection

All injection uses `browser.scripting` with explicit tab/frame targets. Scripts are packaged functions with JSON arguments or packaged files; there is no MV2 function-to-string execution adapter. `AFFOMessaging.executeScript` accepts native MV3 injection details, unwraps returned values, and propagates Firefox per-frame errors. WhatFont files finish with a cloneable result and activate in the requesting frame.

CSS uses `css`, `target`, and uppercase `origin`. User-origin insertion remains available on both engines. Body/TMI/Quick Pick preserve their previous origins, and tracked Sroulette CSS retains both AUTHOR and USER insertions/removals. The existing aggressive-domain setting controls `!important`; MV3 does not force aggressive mode. User-origin normal declarations and important declarations retain their normal CSS cascade semantics.

Sroulette stores exact injected CSS per tab/target in `storage.session`, so background suspension does not prevent removal. Favorites, domain configurations, sync data, and IndexedDB font binaries retain their existing schemas. The Firefox extension ID remains unchanged.

## Permissions and resources

HTTP/HTTPS hosts live in `host_permissions`; `scripting` is an API permission. Modern Firefox grants requested hosts on installation, but users can revoke access. Page features require access to the target site; remote font/sync requests also require access to their hosts.

CSP uses `content_security_policy.extension_pages`. Remote font/style sources remain allowed by their directives; remote JavaScript remains prohibited. Web-accessible resources use MV3 resource/match objects, including the page FontFace observer, toolbar iframe, and local font CSS fetched by content scripts. Remote font requests remain in the background runtime. Binary replies are base64-encoded at the message boundary so Chromium JSON serialization preserves font bytes; cache entries remain ArrayBuffers.

## Validation

Unit tests cover shared injection, frame targeting, Firefox script errors, CSS origins and removal after restart, manifest differences, and font application. Run `npm test`, `npm run lint`, and `npm run test:integration`; verify mobile behavior on the authorized Firefox Nightly device using the project testing skill. Verify the generated Chromium extension separately because Firefox does not exercise the service worker or Chromium API adapter.

### Desktop Chrome smoke

Run `npm run test:chrome`. Selenium Manager downloads Chrome for Testing
**153.0.8010.36** and its matching ChromeDriver into `ztemp/selenium/` on first
use. Subsequent runs reuse those binaries. Each run builds the Chromium
extension, loads it automatically into a fresh profile under `ztemp/`, and
quits Chrome and removes that profile afterward. It does not use your normal
Chrome profile. Browser execution needs permission to open local debugging
ports; first use also requires download access.

The runner uses the existing Selenium dependency for browser startup and tab
setup, then CDP for shared assertions in `scripts/chromium-smoke.js`. The Android
runner uses the same assertions with its existing installed browser and explicit
ADB forwarding; it still performs no installation or device reset.

The ten desktop checks cover MV3 installation/content injection, popup mode
switching, remote font application with aggressive mode off, Body Reset,
three-family TMI, the Chromium JavaScript-blocking rule, WhatFont injection,
USER-origin CSS insertion/removal, persisted configuration and tracked CSS
cleanup after worker restart, and new extension runtime/manifest errors.
Worker restart is established by a stopped lifecycle event and a fresh global
context, not a changed DevTools target ID (desktop Chrome can reuse it).

The default is headless. Use `AFFO_CHROME_HEADED=1 npm run test:chrome` to show
the browser, or `AFFO_CHROME_VERSION=stable npm run test:chrome` to test the
current Stable release before deliberately updating the pinned default.
An exact version can also be supplied. The JSON report at
`ztemp/desktop-chromium-test.json` records the actual browser version and failures.

These are integration smoke checks: they use example.com and Google Fonts,
so network failures can fail the run. Popup checks use an extension **tab**,
not the native toolbar panel. The DNR check verifies installed rule configuration,
not a site's script execution. Keep native-popup and Android Vivaldi checks for
browser chrome, touch, and mobile layout coverage.

References: [Mozilla MV3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/), [scripting.insertCSS](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/insertCSS), [scripting.executeScript](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/executeScript).

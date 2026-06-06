---
name: firefox-extension-testing
description: Test and inspect the A Font Face-off extension on Android Firefox Nightly, desktop Firefox, and the Edge Canary Android MV3 CRX prototype using Selenium, geckodriver, Firefox Developer Edition, Android WebDriver, ADB, and CRX build/install workflows. Unless the user specifies another platform, interpret reported AFFO problems and questions as Android Firefox Nightly behavior.
---

# A Font Face-off Extension Testing

Automated and semi-automated testing of the extension on desktop Firefox Developer Edition, Android Firefox, and the Edge Canary Android MV3 CRX prototype. Desktop tests interact with the real browser action popup (not a direct moz-extension:// URL). Android Firefox inspection uses the project WebDriver harness for real DOM and computed CSS. Edge Canary Android work uses generated MV3 source, native-packed CRX artifacts, and ADB/manual Canary extension UI.

This repo skill is canonical for AFFO-specific commands, selectors, storage seeds, popup/toolbar IDs, generated Edge MV3 artifacts, and known site examples. Use the global `firefox-extension-debug` skill for reusable Android Firefox safety boundaries, ADB patterns, CDP reconnaissance guidance, and GUI/DevTools route selection.

## Default Problem Target

Unless the user states otherwise, treat AFFO behavior questions and reported problems as occurring in Firefox Nightly on Android. Desktop Firefox Developer Edition is often a faster initial testing area for shared extension logic, deterministic regression tests, and site CSS investigation. When mobile layout, touch behavior, Firefox Android behavior, or final user-visible verification matters, confirm the result on Android Firefox Nightly rather than treating a desktop result as conclusive.

For automated Android Firefox verification, use the authorized Firefox Nightly target documented below unless the user explicitly authorizes a different target.

## Prerequisites

```bash
brew install geckodriver
npm install  # selenium-webdriver is a devDependency
```

Firefox Developer Edition must be installed at `/Applications/Firefox Developer Edition.app`.

Android Firefox inspection also requires ADB and an authorized Android device.

## AFFO Debugging Order

1. Use code search, unit tests, lint, and local scripts first for source-level behavior.
2. Use desktop Selenium/geckodriver as a fast initial testing area for repeatable popup and shared content-script behavior where useful.
3. Use the Android Firefox WebDriver harness for authoritative Firefox Nightly on Android DOM/computed CSS when AFFO injection, extension storage, seeded settings, or final behavior matters.
4. Use desktop Chrome through the Codex Chrome Extension when the user's real Chrome profile/session is the fastest way to inspect already-open or authenticated desktop pages: original DOM, selectors, overlays, console logs, screenshots, and baseline computed styles. Treat this as reconnaissance, and verify AFFO/Firefox-specific conclusions in Firefox.
5. Use Android Chrome/Edge DevTools/CDP for quick mobile site reconnaissance: original DOM, selectors, layout, network, and baseline computed styles before or alongside Firefox verification.
6. Use the Edge Canary Android MV3 prototype when Chromium-extension behavior matters; use CDP there for page and extension debugging where available, and verify Firefox-specific conclusions separately.
7. Use ADB for coarse device state: screenshots, taps, URL/page confirmation, UI dumps, and extension iframe presence.
8. Use Computer Use only for Mac GUI workflows such as Firefox Developer Edition prompts, `about:debugging`, DevTools panel navigation, or one-off visual workflow discovery.

## Running Tests

```bash
# Build XPI and run integration tests
npm run test:integration

# Or build and run separately
npm run build:latest
node --test tests/integration-popup.itest.js
```

## Architecture

### Key concepts

- **In-process extensions**: `extensions.webextensions.remote=false` runs extension code in the parent process so `contentWindow` is accessible for `Cu.Sandbox`
- **Chrome context**: `driver.setContext(firefox.Context.CHROME)` switches to browser chrome for toolbar/panel interaction; requires `-remote-allow-system-access` flag
- **Fresh temp profiles (desktop only)**: Each desktop test run creates a new profile via `fs.mkdtempSync`, avoiding conflicts with existing Firefox sessions. This isolation does not apply to Firefox Android/Fenix.
- **No UUID discovery needed**: We click the real toolbar button, no need to find `moz-extension://` URLs

### Toolbar button IDs

Firefox creates two elements per extension button:
- **Widget**: `a-font-face-off_example_com-browser-action` (toolbaritem wrapper, used with `CustomizableUI.addWidgetToArea`)
- **Button**: `a-font-face-off_example_com-BAP` (actual clickable toolbarbutton that opens the popup)

### Helper module (`tests/selenium-helper.js`)

```js
const { setup, teardown, openPopup, closePopup, popupExec } = require('./selenium-helper');

// setup()    → { driver, profileDir } — launches Firefox, installs XPI, navigates to test page
// teardown() → quits browser, removes temp profile
// openPopup()  → clicks toolbar button, waits for popup to load
// closePopup() → hides the popup panel
// popupExec(driver, script) → runs JS inside the popup via Cu.Sandbox
```

### popupExec

Runs JavaScript inside the popup's window context. Scripts have access to `document`, `window`, and all popup globals (e.g. `togglePanel`, `currentViewMode`).

```js
// Query DOM
const modes = await popupExec(driver, `
    return document.querySelectorAll('[data-mode]').length;
`);

// Click elements
await popupExec(driver, 'document.querySelector(\'[data-mode="faceoff"]\').click()');

// Access popup globals
await popupExec(driver, 'togglePanel("body")');
```

Scripts are wrapped in an IIFE internally (`(function(){ ... })()`) because `Cu.evalInSandbox` runs as script-level code where bare `return` isn't valid.

### Integration tests (`tests/integration-popup.itest.js`)

Uses `node:test` (same runner as unit tests). The `.itest.js` extension keeps them out of the fast `npm test` glob.

## UI Elements

### Modes
- Selector: `[data-mode="body-contact"]`, `[data-mode="faceoff"]`, `[data-mode="third-man-in"]`
- Active class: `.active`
- Body-contact auto-opens the body controls panel (no grip click needed)

### Font Displays
- `#body-font-display` (Body Contact)
- `#top-font-display`, `#bottom-font-display` (Face-off)
- `#serif-font-display`, `#sans-font-display`, `#mono-font-display` (Third Man In)

### Grips
- `#body-font-grip` (Body Contact)
- `#top-font-grip`, `#bottom-font-grip` (Face-off)
- `#serif-font-grip`, `#sans-font-grip`, `#mono-font-grip` (Third Man In)

### Controls Panels
- `#body-font-controls` is the only panel in HTML; top/bottom/serif/sans/mono are cloned from it at startup via `cloneControlPanel(position)`
- All panels share identical structure: font display, size/line-height/weight sliders with text inputs and value displays, color selector, axes container, footer with favorite buttons + apply/reset
- Visibility toggled via `.visible` CSS class (use `togglePanel(position)`)

### Font Picker
- Modal: `#font-picker-modal`
- Opened by clicking a font display element

## Content Script Testing

Run in content context (not `popupExec`):

```js
await driver.get('https://en.wikipedia.org/wiki/Typography');
await driver.sleep(3000);

const affoBase = await driver.executeScript(
    "return document.documentElement.getAttribute('data-affo-base')"
);
// Returns 'serif', 'sans', or 'mono'
```

### Reusable Desktop Page Inspector

Use the skill-adjacent inspector for live desktop page and toolbar investigations instead of creating a new `ztemp/inspect-*.js` launcher for each site:

```bash
npm run build:latest
node .agents/skills/desktop-testing/desktop-firefox-inspect.js \
  --url https://www.usatoday.com/story/... \
  --apply body=Lora \
  --expect-affo \
  --expect-toolbar \
  --dismiss '.gnt_mol_xb' \
  --snapshot-at 1000 \
  --snapshot-at 5000 \
  --selector article \
  --selector 'iframe[src*="overlay"]' \
  --out ztemp/desktop-firefox-inspect.json
```

The command opens Firefox Developer Edition with a fresh temporary profile and the built XPI. Supported inputs include `--url`, repeated `--apply <body|serif|sans|mono>=<font>`, arbitrary storage seeds through `--storage-json` or `--storage-file`, repeated `--selector`, `--frame-selector '<iframe selector>::<element selector>'`, and `--snapshot-at`, `--expect-affo`, `--expect-toolbar`, `--timeout` for pages held open by ad/interstitial activity, and optional `--screenshot`. Keep its report and screenshot output under `ztemp/`.

For pages with predictable interstitial markup, dismiss the overlay before snapshots rather than extending waits:

```bash
node .agents/skills/desktop-testing/desktop-firefox-inspect.js \
  --url https://example.com/article \
  --dismiss 'button[aria-label="Close"]' \
  --dismiss-frame 'iframe[src*="overlay"]::button[aria-label="Close"]' \
  --out ztemp/desktop-firefox-inspect.json
```

Use `--dismiss` for a close control in the page and `--dismiss-frame '<iframe selector>::<close selector>'` when it lives inside a modal iframe. Both are optional and reported as clicked or not found; `--dismiss-timeout` controls how long the inspector waits for each control. When a modal's close selector is unknown, use repeated `--frame-selector` arguments to report candidate controls inside its iframe before choosing a dismissal selector. The inspector uses eager page loading so it can perform these actions once the DOM is ready even when long-running ads keep normal navigation open.

### Android Firefox Inspection

#### Authorized Firefox Android Target

Android Selenium/geckodriver session creation clears the selected Firefox package data. Operations using that path, or any explicit app/profile clearing, are pre-approved only for this exact target:

```text
Device:  RF8M81WSL1V (Samsung Galaxy Note10)
Package: org.mozilla.fenix (Firefox Nightly)
```

The Firefox Nightly profile on that Note10 may be treated as disposable for AFFO debugging. Do not perform such operations against:

- Any other Firefox package on the Note10, including Firefox Release or Beta.
- `org.mozilla.fenix` or any Firefox package on another phone, tablet, emulator, or Android user/work profile.

Obtain new explicit user approval before using an unapproved device/package pair. Non-mutating ADB inspection such as checking connected devices, package versions, screenshots, and UI dumps is outside this reset-risk permission, but still target the intended serial explicitly.

`web-ext run -t firefox-android` is a distinct path. It uses the live Fenix profile and may install/remove a temporary extension, but in observed Note10 use it has not reset Nightly settings; `--adb-remove-old-artifacts` removes web-ext staging artifacts, not Firefox app data.

For real Android Firefox DOM and computed-style inspection on the approved target, use:

```bash
npm run build:latest
npm run inspect:android-firefox -- --serial RF8M81WSL1V --package org.mozilla.fenix --allow-clear-package-data --expect-affo --out ztemp/android-firefox-inspect.json
```

Important: Unlike the `web-ext run` workflow, the Selenium/geckodriver harness clears package data when creating an Android session. The script requires `--allow-clear-package-data` as an explicit acknowledgement; this approval applies only to Nightly on the Note10 identified above.

The script installs `web-ext-artifacts/latest.xpi` temporarily by default, opens the target URL, and writes JSON with AFFO markers plus computed CSS for selected selectors. Because Android geckodriver clears package data when the session starts, use `--skip-addon` only for no-addon/baseline page inspection or deliberately unusual sessions where add-on installation is handled another way.

For toolbar visibility or page-overlay investigations, explicitly select the toolbar iframe and any suspected blocking overlay. The report includes `display`, `visibility`, `opacity`, positioning, z-index, size, bounding rectangle, and inline style, so it can distinguish a hidden toolbar from a visible toolbar covered by unrelated page UI:

```bash
npm run inspect:android-firefox -- --serial RF8M81WSL1V --package org.mozilla.fenix --allow-clear-package-data \
  --url https://www.usatoday.com/story/... \
  --expect-affo --settle 5000 \
  --selector '#affo-left-toolbar-iframe' \
  --selector 'iframe[src*="overlay"]' \
  --selector '.gnt_mol_xb' \
  --out ztemp/android-firefox-toolbar-inspect.json
```

On USA Today, an acquisition/modal overlay may be present at the same time as a functioning AFFO toolbar. Its observed mobile close-control selector is `.gnt_mol_xb`; do not treat the overlay itself as proof that the toolbar failed to inject or display.

Speed/fidelity rule:
- Use the Android Firefox harness when the answer must reflect Firefox Android, AFFO extension injection, extension storage, seeded settings, or final computed CSS with AFFO active.
- Use desktop Chrome through the Codex Chrome Extension when an authenticated or already-open desktop Chrome page is the fastest way to inspect live page structure, overlays, console logs, screenshots, or baseline computed styles.
- Use Android Chrome/Edge DevTools/CDP for quick mobile site reconnaissance and Chromium-family comparison: original DOM, selectors, layout, network, and baseline computed styles.
- Use the Edge Canary Android MV3 prototype when the question is about the Chromium/Edge extension build, popup/options path, toolbar, Quick Pick, or sync behavior.
- If Chrome or Edge reveals a selector or page structure, verify in Firefox before treating it as Firefox extension behavior; sites and engines can diverge.

Storage-dependent features will not be configured unless the script seeds storage during the run. Do not rely on pre-existing Nightly profile state in the Android WebDriver path because session creation clears package data. For Substack Roulette checks, seed deterministic favorites before inspecting:

```bash
npm run inspect:android-firefox -- --serial RF8M81WSL1V --package org.mozilla.fenix --allow-clear-package-data --url https://scottsumner.substack.com/p/the-odd-disappearance-of-the-business --expect-affo --seed-substack-roulette --seed-serif Lora --seed-sans Inter --settle 15000 --selector html --selector body --selector p --out ztemp/substack-seeded.json
```

Use a seed font that differs from the site default when proving font application. On Substack, `Lora` is a better serif proof than `Spectral` because many Substack pages already use Spectral.

#### Inspecting the popup ITSELF on Note10 (panel vs page-font tab)

`inspect:android-firefox` inspects the *web page* (content script), not the popup UI. The popup renders on two surfaces and you often need to inspect the popup directly:

- **Desktop**: a browser-action PANEL (sizes-to-content; CSS gives it a fixed `400x600`).
- **Firefox Android**: a FULL-VIEWPORT surface. Opening the extension normally and the one-shot page-font Face-off (WhatFont card → Face-off, or long-press the top icon in the left toolbar) both open `popup.html` as a TAB via `openPopupFallback` → `browser.tabs.create('popup.html?domain=…&sourceTabId=…')`. `popup-context.js` keys mobile sizing off `/Android/i` in the UA → `html.affo-mobile`.

To drive/inspect that popup tab with geckodriver, pin the add-on UUID so you can reach the moz-extension URL, then either navigate to it or trigger the real flow:

```js
const UUID = '11111111-2222-3333-4444-555555555555';
options.setPreference('extensions.webextensions.uuids',
  JSON.stringify({ 'a-font-face-off@example.com': UUID }));
await driver.installAddon('web-ext-artifacts/latest.xpi', true);
// A) direct: await driver.get(`moz-extension://${UUID}/popup.html?domain=x.com&sourceTabId=1`)
// B) real long-press flow: on the page, window.postMessage({type:'openPopup'}, '*');
//    then switch to the new window handle.
```

**Note10 measurement gotchas (learned the hard way):**

- **A screenshot is authoritative, `getBoundingClientRect` is NOT.** Rect math caps at `innerHeight`, so it CANNOT see whitespace *below* the popup — a too-short body reads `gripsBottom === innerHeight` (gap 0) while a device screenshot clearly shows a gap. Always confirm popup fill/anchoring with `adb -s RF8M81WSL1V exec-out screencap -p > ztemp/x.png`.
- **The "extension added" banner is a temporary-install artifact.** Every geckodriver/web-ext run shows it (fresh temporary add-on); it adds dev-only bottom chrome and dismissing it doesn't always reclaim the space. A permanent (AMO) install has no banner. Don't chase whitespace that's really this banner.
- **geckodriver resets the Nightly profile each run** → address bar returns to the top; you canNOT reproduce a user's bottom-toolbar or other profile settings this way. `web-ext run` uses the real profile (so newly-added files like `popup-context.js` need a full `web-ext run` restart, not a hot-reload).
- **Viewport units misreport in the extension tab:** `dvh`/`svh`/`innerHeight`/`fixed;bottom:0` all = the area above the system nav (~634 on Note10); `lvh`/`vh`/`outerH` = the full window (~690). The popup body uses `calc(100dvh + env(safe-area-inset-bottom))` to fill edge-to-edge. `@media(pointer:fine)` is unreliable — the S-Pen trips it.
- **Device asleep → `Failed to decode response from marionette`.** Wake it first: `adb -s RF8M81WSL1V shell input keyevent KEYCODE_WAKEUP`.
- **Don't leave a geckodriver session idling** (e.g. a long `driver.sleep` to "leave it open") — it looks like a hang and the user may kill it.

## Edge Canary Android MV3 Prototype

Build the side-by-side Edge/Chrome MV3 prototype without modifying Firefox source:

```bash
npm run build:edge-crx
```

Outputs:
- Generated source: `ztemp/edge-mv3-src/`
- Native-packed CRX: `web-ext-artifacts/a-font-face-off-edge-mv3.crx`
- Stable local CRX key: `ztemp/edge-mv3-key.pem`

Push a rebuilt CRX to the Note10:

```bash
adb -s RF8M81WSL1V push web-ext-artifacts/a-font-face-off-edge-mv3.crx /sdcard/Download/a-font-face-off-edge-mv3.crx
```

Edge Canary package/device details seen in testing:
- Device: `RF8M81WSL1V` (Samsung Galaxy Note10)
- Package: `com.microsoft.emmx.canary`
- Stable extension ID from the local key: `jbomcpnpnenellkkkmhonikajmmalpig`

Install path on device:
1. Edge Canary → Settings → About → tap version 5 times.
2. Developer Options → `Extension install by crx`.
3. Pick the CRX from Downloads.
4. A successful install shows a permissions prompt and then appears in Edge menu → Extensions.

If selecting a CRX silently returns to the previous page, assume the CRX did not register. Native-packed CRX files from Chromium/Chrome/Edge worked; a hand-written CRX3 file was accepted by the picker but ignored.

Avoid Edge Canary's extension Details page if it hangs. The extension menu may show only Details and Permissions, so use the AFFO popup gear/options path or in-page toolbar/Quick Pick where available.

### Edge WebDAV Sync

AFFO's WebDAV Server URL should be the DAV root that answers authenticated `PROPFIND` with `207 Multi-Status`, not necessarily a human-browsable WebDAVNav folder URL. For the local WebDAVNav server used in testing:

```text
Server URL: http://192.168.0.120:8080/
Username: user
Password: user
Folder suffix: Chrome
```

This writes to `A Font Face-off Chrome/`. Browser GETs to paths like `/chrome/` can show a WebDAVNav HTML UI while authenticated `PROPFIND /chrome/` still returns 404, so do not treat GET success as a WebDAV sync proof.

## Popup panel details

- The popup opens inside the `customizationui-widget-panel` panel element in chrome context
- Panel state can be checked: `panel.state === 'open'`
- Close via: `document.getElementById('customizationui-widget-panel').hidePopup()`

## Limitations

- Some sites detect Selenium and show CAPTCHA (Wikipedia works fine)
- Requires Firefox Developer Edition (geckodriver needs it for `-remote-allow-system-access`)
- `popupExec` only works with `extensions.webextensions.remote=false` (in-process mode)

### Computer Use Boundary

Computer Use is the GUI escape hatch, not the default AFFO test path. Use it when the target is the Mac app UI itself:
- Firefox Developer Edition helper/update prompts, permission prompts, and browser chrome dialogs.
- `about:debugging` or DevTools windows when the workflow requires visible panel navigation.
- One-off visual confirmation of desktop browser state before deciding whether to automate with Selenium.

Do not use Computer Use for repeatable popup/content-script regression checks, real DOM/computed-style assertions, or Android page inspection when Selenium/geckodriver, the Android Firefox harness, Chrome CDP, or ADB can provide structured output.

## Troubleshooting

### Repeated macOS "Install Helper" prompts

If Firefox Developer Edition asks to install its helper every time Selenium launches it, treat that as a Firefox updater state problem first, not a `geckodriver` bug.

Check whether Firefox has a pending update/finalization record:

```bash
APP="/Applications/Firefox Developer Edition.app"
CACHE="$HOME/Library/Caches/Mozilla/updates/Applications/Firefox Developer Edition"

defaults read "$APP/Contents/Info" CFBundleShortVersionString
defaults read "$APP/Contents/Info" MozillaBuildID
test -f "$CACHE/active-update.xml" && cat "$CACHE/active-update.xml"
find "$CACHE" -maxdepth 3 -name update.status -exec sh -c 'echo "--- $1"; cat "$1"' _ {} \;
```

Signs of the stuck updater case:
- `active-update.xml` exists and reports `Install Pending`
- an `update.status` file reports `pending` or similar
- the helper prompt reappears on every Firefox launch, including Selenium runs

Recommended recovery:
1. Quit Firefox Developer Edition completely.
2. Launch it manually once and let it finish startup/update cleanup.
3. Restart Firefox if needed, then rerun Selenium.
4. If the prompt still repeats, reinstall Firefox Developer Edition before debugging the test harness further.

This issue can break Selenium launches even when the test code and skill are otherwise fine.

### Firefox Android `web-ext run` duplicate RDP sockets

Only perform this cleanup against the pre-approved `RF8M81WSL1V` + `org.mozilla.fenix` target unless the user gives new explicit approval for another device/package pair.

If the user runs `web-ext run -t firefox-android` and gets `Unexpected multiple RDP sockets`, inspect and clear stale forwards before retrying:

```bash
adb -s DEVICE_ID forward --list
adb -s DEVICE_ID forward --remove tcp:PORT
adb -s RF8M81WSL1V shell am force-stop org.mozilla.fenix
adb -s RF8M81WSL1V shell grep org.mozilla.fenix /proc/net/unix
```

The final `grep` should print no duplicate `firefox-debugger-socket` rows before retrying. If sockets remain after force-stop, a device reboot is the blunt recovery.

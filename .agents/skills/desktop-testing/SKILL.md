---
name: firefox-extension-testing
description: Test and inspect the A Font Face-off extension on Android Firefox Nightly, desktop Firefox and Chrome for Testing, Vivaldi Snapshot, and Chromium Android MV3 builds using Selenium, geckodriver, Firefox Developer Edition, Android WebDriver, ADB, and CRX build/install workflows. Unless the user specifies another platform, interpret reported AFFO problems and questions as Android Firefox Nightly behavior.
---

# A Font Face-off Extension Testing

Automated and semi-automated testing of the extension on desktop Firefox Developer Edition, desktop Chrome for Testing, Android Firefox, Vivaldi Snapshot, and Edge Canary Android MV3. Desktop Firefox tests interact with the real browser action popup. Desktop Chrome for Testing uses Selenium startup and CDP assertions against an extension tab; it does not verify the native toolbar popup. Android Firefox inspection uses the project WebDriver harness for real DOM and computed CSS. Edge Canary Android work uses generated MV3 source, native-packed CRX artifacts, and ADB/manual Canary extension UI.

This repo skill is canonical for AFFO-specific commands, selectors, storage seeds, popup/toolbar IDs, generated Edge MV3 artifacts, and known site examples. Use the global `firefox-extension-debug` skill for reusable Android Firefox safety boundaries, ADB patterns, CDP reconnaissance guidance, and GUI/DevTools route selection.

## Default Problem Target

Unless the user states otherwise, treat AFFO behavior questions and reported problems as occurring in Firefox Nightly on Android. Desktop Firefox Developer Edition is often a faster initial testing area for shared extension logic, deterministic regression tests, and site CSS investigation. When mobile layout, touch behavior, Firefox Android behavior, or final user-visible verification matters, confirm the result on Android Firefox Nightly rather than treating a desktop result as conclusive.

For automated Android Firefox verification, use the authorized Firefox Nightly target documented below unless the user explicitly authorizes a different target.

Consider `AFFO_Pixel_API36` for repeatable Android smoke tests and visual experiments when a specific physical device is not required. It runs actual Android browsers, rather than desktop mobile emulation. Firefox has the opt-in emulator smoke lane below; Vivaldi Snapshot uses the [emulator ADB/CDP workflow](references/vivaldi-snapshot.md#android-16-emulator). Emulator speed versus the Note10 has not been benchmarked; keep device-specific reproduction on the relevant phone.

## Prerequisites

```bash
brew install geckodriver
geckodriver --version
npm install  # selenium-webdriver is a devDependency
```

Keep Python development dependencies local to the repository. The asdf-managed
Python version comes from `.tool-versions`; install the pinned dependencies into
the ignored `.venv/` rather than the shared asdf interpreter:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
```

Run Python-backed skill tooling through `.venv/bin/python`. For example, validate
this skill with the validator bundled with Codex:

```bash
.venv/bin/python /Users/mike/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/desktop-testing
```

Use geckodriver 0.37.1 or later for Firefox Android automation. If an older Homebrew version is installed, run `brew update` and `brew upgrade geckodriver` as separate commands, then verify the version again. This minimum does not apply to desktop-only testing.

For desktop Firefox tests, Firefox Developer Edition must be installed at `/Applications/Firefox Developer Edition.app`.

Android Firefox inspection also requires ADB and an authorized Android device.

## AFFO Debugging Order

1. Use code search, unit tests, lint, and local scripts first for source-level behavior.
2. Use desktop Firefox Selenium/geckodriver for repeatable native-popup and shared content-script checks. Run `npm run test:chrome` for changes affecting Chromium MV3 behavior: the API adapter, background service worker, messaging, injection, DNR, or shared popup/apply/reset paths. For changes crossing both engines, use relevant Firefox integration tests plus Chrome smoke.
3. For a bug in the current Android session, use the existing Firefox DevTools/RDP connection when available so its cache, settings, and failing page survive. Use the Android Firefox WebDriver harness for reproducible seeded runs; session creation clears the selected package data. Read [live-session inspection and Apply timing](references/live-session-inspection.md) for build checks, popup targeting, and completion evidence.
4. Use desktop Chrome through the Codex Chrome Extension when the user's real Chrome profile/session is the fastest way to inspect already-open or authenticated desktop pages: original DOM, selectors, overlays, console logs, screenshots, and baseline computed styles. Treat this as reconnaissance, and verify AFFO/Firefox-specific conclusions in Firefox.
5. Use Android Chrome/Edge DevTools/CDP for quick mobile site reconnaissance: original DOM, selectors, layout, network, and baseline computed styles before or alongside Firefox verification.
6. Use Vivaldi Snapshot on the Note10 or the configured Android 16 emulator for shared Chromium MV3 verification (see the Snapshot reference below for each target’s scope and setup), or Edge Canary for Edge-specific behavior; use CDP there for page and extension debugging where available, and verify Firefox-specific conclusions separately.
7. Use ADB for coarse device state: screenshots, taps, URL/page confirmation, UI dumps, and extension iframe presence.
8. Use Computer Use only for Mac GUI workflows such as Firefox Developer Edition prompts, `about:debugging`, DevTools panel navigation, or one-off visual workflow discovery.

## Running Tests

Choose and run checks as part of the task, according to the changed behavior;
this is not a commit-triggered test policy. The user does not want automated
commit hooks. Do not add commit/push hooks or CI triggers without a request.
Start with relevant unit tests and lint for code changes, add the browser checks
that exercise the affected paths, and verify Android when mobile or browser-specific
behavior matters. Documentation-only edits do not require browser smoke runs.
Do not run every platform suite for every change.

```bash
# Build XPI and run desktop Firefox integration tests
npm run test:integration

# Or build and run separately
npm run build:latest
node --test tests/integration-popup.itest.js

# Build Chromium and run desktop Chrome for Testing smoke
npm run test:chrome
```

### Desktop Chrome for Testing

Use `npm run test:chrome` as the repeatable desktop Chromium extension check.
The runner (`scripts/test-desktop-chromium.js`) uses the existing Selenium
dependency, automatically loads the generated unpacked extension into a fresh
profile under `ztemp/`, and quits Chrome and removes that profile afterward.
Selenium Manager caches the pinned Chrome for Testing and matching ChromeDriver
under `ztemp/selenium/`; it does not use the user's normal Chrome profile.

The shared assertions in `scripts/chromium-smoke.js` also power the Android
Chromium runner. Desktop coverage includes MV3/content initialization, popup
mode switching, remote-font Apply and Body Reset, three-family TMI, installed
DNR rules, WhatFont, USER-origin CSS insertion/removal, persisted domain state
and tracked CSS cleanup after service-worker restart, and new extension errors.
Desktop Chrome can reuse a worker target ID: prove restart through the stopped
lifecycle event and a fresh global context, not target-ID inequality.

The default is headless. `AFFO_CHROME_HEADED=1 npm run test:chrome` shows the
browser; `AFFO_CHROME_VERSION=stable npm run test:chrome` explicitly tests current
Stable, while an exact version selects a reproducible build. Keep the pinned
default unless deliberately updating it. Read
[desktop Chrome smoke details](../../../docs/architecture/MV3.md#desktop-chrome-smoke)
for the pin and setup. Results and actual browser version are recorded in
`ztemp/desktop-chromium-test.json`.

The run needs example.com and Google Fonts connectivity, local browser/debugging
port access, and downloads on first use. Distinguish infrastructure failures
from extension failures. Popup assertions cover an **extension tab**, even in
headed mode; use separate native-panel checks for browser-action behavior. The
DNR assertion checks rule configuration, not actual page script blocking. Keep
Android Vivaldi verification for mobile layout, touch, and Vivaldi-specific
behavior; retain Firefox checks for Firefox behavior. The existing-profile Chrome
connector remains useful for page reconnaissance, separate from this smoke runner.

## Firefox Selenium Architecture

### Key concepts

- **In-process extensions**: `extensions.webextensions.remote=false` runs extension code in the parent process so `contentWindow` is accessible for `Cu.Sandbox`
- **Chrome context**: `driver.setContext(firefox.Context.CHROME)` switches to browser chrome for toolbar/panel interaction; requires geckodriver's `--allow-system-access` server flag. Do not pass Firefox's former `-remote-allow-system-access` argument through `moz:firefoxOptions`; current Firefox rejects it when set via capabilities.
- **Fresh temp profiles (desktop only)**: Each desktop test run creates a new profile via `fs.mkdtempSync`, avoiding conflicts with existing Firefox sessions. This isolation does not apply to Firefox Android/Fenix.
- **No UUID discovery needed for standard desktop popup tests**: Click the real toolbar button instead of finding a `moz-extension://` URL. Pin an Android add-on UUID only when deterministic extension-tab origins or blob URLs help an assertion.

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

For popup openings triggered asynchronously from page UI, do not call `popupExec` immediately after the click. `waitForPopupReady` proves that a loaded `popup.html` browser exists, but Firefox can retain that document after its panel closes. First wait for the source action to reach its success state (for example, WhatFont `Loading...` → `Opening...`; treat `Unavailable` as failure), then confirm `customizationui-widget-panel.state === 'open'` in chrome context before reading popup state. Otherwise `popupExec` may return the defaults from a stale, closed popup document.

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

Android Selenium/geckodriver session creation clears the selected Firefox package data. Operations using that path, or explicit Firefox app/profile clearing, are pre-approved for this exact physical-device target:

```text
Device:  RF8M81WSL1V (Samsung Galaxy Note10)
Package: org.mozilla.fenix (Firefox Nightly)
```

The Firefox Nightly profile on that Note10 may be treated as disposable for AFFO debugging. Do not perform such operations against:

- Any other Firefox package on the Note10, including Firefox Release or Beta.
- `org.mozilla.fenix` or any Firefox package on another phone, tablet, emulator, or Android user/work profile.

The disposable Android 16 emulator is an explicit exception for the opt-in
emulator smoke lane:

```text
Device:  emulator-5554 (AFFO_Pixel_API36, Android 16/API 36)
Package: org.mozilla.fenix (Firefox Nightly)
```

Its Firefox profile may be cleared by `npm run test:android:emulator`. This
exception does not authorize profile clearing on the physical S23 Ultra or TCL
NxtPaper devices.

Obtain new explicit user approval before using an unapproved device/package pair. Non-mutating ADB inspection such as checking connected devices, package versions, screenshots, and UI dumps is outside this reset-risk permission, but still target the intended serial explicitly.

#### Approval-compatible Note10 ADB

For direct ADB work on the approved Note10, put the literal serial in every command and run exactly one ADB command per tool call. Do not use an environment variable for the serial. Do not use pipes, redirects, `&&`, `||`, `;`, command substitution, loops, or a shell wrapper around ADB. Those forms do not match narrow command-prefix approvals reliably and obscure which device operation is authorized.

Use two explicit commands for local captures:

```bash
adb -s RF8M81WSL1V shell screencap -p /sdcard/affo-current.png
adb -s RF8M81WSL1V pull /sdcard/affo-current.png ztemp/affo-current.png
adb -s RF8M81WSL1V shell uiautomator dump /sdcard/affo-ui.xml
adb -s RF8M81WSL1V pull /sdcard/affo-ui.xml ztemp/affo-ui.xml
```

Inspect a pulled file with a separate local command such as `rg` or `sed`. Keep interactive or destructive actions—taps, text input, app force-stop, installs, pushes, forward changes, and package/profile clearing—outside read-only ADB prefix approvals unless the user separately approves the exact operation.

#### scrcpy visual companion

If `scrcpy` is installed, use it for visual confirmation and evidence around
Android Firefox sessions. It complements the WebDriver harness: WebDriver is
authoritative for DOM, computed CSS, extension storage, and injection timing;
scrcpy shows the actual device screen, browser chrome, keyboard, touch feedback,
scrolling, overlays, and transient startup states.

Check the tool once per session:

```bash
scrcpy --version
adb version
```

For the approved Note10, a manual live mirror is:

```bash
scrcpy -s RF8M81WSL1V --max-size=1440 --max-fps=30 --no-audio --window-title="AFFO Android"
```

For non-GUI evidence or a short reproduction recording, use:

```bash
scrcpy -s RF8M81WSL1V --no-window --no-audio --time-limit=10 \
  --record=ztemp/android-scrcpy-session.mp4
```

Do not use `--kill-adb-on-close`; the ADB daemon is shared with Selenium,
geckodriver, and the project helpers. Do not infer DOM or computed-style state
from the video. Pair recordings with the JSON report, geckodriver trace, and
ADB UI dump/screenshot. Recordings are most useful when a failure involves a
Firefox startup stall, missing/covered toolbar, popup-to-tab transition, touch
target, keyboard, scroll, or other behavior that structured inspection cannot
represent.

The harness enforces the approved serial/package pair. Only after fresh explicit approval for a different target may you pass `--allow-unapproved-target`; `--allow-clear-package-data` alone is not sufficient.

`web-ext run -t firefox-android` is a distinct path. It uses the live Fenix profile and may install/remove a temporary extension, but in observed Note10 use it has not reset Nightly settings; `--adb-remove-old-artifacts` removes web-ext staging artifacts, not Firefox app data.

For real Android Firefox DOM and computed-style inspection on the approved target, use:

```bash
geckodriver --version  # require 0.37.1 or later for Android
npm run build:latest
npm run inspect:android-firefox -- --serial RF8M81WSL1V --package org.mozilla.fenix --allow-clear-package-data --expect-affo --out ztemp/android-firefox-inspect.json
```

Before interpreting Android toolbar visibility, scrolling, or click failures, read
[visible-page verification and reload comparisons](references/android-page-verification.md).
Firefox promotions or Home can cover a WebDriver-loaded page while DOM inspection
still succeeds; a populated DOM does not establish a visible test surface. The
harness passes `automationtest=true` to skip onboarding. Note10 Nightly 158.0a1
needed no startup-prompt dismissal in the verified run; observed VPN/CFR prompts
are still handled if present. See the reference for version-specific findings.

For the disposable Android 16 emulator smoke lane, use:

```bash
npm run test:android:emulator
```

This builds the current XPI, clears only the emulator's Nightly profile,
installs the add-on, opens the DeepView regression page, and asserts Android
16, Firefox Nightly, add-on installation, document readiness, AFFO injection,
article presence, and visible toolbar iframe state. Because the test launches
child ADB processes, run it in an environment that can access the shared ADB
daemon; if sandboxing blocks ADB startup, rerun with elevated execution
approval.

Important: Unlike the `web-ext run` workflow, the Selenium/geckodriver harness clears package data when creating an Android session. The script requires `--allow-clear-package-data` as an explicit acknowledgement; this approval applies only to Nightly on the Note10 identified above.

Before starting geckodriver, the script verifies the ADB transport and package, wakes the device, attempts a non-bypassing keyguard dismissal, records device/Firefox versions, and reports existing forwards and debugger sockets. It installs `web-ext-artifacts/latest.xpi` temporarily by default, opens the target URL, and writes JSON with AFFO markers plus computed CSS for selected selectors. Because Android geckodriver clears package data when the session starts, use `--skip-addon` only for no-addon/baseline page inspection or deliberately unusual sessions where add-on installation is handled another way.

After the reset and WebDriver inspection, the harness automatically restores the bookmarks maintained in [references/android-firefox-bookmarks.json](references/android-firefox-bookmarks.json). Restoration runs after `driver.quit()`, when Nightly has returned from geckodriver's temporary GeckoView surface to its normal fresh profile. Fenix does not support the WebExtensions bookmarks API and keeps its bookmark store outside Gecko's Places database, so the harness launches with `automationtest=true`, dismisses any observed VPN/CFR prompt, opens each listed URL, and uses resource/description-based ADB UI nodes to select **More options → Bookmark page**. It requires a visible `Saved in “Bookmarks”` confirmation, records the result in the JSON report, and force-stops Nightly afterward. This is a short, deterministic page-menu flow; do not replace it with fixed tap coordinates. Use `--skip-bookmarks` when a clean bookmark state is part of the test, or `--bookmarks <path>` for a deliberate alternate JSON list. Update the maintained list when the user asks to preserve another recurring Android Nightly test page.

Run the same checks without clearing Firefox data:

```bash
npm run inspect:android-firefox -- --serial RF8M81WSL1V --package org.mozilla.fenix \
  --preflight-only --out ztemp/android-firefox-preflight.json
```

Every run writes a timestamped trace log under `ztemp/geckodriver-android-*.log`; failed JSON reports include the last trace lines. Use `--geckodriver-log ztemp/<name>.log` when a stable filename is useful. Preserve the JSON and trace together when diagnosing `Process unexpectedly closed`, Marionette decode errors, or session-creation failures.

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

`inspect:android-firefox` inspects the *web page* (content script), not the popup UI. The popup can render on different surfaces; identify and inspect the one used in the reported behavior:

- **Desktop**: a browser-action PANEL (sizes-to-content; CSS gives it a fixed `400x600`).
- **Firefox Android**: full-viewport UI can be a native browser-action surface at `popup.html`, or an ordinary extension tab at `popup.html?domain=…&sourceTabId=…` created by `openPopupFallback` (toolbar/one-shot page-font flows). The native surface may be absent from RDP `listTabs` even while visible on the phone. Identify the actual surface with the device UI and, from a real extension context, `browser.extension.getViews()` and `browser.tabs.query({})`. Preserve the user's entry path when reproducing a UI-specific issue. `popup-context.js` keys mobile sizing off `/Android/i` in the UA → `html.affo-mobile`.

To drive/inspect that popup tab with geckodriver, pin the add-on UUID to make extension origins and blob URLs deterministic, then trigger the real page flow and switch to its new window handle. Do not depend on direct WebDriver navigation to `moz-extension://`; current Fenix/geckodriver can reject it with `Navigation to ... is not allowed in this context`.

```js
const UUID = '11111111-2222-3333-4444-555555555555';
options.setPreference('extensions.webextensions.uuids',
  JSON.stringify({ 'a-font-face-off@example.com': UUID }));
await driver.installAddon('web-ext-artifacts/latest.xpi', true);

const handlesBefore = await driver.getAllWindowHandles();
// Trigger the actual WhatFont Face-off or toolbar openPopup flow here.
const popupHandle = await driver.wait(async () => {
  const handles = await driver.getAllWindowHandles();
  return handles.find(handle => !handlesBefore.includes(handle)) || false;
}, 10000);
await driver.switchTo().window(popupHandle);
```

Fenix may classify the resulting extension tab as a privileged browsing context. In that context, `executeScript` and `executeAsyncScript` can fail with `not supported for privileged browsing contexts`. Read it with native WebDriver element commands instead:

```js
const { By, until } = require('selenium-webdriver');
const topDisplay = await driver.wait(until.elementLocated(By.id('top-font-display')), 15000);
const topFont = ((await topDisplay.getProperty('textContent')) || '').trim();
const previewStyle = await driver.findElement(By.id('top-font-text')).getDomAttribute('style');
const activeMode = await driver.findElement(By.css('[data-mode].active')).getDomAttribute('data-mode');
```

Use `getProperty('textContent')` for hidden popup controls. Selenium `getText()` returns an empty string for elements hidden by the current panel layout. Prefer `getDomAttribute(...)` for literal attributes and `getProperty(...)` for DOM properties; avoid helpers that fall back to injected JavaScript in the privileged tab.

**Note10 measurement gotchas (learned the hard way):**

- **A screenshot is authoritative, `getBoundingClientRect` is NOT.** Rect math caps at `innerHeight`, so it CANNOT see whitespace *below* the popup — a too-short body reads `gripsBottom === innerHeight` (gap 0) while a device screenshot clearly shows a gap. Always confirm popup fill/anchoring with the separate `shell screencap` and `pull` commands above.
- **The "extension added" banner is a temporary-install artifact.** Every geckodriver/web-ext run shows it (fresh temporary add-on); it adds dev-only bottom chrome and dismissing it doesn't always reclaim the space. A permanent (AMO) install has no banner. Don't chase whitespace that's really this banner.
- **geckodriver resets the Nightly profile each run** → address bar returns to the top; you canNOT reproduce a user's bottom-toolbar or other profile settings this way. `web-ext run` uses the real profile (so newly-added files like `popup-context.js` need a full `web-ext run` restart, not a hot-reload).
- **Viewport units misreport in the extension tab:** `dvh`/`svh`/`innerHeight`/`fixed;bottom:0` all = the area above the system nav (~634 on Note10); `lvh`/`vh`/`outerH` = the full window (~690). The popup body uses `calc(100dvh + env(safe-area-inset-bottom))` to fill edge-to-edge. `@media(pointer:fine)` is unreliable — the S-Pen trips it.
- **Device asleep → `Failed to decode response from marionette`.** The harness now wakes the device during preflight; for manual workflows use `adb -s RF8M81WSL1V shell input keyevent KEYCODE_WAKEUP`.
- **Don't leave a geckodriver session idling** (e.g. a long `driver.sleep` to "leave it open") — it looks like a hang and the user may kill it.

## Vivaldi Snapshot Android — device and emulator testing

The user explicitly authorizes disposable AFFO testing on **Note10 `RF8M81WSL1V` + `com.vivaldi.browser.snapshot`**. This includes force-stop/relaunch, clearing Snapshot app/profile data, and installing/reloading the local AFFO Chromium build for tests. No additional reset confirmation is needed for this pair. Vivaldi stable (`com.vivaldi.browser`), other devices, and other Android users/work profiles are outside this approval.

Use resets for clean-install tests; preserve the test session for ordinary iteration. A Snapshot reset clears its tabs, settings, installed extensions, and login state. Do not sign the disposable profile into browser Sync.

Read [Vivaldi Snapshot testing](references/vivaldi-snapshot.md) for the verified installation, CDP, and test workflow. `npm run build:chromium` generates the shared build at `ztemp/chromium-mv3-src/`. The Firefox geckodriver harness remains Firefox-only; do not pass the Vivaldi package to it.

Vivaldi Snapshot also passed the shared smoke suite and native-popup checks on `emulator-5554` (`AFFO_Pixel_API36`, Android 16). Read the [emulator findings](references/vivaldi-snapshot.md#android-16-emulator) before choosing this path. Reuse the installed emulator profile for iteration; the verified setup did not require app-data clearing.

## Chromium Android MV3

Use the shared Chromium MV3 build for Edge Canary and Vivaldi Snapshot. For
Edge-specific installation, disposable-profile authorization, CDP attachment,
native-popup inspection, and layout verification, read
[Edge Canary Android testing](references/edge-canary.md).

### Edge WebDAV Sync

AFFO's WebDAV Server URL should be the DAV root that answers authenticated `PROPFIND` with `207 Multi-Status`, not necessarily a human-browsable WebDAVNav folder URL. For the local WebDAVNav server used in testing:

```text
Server URL: http://192.168.0.120:8080/
Username: user
Password: user
Folder suffix: Chrome
```

This writes to `A Font Face-off Chrome/`. Browser GETs to paths like `/chrome/` can show a WebDAVNav HTML UI while authenticated `PROPFIND /chrome/` still returns 404, so do not treat GET success as a WebDAV sync proof.

## Desktop popup panel details

- The popup opens inside the `customizationui-widget-panel` panel element in chrome context
- Panel state can be checked: `panel.state === 'open'`
- Close via: `document.getElementById('customizationui-widget-panel').hidePopup()`

## Limitations

- Some sites detect Selenium and show CAPTCHA (Wikipedia works fine)
- Requires Firefox Developer Edition and geckodriver started with `--allow-system-access`
- `popupExec` only works with `extensions.webextensions.remote=false` (in-process mode)

### Computer Use Boundary

Computer Use is the GUI escape hatch, not the default AFFO test path. Use it when the target is the Mac app UI itself:
- Firefox Developer Edition helper/update prompts, permission prompts, and browser chrome dialogs.
- `about:debugging` or DevTools windows when the workflow requires visible panel navigation.
- One-off visual confirmation of desktop browser state before deciding whether to automate with Selenium.

Do not use Computer Use for repeatable popup/content-script regression checks, real DOM/computed-style assertions, or Android page inspection when Selenium/geckodriver, the Android Firefox harness, Chrome CDP, or ADB can provide structured output.

## Troubleshooting

### Firefox Developer Edition updates

Whenever desktop testing indicates that Firefox Developer Edition needs an update—because it is outdated, has a pending or stuck update, lacks compatibility required by the current tooling, or shows symptoms plausibly caused by updater state—pause testing and prompt the user to update FDE, quit it completely, and restart it. Do not perform the application update on the user's behalf, silently work around the required update, or continue drawing conclusions from the affected FDE run.

Relevant symptoms include repeated helper prompts, browser/Selenium startup failures attributable to the installed FDE version, and page loads or reloads that appear to hang while the expected AFFO left toolbar is absent. These symptoms are diagnostic triggers, not proof by themselves; check available version/update evidence before declaring that an update is required.

Resume desktop testing after the user confirms the update/restart. If FDE is already current and the behavior persists, continue with normal page, extension, and geckodriver diagnostics. This rule is specific to desktop Firefox Developer Edition; do not use it to redirect Android Firefox Nightly failures.

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

### Firefox Android exits before Marionette

If session creation fails with `Process (pid=...) unexpectedly closed with unknown status` before add-on installation or navigation, inspect the geckodriver trace before blaming Nightly, AFFO, or the target page.

The geckodriver 0.37.0 false-exit signature on an unrooted Android device is:

```text
shell:kill -0 PID 2>/dev/null; echo $?
... << "1\n"
Android package org.mozilla.fenix has exited
Force stopping Android package: org.mozilla.fenix
```

In this case geckodriver mistakes a denied `kill -0` probe for process exit and force-stops a still-running Firefox process. Update and verify before retrying the data-clearing session:

```bash
brew update
brew upgrade geckodriver
geckodriver --version  # require 0.37.1 or later
```

A corrected 0.37.1 trace checks `test -d /proc/PID` and can proceed to `Connection to Marionette established`. Apply this diagnosis only when the old trace signature is present; otherwise continue with the captured trace and Android logs.

### Firefox Android `web-ext run` duplicate RDP sockets

Only perform this cleanup against the pre-approved `RF8M81WSL1V` + `org.mozilla.fenix` target unless the user gives new explicit approval for another device/package pair.

If the user runs `web-ext run -t firefox-android` and gets `Unexpected multiple RDP sockets`, inspect and clear stale forwards before retrying:

```bash
adb -s RF8M81WSL1V forward --list
adb -s RF8M81WSL1V forward --remove tcp:PORT
adb -s RF8M81WSL1V shell am force-stop org.mozilla.fenix
adb -s RF8M81WSL1V shell cat /proc/net/unix
```

Inspect the final command's output for duplicate `org.mozilla.fenix/...firefox-debugger-socket` rows before retrying. Forward removal and force-stop are state-changing and should receive specific approval; do not place them under the read-only Note10 prefixes. If sockets remain after force-stop, a device reboot is the blunt recovery.

---
name: desktop-testing
description: Test and inspect the A Font Face-off extension on Android Firefox Nightly, desktop Firefox and Chrome for Testing, Vivaldi Snapshot, and Chromium Android MV3 builds using Selenium, geckodriver, Firefox Developer Edition, Android WebDriver, ADB, and CRX build/install workflows. Unless the user specifies another platform, interpret reported AFFO problems and questions as Android Firefox Nightly behavior.
---

# A Font Face-off Extension Testing

Automated and semi-automated testing of the extension on desktop Firefox Developer Edition, desktop Chrome for Testing, Android Firefox, Vivaldi Snapshot, and Edge Canary Android MV3. Desktop Firefox tests interact with the real browser action popup. Desktop Chrome for Testing uses Selenium startup and CDP assertions against an extension tab; it does not verify the native toolbar popup. Android Firefox inspection uses the project WebDriver harness for real DOM and computed CSS. Edge Canary Android work uses generated MV3 source, native-packed CRX artifacts, and ADB/manual Canary extension UI.

This repo skill is canonical for AFFO-specific commands, selectors, storage seeds, popup/toolbar IDs, generated Edge MV3 artifacts, and known site examples. Use the global `firefox-extension-debug` skill for reusable Android Firefox safety boundaries, ADB patterns, CDP reconnaissance guidance, and GUI/DevTools route selection.

## Choose a test surface

| What to verify | Runner or route | Evidence |
|---|---|---|
| Firefox desktop popup interaction | `npm run test:integration`, or the relevant integration file after building | Assertions against the native toolbar popup and the affected page |
| Content-script readiness on a URL | Desktop Firefox inspector or `inspect:android-firefox` with `--expect-affo` | The inspected tab’s top frame answers `affoGetPageInfo` with its own URL |
| Reproducible Firefox Android touch behavior | `npm run test:android:emulator` or Android inspector with `--test-line-change` | Native control taps and resulting computed styles and highlight ranges |
| A failure in an existing Firefox Android session | [Live-session inspection](references/live-session-inspection.md) | Failing page, current profile and actual extension build observed together |
| Shared Chromium behavior | `npm run test:chrome` or prepared [Snapshot](references/vivaldi-snapshot.md) / [Canary](references/edge-canary.md) session | Extension-tab assertions and resulting page state |
| Native Android popup geometry or visibility | Reproduce through the reported entry point | Device screenshot or UI tree alongside DOM measurements |

## Default Problem Target

Unless the user states otherwise, treat AFFO behavior questions and reported problems as occurring in Firefox Nightly on Android. Desktop Firefox Developer Edition is often a faster initial testing area for shared extension logic, deterministic regression tests, and site CSS investigation. When mobile layout, touch behavior, Firefox Android behavior, or final user-visible verification matters, confirm the result on Android Firefox Nightly rather than treating a desktop result as conclusive.

For automated Android Firefox verification, use one of the Firefox Nightly targets in [AGENTS.md](../../../AGENTS.md#android-test-targets) unless the user explicitly authorizes a different target.

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
- The first tab, `#shared-mode-tab`, has `data-mode="line-change"` or `data-mode="body-contact"` according to its selected mode. Long-press it or send Shift+Enter to switch. The other two tabs use `data-mode="faceoff"` and `data-mode="third-man-in"`.
- Active class: `.active`
- Body-contact auto-opens the body controls panel (no grip click needed)

### Font Displays
- `#line-source` (Sub out family list), `#line-font-display` (Sub in picker)
- `#body-font-display` (Body Contact)
- `#top-font-display`, `#bottom-font-display` (Face-off)
- `#serif-font-display`, `#sans-font-display`, `#mono-font-display` (Third Man In)

### Grips
- `#line-out-grip` (left), `#line-in-grip` (right), `#edit-favorites-line` (center)
- `#body-font-grip` (Body Contact)
- `#top-font-grip`, `#bottom-font-grip` (Face-off)
- `#serif-font-grip`, `#sans-font-grip`, `#mono-font-grip` (Third Man In)

### Controls Panels
- `#body-font-controls` supplies the template for top, bottom, serif, sans, mono, and the Line Change Sub in editor. Sub out has its own list panel.
- The standard font editors share controls for font display, size/line-height/weight sliders with text inputs and value displays, color selector, axes container, footer with favorite buttons + apply/reset
- Visibility toggled via `.visible` CSS class (use `togglePanel(position)`)

For Line Change browser commands, test surfaces, and expected results, see the
[desktop and Android regression checks](../../../docs/architecture/MV3.md#line-change-regression-checks).

### Font Picker
- Modal: `#font-picker-modal`
- Opened by clicking a font display element

## Content Script Testing

Both Firefox inspectors support `--expect-affo`. They capture the inspected tab ID before opening a temporary extension tab, send the request to frame zero, verify the reply URL, then return to the source tab. The page’s `data-affo-base` attribute remains diagnostic. DeepView can remove it during startup. The Android smoke suite checks the expected `sans` classification on its controlled Arial fixture.

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

### Android Inspection

#### Android test target selection

Check the [AFFO device and package permissions](../../../AGENTS.md#android-test-targets) before a reset or Android WebDriver session. For the emulator, verify that `adb -s emulator-5554 emu avd name` reports `AFFO_Pixel_API36`.

The emulator does not have Google Play Store installed. When Firefox Nightly,
Vivaldi Snapshot, or Edge Canary is missing or needs updating there, copy the
installed app from the attached Note10 over ADB instead of trying to use a
store. Use `adb -s RF8M81WSL1V shell pm path <package>` on
`RF8M81WSL1V`, pull every returned APK split into `ztemp/`, then install the
matching set on `emulator-5554` with `adb -s emulator-5554 install-multiple`.
Preserve the package and signing identity; do not mix splits from different app
versions.
The browser-specific references below contain the package names and any
known split requirements.

#### TCL NxtPaper 11 Plus — Firefox Nightly

Use `--serial A06B4A57AA34353 --package org.mozilla.fenix --allow-clear-package-data`. The inspector checks the device, package and active primary user before session creation. For the approved emulator it also checks the AVD name and Android version. The dedicated emulator command enforces its fixed target. Use the general inspector for a separately authorized target.

#### Keep Note10 awake throughout testing

Follow the [whole-session power procedure](/Users/mike/.agents/skills/android-use/SKILL.md#keep-note10-awake-during-testing) through cleanup. The inspector wakes the screen once during preflight.

#### Approval-compatible Note10 ADB

For direct ADB work on the approved Note10, put the literal serial in every command and run exactly one ADB command per tool call. Do not use an environment variable for the serial. Do not use pipes, redirects, `&&`, `||`, `;`, command substitution, loops, or a shell wrapper around ADB. Those forms do not match narrow command-prefix approvals reliably and obscure which device operation is authorized.

Use two explicit commands for local captures:

```bash
adb -s RF8M81WSL1V shell screencap -p /sdcard/affo-current.png
adb -s RF8M81WSL1V pull /sdcard/affo-current.png ztemp/affo-current.png
adb -s RF8M81WSL1V shell uiautomator dump /sdcard/affo-ui.xml
adb -s RF8M81WSL1V pull /sdcard/affo-ui.xml ztemp/affo-ui.xml
```

Inspect a pulled file with a separate local command such as `rg` or `sed`. Keep interactive or destructive actions—taps, text input, installs, pushes, and forward changes—outside read-only ADB prefix approvals.

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

`web-ext run -t firefox-android` is a distinct path. It uses the live Fenix profile and may install/remove a temporary extension, but in observed Note10 use it has not reset Nightly settings; `--adb-remove-old-artifacts` removes web-ext staging artifacts, not Firefox app data.

Use WebDriver for fresh, reproducible tests. For testing against the live Android Firefox profile, agents may run `web-ext run -t firefox-android` on an approved device/package and use ADB for native UI plus DevTools/RDP for page and extension inspection. Reuse an existing live session for ordinary inspection and verify the loaded extension revision; see [live-session inspection](references/live-session-inspection.md).

Do not enable **Remote debugging via USB** through the Firefox UI as routine setup or restoration after a profile reset. It is possible, but the user considers the UI workflow too slow; use it only when an unusual debugging need specifically requires DevTools/RDP and no suitable existing connection is available. Ordinary WebDriver testing does not require this toggle. On 2026-11-23, a Note10 reset followed by Settings search for `remote` and UI enablement took 59 seconds through verification, including agent/tool overhead; the final toggle was verified 2.9 seconds after the tap. This is a deliberate workflow choice, not a claim that UI enablement is unsupported.

For fresh Android Firefox DOM and computed-style inspection on the approved target, use:

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

For Firefox Nightly app updates specifically, use package
`org.mozilla.fenix`; after installing the Note10 APK set, verify the installed
version with `adb -s emulator-5554 shell dumpsys package org.mozilla.fenix`
before starting the smoke lane.

This builds the XPI and verifies the approved AVD identity before geckodriver starts. The smoke runner requests `--wait-complete` for DeepView and checks the page reply, article, and visible toolbar. It then exercises Line Change on the local font fixture. The general inspector accepts `interactive` or `complete` by default.

Important: Unlike the `web-ext run` workflow, the Selenium/geckodriver harness clears package data when creating an Android session. The script requires `--allow-clear-package-data` as an explicit acknowledgement; check the device/package pair in [AGENTS.md](../../../AGENTS.md#android-test-targets).

WebDriver inspections are unseeded by default. Only when a test explicitly passes `--seed-substack-roulette`, the temporary profile is seeded with favorite **Charis** (font family Charis SIL) in the Sroulette Serif pool and **Andika** in the Sroulette Sans pool. It also seeds Substack Roulette Line Change enabled with the default `Spectral -> Sroulette Serif` rule. Use `--skip-substack-roulette-seed` when a clean extension-storage state is specifically needed; `--seed-serif` and `--seed-sans` still allow one-run overrides.

These extension-storage seeds belong to geckodriver's temporary profile, not the normal Fenix profile subsequently used by `web-ext`. A successful `storageSeed.confirmedValues` report verifies only the WebDriver session; it does not establish persistent post-reset favorites. After quitting the temporary session, the harness restores bookmarks and separately restores favorites/pools in normal Fenix through `scripts/android-firefox-normal-profile.js`. The helper starts normal Fenix with a temporary GeckoView Marionette configuration and attaches geckodriver using `--connect-existing`, with no Android capabilities and no package-data reset. It checks the actual `/files/mozilla/` profile path, installs AFFO temporarily, merges the favorites, then restarts and reinstalls AFFO to verify persistence without writing again. It removes its configuration and forward, restores the prior Android debug-app and Note10 power settings, and leaves Nightly stopped. Run `web-ext` again to install the temporary extension for normal use; its stored choices persist. This does not enable Remote debugging via USB through the UI. Existing GeckoView configuration is a conflict to resolve, not a file to overwrite. Do not run another data-clearing WebDriver session to inspect that installation.

The usual post-reset favorite/pool defaults belong in the normal Fenix profile used by `web-ext`, once AFFO is installed there; they do not belong in ordinary temporary WebDriver sessions. Enable Sroulette and make Charis the sole selected member of the Serif pool and Andika the sole selected member of the Sans pool, so each pool deterministically uses that font. The storage values are `affoSubstackRoulette: true`, `affoSubstackRouletteSerif: ['Charis']`, `affoSubstackRouletteSans: ['Andika']`, and favorites `Charis: { fontName: 'Charis SIL', variableAxes: {} }` and `Andika: { fontName: 'Andika', variableAxes: {} }`. Preserve unrelated favorites if restoring into nonempty storage. Verify the stored values through an available extension context. Skip this setup for explicit clean-storage, no-addon, browser-only, or conflicting font-configuration tests; do not enable Remote debugging via USB through the UI solely to seed these defaults.

Use `--skip-normal-profile-seed` for a reset that intentionally leaves normal-profile extension storage empty, or `--skip-addon` for no-addon tests (which also skips restoration). `--skip-substack-roulette-seed` affects only the temporary test session. To restore the normal-profile defaults without another reset:

```bash
npm run inspect:android-firefox -- --serial RF8M81WSL1V --package org.mozilla.fenix --restore-normal-profile-only --out ztemp/normal-fenix-restored.json
```

Check `normalProfileSeed.success`, `profile`, `confirmedValues`, and `afterRestart` in the report. Unlike `storageSeed`, these describe the normal Fenix profile. A restoration failure makes the command fail; do not report successful persistent setup based only on the temporary session.

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

Do not rely on pre-existing Nightly profile state in the Android WebDriver path because session creation clears package data. For tests that specifically need deterministic roulette favorites and Line Change settings, opt in explicitly with `--seed-substack-roulette`:

```bash
npm run inspect:android-firefox -- --serial RF8M81WSL1V --package org.mozilla.fenix --allow-clear-package-data --url https://scottsumner.substack.com/p/the-odd-disappearance-of-the-business --seed-substack-roulette --expect-affo --settle 15000 --selector html --selector body --selector p --out ztemp/substack-seeded.json
```

The default Serif pool favorite is named `Charis` and uses the Google Fonts family `Charis SIL`; Sans uses `Andika`. Omit `--seed-substack-roulette` for ordinary runs.

#### Inspecting the popup ITSELF on Note10 (panel vs page-font tab)

The default inspector collects page DOM and CSS. Add `--test-line-change` for the popup touch workflow. The popup can render on different surfaces; identify and inspect the one used in the reported behavior:

- **Desktop**: a browser-action PANEL (sizes-to-content; CSS gives it a fixed `400x600`).
- **Firefox Android**: full-viewport UI can be a native browser-action surface at `popup.html`, or an ordinary extension tab at `popup.html?domain=…&sourceTabId=…` created by `openPopupFallback` (toolbar/one-shot page-font flows). The native surface may be absent from RDP `listTabs` even while visible on the phone. Identify the actual surface with the device UI and, from a real extension context, `browser.extension.getViews()` and `browser.tabs.query({})`. Preserve the user's entry path when reproducing a UI-specific issue. `popup-context.js` keys mobile sizing off `/Android/i` in the UA → `html.affo-mobile`.

On the Android 16 emulator with Nightly 159, `--expect-affo` enables geckodriver system access, resolves the installed extension URL and probes from a temporary extension tab. The production popup can stay closed. For touch behavior, `--test-line-change` opens the real popup tab from the fixture, taps controls through ADB and verifies the effects in the source page. For earlier privileged-context limitations and viewport measurements, see the [Note10 observations](references/android-page-verification.md#earlier-note10-popup-observations-and-inspection-examples).

## Vivaldi Snapshot Android — device and emulator testing

Use resets for clean-install tests; preserve the test session for ordinary iteration. A Snapshot reset clears its tabs, settings, installed extensions, and login state. Do not sign the disposable profile into browser Sync.

Read [Vivaldi Snapshot testing](references/vivaldi-snapshot.md) for the verified installation, CDP, and test workflow. `npm run build:chromium` generates the shared build at `ztemp/chromium-mv3-src/`. The Firefox geckodriver harness remains Firefox-only; do not pass the Vivaldi package to it.

Vivaldi Snapshot also passed the shared smoke suite and native-popup checks on `emulator-5554` (`AFFO_Pixel_API36`, Android 16). Read the [emulator findings](references/vivaldi-snapshot.md#android-16-emulator) before choosing this path. Reuse the installed emulator profile for iteration; the verified setup did not require app-data clearing.

## Chromium Android MV3

Use the shared Chromium MV3 build for Edge Canary and Vivaldi Snapshot. For
Edge-specific installation, CDP attachment,
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

Repeated helper prompts, Selenium startup failures, or a page reload that hangs with the AFFO left toolbar missing warrant checking the installed FDE version and updater state. If FDE is current and the updater is healthy, continue normal page, extension, and geckodriver diagnostics.

When desktop testing requires an FDE update, pause the affected run and update Firefox Developer Edition yourself using its built-in updater. Restart FDE to finish installation, verify the installed build and updater state, then rerun the affected test. Ask the user to intervene only if a required permission or authentication prompt needs their input. This procedure applies only to desktop Firefox Developer Edition.

### Repeated macOS "Install Helper" prompts

If Firefox Developer Edition asks to install its helper every time Selenium launches it, treat that as a Firefox updater state problem first, not a `geckodriver` bug.

Check whether Firefox has a pending update/finalization record:

```bash
APP="/Applications/Firefox Developer Edition.app"
CACHE="$HOME/Library/Caches/Mozilla/updates/Applications/Firefox Developer Edition"

defaults read "$APP/Contents/Info" CFBundleShortVersionString
rg '^(Version|BuildID)=' "$APP/Contents/Resources/application.ini"
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

The commands below target Note10 Nightly. Check the project device scope before adapting them to another target.

If `web-ext run -t firefox-android` reports `Unexpected multiple RDP sockets`, inspect and clear stale forwards before retrying:

```bash
adb -s RF8M81WSL1V forward --list
adb -s RF8M81WSL1V forward --remove tcp:PORT
adb -s RF8M81WSL1V shell am force-stop org.mozilla.fenix
adb -s RF8M81WSL1V shell cat /proc/net/unix
```

Inspect the final command's output for duplicate `org.mozilla.fenix/...firefox-debugger-socket` rows before retrying. Remove only forwards verified to be stale and associated with the affected test session. Force-stop/relaunch of the approved device/package combinations is covered by the standing approval in [AGENTS.md](../../../AGENTS.md#android-test-targets); do not request approval again for those operations. Other targets require explicit approval for destructive testing. If sockets remain after force-stop, a device reboot is a broader recovery action requiring separate approval.

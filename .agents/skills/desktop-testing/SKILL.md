---
name: firefox-extension-testing
description: Test and inspect the A Font Face-off extension on desktop Firefox, Android Firefox, and the Edge Canary Android MV3 CRX prototype using Selenium, geckodriver, Firefox Developer Edition, Android WebDriver, ADB, and CRX build/install workflows.
---

# A Font Face-off Extension Testing

Automated and semi-automated testing of the extension on desktop Firefox Developer Edition, Android Firefox, and the Edge Canary Android MV3 CRX prototype. Desktop tests interact with the real browser action popup (not a direct moz-extension:// URL). Android Firefox inspection uses the project WebDriver harness for real DOM and computed CSS. Edge Canary Android work uses generated MV3 source, native-packed CRX artifacts, and ADB/manual Canary extension UI.

## Prerequisites

```bash
brew install geckodriver
npm install  # selenium-webdriver is a devDependency
```

Firefox Developer Edition must be installed at `/Applications/Firefox Developer Edition.app`.

Android Firefox inspection also requires ADB and an authorized Android device.

## AFFO Debugging Order

1. Use code search, unit tests, lint, and local scripts first for source-level behavior.
2. Use desktop Selenium/geckodriver for repeatable popup and desktop content-script behavior.
3. Use Android Chrome/Edge DevTools/CDP for the fastest look at a site's original mobile DOM, selectors, layout, network, and baseline computed styles.
4. Use the Android Firefox WebDriver harness for authoritative Firefox Android DOM/computed CSS when AFFO injection, extension storage, seeded settings, or final extension behavior matters.
5. Use ADB for coarse device state: screenshots, taps, URL/page confirmation, UI dumps, and extension iframe presence.
6. Use Computer Use only for Mac GUI workflows such as Firefox Developer Edition prompts, `about:debugging`, DevTools panel navigation, or one-off visual workflow discovery.

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
- **Fresh temp profiles**: Each test run creates a new profile via `fs.mkdtempSync`, avoiding conflicts with existing Firefox sessions
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

### Android Firefox Inspection

For real Android Firefox DOM and computed-style inspection, use the project harness only with a dedicated Firefox Android app installation whose profile may be discarded:

```bash
npm run build:latest
npm run inspect:android-firefox -- --serial DEVICE_ID --package TEST_ONLY_FIREFOX_PACKAGE --allow-existing-profile --expect-affo --out ztemp/android-firefox-inspect.json
```

Important: Fenix ignores the temporary profile path used by `web-ext`/geckodriver and runs on the selected app package's real profile. Android automation or temporary add-on installation may modify or reset tabs, settings, add-ons, bookmarks, or other data. Never target the user's everyday Firefox, Beta, or Nightly profile. The script requires `--allow-existing-profile` as an explicit acknowledgement; use a dedicated testing package/profile.

The script installs `web-ext-artifacts/latest.xpi` temporarily by default, opens the target URL, and writes JSON with AFFO markers plus computed CSS for selected selectors. Pass `--skip-addon` when the extension is already installed in that dedicated testing profile.

Speed/fidelity rule:
- Use Android Chrome DevTools/CDP for the fastest look at a site's original mobile DOM, selectors, layout, network, and baseline computed styles.
- Use the Android Firefox harness when the answer must reflect Firefox Android, AFFO extension injection, extension storage, or final computed CSS with AFFO active.
- If Chrome reveals a selector or page structure, verify in Firefox before treating it as extension behavior; sites and engines can diverge.

Storage-dependent features will not be configured unless the script seeds storage or the dedicated testing profile already has configuration. For Substack Roulette checks, seed deterministic favorites before inspecting:

```bash
npm run inspect:android-firefox -- --serial DEVICE_ID --package TEST_ONLY_FIREFOX_PACKAGE --allow-existing-profile --url https://scottsumner.substack.com/p/the-odd-disappearance-of-the-business --expect-affo --seed-substack-roulette --seed-serif Lora --seed-sans Inter --settle 15000 --selector html --selector body --selector p --out ztemp/substack-seeded.json
```

Use a seed font that differs from the site default when proving font application. On Substack, `Lora` is a better serif proof than `Spectral` because many Substack pages already use Spectral.

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

Only perform this cleanup against a disposable/testing Firefox Android package, not a personal browser profile.

If the user runs `web-ext run -t firefox-android` and gets `Unexpected multiple RDP sockets`, inspect and clear stale forwards before retrying:

```bash
adb -s DEVICE_ID forward --list
adb -s DEVICE_ID forward --remove tcp:PORT
adb -s DEVICE_ID shell am force-stop TEST_ONLY_FIREFOX_PACKAGE
adb -s DEVICE_ID shell grep TEST_ONLY_FIREFOX_PACKAGE /proc/net/unix
```

The final `grep` should print no duplicate `firefox-debugger-socket` rows before retrying. If sockets remain after force-stop, a device reboot is the blunt recovery.

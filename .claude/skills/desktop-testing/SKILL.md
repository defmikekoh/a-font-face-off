---
name: desktop-testing
description: Automated testing of the Firefox extension using Selenium, geckodriver, and Firefox Developer Edition
---

# Desktop Firefox Testing

Automated testing of the extension using Firefox Developer Edition, Selenium, and geckodriver. Tests interact with the real browser action popup (not a direct moz-extension:// URL).

## Prerequisites

```bash
brew install geckodriver
npm install  # selenium-webdriver is a devDependency
```

Firefox Developer Edition must be installed at `/Applications/Firefox Developer Edition.app`.

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

For real Android Firefox DOM and computed-style inspection, use the project harness:

```bash
npm run build:latest
npm run inspect:android-firefox -- --serial DEVICE_ID --package org.mozilla.fenix --expect-affo --out ztemp/android-firefox-inspect.json
```

The script installs `web-ext-artifacts/latest.xpi` temporarily by default, opens the target URL, and writes JSON with AFFO markers plus computed CSS for selected selectors. Pass `--skip-addon` when the extension is already installed by another workflow.

Speed/fidelity rule:
- Use Android Chrome DevTools/CDP for the fastest look at a site's original mobile DOM, selectors, layout, network, and baseline computed styles.
- Use the Android Firefox harness when the answer must reflect Firefox Android, AFFO extension injection, extension storage, or final computed CSS with AFFO active.
- If Chrome reveals a selector or page structure, verify in Firefox before treating it as extension behavior; sites and engines can diverge.

Geckodriver installs the temporary addon into a fresh extension profile. Storage-dependent features will not be configured unless the script seeds storage or the workflow uses an already-configured install. For Substack Roulette checks, seed deterministic favorites before inspection:

```bash
npm run inspect:android-firefox -- --serial DEVICE_ID --package org.mozilla.fenix --url https://scottsumner.substack.com/p/the-odd-disappearance-of-the-business --expect-affo --seed-substack-roulette --seed-serif Lora --seed-sans Inter --settle 15000 --selector html --selector body --selector p --out ztemp/substack-seeded.json
```

Use a seed font that differs from the site default when proving font application. On Substack, `Lora` is a better serif proof than `Spectral` because many Substack pages already use Spectral.

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

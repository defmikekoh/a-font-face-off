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

## Popup panel details

- The popup opens inside the `customizationui-widget-panel` panel element in chrome context
- Panel state can be checked: `panel.state === 'open'`
- Close via: `document.getElementById('customizationui-widget-panel').hidePopup()`

## Limitations

- Some sites detect Selenium and show CAPTCHA (Wikipedia works fine)
- Requires Firefox Developer Edition (geckodriver needs it for `-remote-allow-system-access`)
- `popupExec` only works with `extensions.webextensions.remote=false` (in-process mode)

# Android visible-page verification and reload comparisons

## Verify the native surface before measuring layout

For toolbar visibility, scrolling, or touch investigations, check a device
screenshot/UI dump along with `innerWidth`, `innerHeight`, and
`document.visibilityState`. Require a visible, nonzero page viewport before
drawing layout conclusions. Even a nonzero toolbar rectangle is insufficient:
AFFO supplies defensive toolbar dimensions when viewport metrics are unavailable.
This requirement does not apply to deliberately hidden-source-page tests.

### Skip onboarding at launch

Verified on 2026-09-14 with Note10 `RF8M81WSL1V`, Nightly `158.0a1`
(version code `2016184639`), and geckodriver `0.37.1`:

- `--ez automationtest true` skipped welcome onboarding after fresh resets in
  both direct ADB and WebDriver launches.
- No VPN promotion or other blocking startup prompt appeared in those captures.
  The WebDriver page was visible with a `360 × 634` viewport after a five-second
  settle. Both inspection and bookmark restoration recorded zero dismissal actions.
- Use `automationtest` for this build. It requires ADB debugging, without the
  USB/AC power gate of `performancetest`. The test phone was USB-connected, so
  this run does not independently verify unplugged operation.

Absence of a promotion in the verified run does not prove all future promotions are
suppressed. The known VPN/CFR handlers remain available only for observed prompts.
Both flags also alter some tips and open-in-app prompting.

For a direct launch after an authorized reset:

```bash
adb -s RF8M81WSL1V shell am start -W -n org.mozilla.fenix/.HomeActivity --ez automationtest true
```

For custom Selenium harnesses, set `moz:firefoxOptions.androidIntentArguments`:

```js
['-a', 'android.intent.action.VIEW', '-d', 'about:blank',
 '--ez', 'automationtest', 'true']
```

Explicit intent arguments replace the driver's defaults; keep VIEW/about:blank
when adding the extra. Do not pass the extra as a Gecko command-line argument.
The project inspector uses this launch setup and handles observed VPN/CFR prompts
before page inspection and during bookmark restoration. It reports those actions
in `fenixStartupPrompts`. Unexpected welcome onboarding is an error to investigate,
not an instruction to blindly tap Continue.

An add-on-added dialog or Firefox Home can still obscure the target. Dismiss an
observed add-on dialog, or select the already-loaded article by title in Jump back
in or the tab switcher. Locate controls from current UI nodes rather than fixed
coordinates. Recheck the target URL, viewport, and screenshot afterward.

If clicks repeatedly fail or the viewport is zero, inspect the current native
surface before retrying or starting another data-clearing session. DOM click
events can exercise handlers but cannot establish that physical taps work.

## Quick Pick apply → reload evidence

Favorite buttons use the left half for serif and the right half for sans. Target
the intended half explicitly. Apply completion appears in
`#affo-quick-pick-message` as `Applied …`; it does not replace the favorite
button's label. Also verify the stored target and the resulting article font.

Record whether interaction used physical taps, native WebDriver clicks, or DOM
events, and whether reload used the browser menu or WebDriver. Separate a first
font change from repeated applications of the same font and from alternating
fonts. A first sample after navigation only establishes that the font was ready
by that sample, not its exact visible swap time.

For Deep View issue #2, explicitly seed and report
`affoBlockJavascriptDomains: []` when investigating behavior with site JavaScript
allowed; the default blocks `thedeepview.com`. Changing test storage does not
change the source default. Compare reload scroll displacement with AFFO
uninstalled, using the same page and reload method, before attributing it to the
extension. An unreproduced intermittent failure is not proof of a fix.

## Earlier Note10 popup observations and inspection examples

To drive/inspect that popup tab with geckodriver, pin the add-on UUID to make extension origins and blob URLs deterministic, then trigger the real page flow and switch to its new window handle. Do not depend on direct WebDriver navigation to `moz-extension://`; the ordinary session on the tested build could reject it with `Navigation to ... is not allowed in this context`.

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

Fenix may classify the resulting extension tab as a privileged browsing context. In that context, `executeScript` and `executeAsyncScript` can fail with `not supported for privileged browsing contexts`. Try native WebDriver element commands when supported:

```js
const { By, until } = require('selenium-webdriver');
const topDisplay = await driver.wait(until.elementLocated(By.id('top-font-display')), 15000);
const topFont = ((await topDisplay.getProperty('textContent')) || '').trim();
const previewStyle = await driver.findElement(By.id('top-font-text')).getDomAttribute('style');
const activeMode = await driver.findElement(By.css('[data-mode].active')).getDomAttribute('data-mode');
```

Use `getProperty('textContent')` for hidden popup controls. Selenium `getText()` returns an empty string for elements hidden by the current panel layout. Prefer `getDomAttribute(...)` for literal attributes and `getProperty(...)` for DOM properties; avoid helpers that fall back to injected JavaScript in the privileged tab.

On Note10 Nightly 158.0a1 (September 2026), even `findElement`/`findElements` in a popup tab could fail with `The command does not support browsing contexts in privileged scope`. If element commands are rejected too, use fresh ADB UI nodes/screenshots for visible controls or an available RDP extension target; do not keep retrying the same unsupported WebDriver path. See [native interaction and profiling](android-native-profiling.md).

**Note10 measurement gotchas (learned the hard way):**

- **A screenshot is authoritative, `getBoundingClientRect` is NOT.** Rect math caps at `innerHeight`, so it CANNOT see whitespace *below* the popup — a too-short body reads `gripsBottom === innerHeight` (gap 0) while a device screenshot clearly shows a gap. Always confirm popup fill/anchoring with the separate ADB screencap and pull commands.
- **The "extension added" banner is a temporary-install artifact.** Every geckodriver/web-ext run shows it (fresh temporary add-on); it adds dev-only bottom chrome and dismissing it doesn't always reclaim the space. A permanent (AMO) install has no banner. Don't chase whitespace that's really this banner.
- **geckodriver resets the Nightly profile each run** → address bar returns to the top; you canNOT reproduce a user's bottom-toolbar or other profile settings this way. `web-ext run` uses the real profile (so newly-added files like `popup-context.js` need a full `web-ext run` restart, not a hot-reload).
- **Viewport units misreport in the extension tab:** `dvh`/`svh`/`innerHeight`/`fixed;bottom:0` all = the area above the system nav (~634 on Note10); `lvh`/`vh`/`outerH` = the full window (~690). The popup body uses `calc(100dvh + env(safe-area-inset-bottom))` to fill edge-to-edge. `@media(pointer:fine)` is unreliable — the S-Pen trips it.
- **Device asleep → `Failed to decode response from marionette` or stalled navigation.** Follow the Note10 [whole-session keep-awake procedure](/Users/mike/.agents/skills/android-use/SKILL.md#keep-note10-awake-during-testing); the harness preflight wake alone is insufficient.
- **Don't leave a geckodriver session idling** (e.g. a long `driver.sleep` to "leave it open") — it looks like a hang and the user may kill it.

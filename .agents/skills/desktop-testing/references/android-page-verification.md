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

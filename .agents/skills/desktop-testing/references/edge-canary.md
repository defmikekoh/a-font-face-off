# Edge Canary Android testing

Use this reference for AFFO work in Edge Canary on Android: installing or
updating the local CRX, inspecting pages or the native action popup with CDP,
and verifying Edge-specific mobile layout or extension behavior.

## Authorized disposable target

The user explicitly authorizes disposable AFFO testing on this exact pair:

```text
Device:  RF8M81WSL1V (Samsung Galaxy Note10)
Package: com.microsoft.emmx.canary (Edge Canary)
```

This includes clearing Edge Canary app/profile data, force-stop and relaunch,
installing, updating, reloading, or removing local AFFO builds, changing the
Canary developer settings needed for extension testing, and driving the app
with ADB. No additional reset confirmation is needed for this pair. The
authorization does not cover Edge stable, another package, another device, or
another Android user/work profile. Do not sign this disposable profile into
browser Sync.

Prefer preserving the current session for ordinary iteration. Clear the
profile only when clean-install or clean-state behavior matters; a reset loses
tabs, settings, installed extensions, and local browser data.

Use the literal serial in every ADB command and keep one ADB operation per tool
call, as described in the main skill's Note10 ADB guidance.

Record the installed browser version at the start of a run:

```bash
adb -s RF8M81WSL1V shell dumpsys package com.microsoft.emmx.canary
```

## Build and install

Build the shared Chromium MV3 source and native-packed CRX:

```bash
npm run build:chromium-crx
```

Current outputs are:

- Generated source: `ztemp/chromium-mv3-src/`
- Native-packed CRX: `web-ext-artifacts/a-font-face-off-chromium-mv3.crx`
- Source ZIP: `ztemp/chromium-mv3.zip`
- Stable local key: `ztemp/chromium-mv3-key.pem`
- Extension ID from that key: `eldhkghblpdfffeahhmkbmcioegpapao`

Reuse the stable key. A different key produces a different extension ID and may
install a parallel AFFO copy instead of updating the existing one. Treat the
pack command's reported ID as authoritative if the key is ever replaced.

Push a rebuilt CRX to Downloads:

```bash
adb -s RF8M81WSL1V push web-ext-artifacts/a-font-face-off-chromium-mv3.crx /sdcard/Download/a-font-face-off-chromium-mv3.crx
```

Enable developer options once, if needed: Edge Canary **Settings → About
Microsoft Edge**, then tap the version five times. Install or update through
**Settings → Developer options → Extension install by crx**, choose the CRX
from Downloads, and submit it. Use UIAutomator text/resource IDs instead of
assuming fixed tap coordinates; browser chrome, density, and scroll position
can move the controls.

A first install normally shows a permission prompt. A same-ID update may return
silently to the page and still succeed, so do not infer success or failure from
the missing prompt. Verify through **Edge menu → Extensions**, the AFFO popup,
or its CDP targets. Native-packed CRX files work; hand-written CRX3 packages
have been accepted by the picker and then ignored.

Avoid the Edge extension Details page if it hangs. Use the AFFO popup gear for
options, or the in-page toolbar/Quick Pick, when those paths cover the task.

## Attach CDP

Find Edge Canary's browser-process PID:

```bash
adb -s RF8M81WSL1V shell pidof com.microsoft.emmx.canary
```

The debugger socket is normally `@chrome_devtools_remote_<PID>`. Confirm it in
`adb -s RF8M81WSL1V shell cat /proc/net/unix` when attachment fails, then
forward a local port (9245 is the established project convention):

```bash
adb -s RF8M81WSL1V forward tcp:9245 localabstract:chrome_devtools_remote_8430
curl -s http://127.0.0.1:9245/json
```

Replace the example PID `8430` with the current value from `pidof`.

Force-stop, profile reset, or browser restart can change the PID and socket;
recreate the forward afterward. Page and popup target IDs also become stale
after reload or CRX update, so query `/json` again rather than reusing them.

The native AFFO action popup appears as a temporary `page` target whose URL is
`chrome-extension://<AFFO_ID>/popup.html`. It exists only while the popup is
open. Open **Edge menu → Extensions → A Font Face-off**, immediately query
`/json`, and use its `webSocketDebuggerUrl`. The service-worker target may not
exist until an extension action wakes it.

For quick evaluation, reuse `ztemp/cdp-eval.js` when it is present, or create an
equivalent temporary WebSocket CDP evaluator under `ztemp/`:

```bash
node ztemp/cdp-eval.js \
  ws://127.0.0.1:9245/devtools/page/ACTUAL_POPUP_TARGET_ID \
  'JSON.stringify({innerHeight, classes: document.documentElement.className})'
```

Ignored `ztemp/` evaluators are session aids, not maintained skill APIs. For
repeatable shared Chromium runtime checks, use the project runner:

```bash
node scripts/test-android-chromium.js \
  --endpoint http://127.0.0.1:9245 \
  --extension-id eldhkghblpdfffeahhmkbmcioegpapao \
  --out ztemp/edge-canary-chromium-test.json
```

That runner exercises an extension tab and shared Chromium behavior; it does
not replace opening and visually checking Edge's native Extensions-menu popup.

Drive popup modes semantically through CDP when repeated physical taps would
close or obscure the panel:

```js
document.querySelector('[data-mode="body-contact"]').click();
document.querySelector('[data-mode="faceoff"]').click();
document.querySelector('[data-mode="third-man-in"]').click();
```

On Android Edge, `popup-context.js` should add `affo-mobile`,
`affo-popup-panel`, and `affo-edge-panel` to `<html>`. If those classes are
missing, inspect the UA and panel-vs-tab detection before changing layout CSS.

## Native-popup layout verification

Use both CDP geometry and an ADB screenshot. CDP identifies the responsible
box or scroll constraint; the screenshot proves the visible bottom-sheet result
including browser chrome, rounded-sheet margins, and the Android navigation
area.

For Body Contact, Face-off, and Third Man In, record at least:

- `innerHeight` and the `<html>` and `<body>` rectangle heights
- `body.scrollHeight`
- `#preview-region` and `#panel-grips` rectangles
- each visible `.font-section` client height and scroll height

A correctly constrained popup has the root and body filling the viewport,
`body.scrollHeight` equal to the body height, and the bottom of `#panel-grips`
at the body/root bottom (allowing subpixel rounding). Long preview content
should scroll inside its individual `.font-section`; the whole body or rink
should not become the fallback scroller. Confirm visually that Body Contact and
Face-off do not leave unused space and that TMI's footer is not clipped.

Capture final visual evidence with separate ADB calls:

```bash
adb -s RF8M81WSL1V shell screencap -p /sdcard/affo-edge-current.png
adb -s RF8M81WSL1V pull /sdcard/affo-edge-current.png ztemp/affo-edge-current.png
```

For popup CSS changes, rebuild and reinstall the CRX before final verification.
A temporary CDP style or DOM edit is useful for testing a hypothesis but is not
evidence that the packaged result contains the fix.

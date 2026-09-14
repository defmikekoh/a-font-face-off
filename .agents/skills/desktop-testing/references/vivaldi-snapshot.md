# Vivaldi Snapshot on Note10

## Approved scope

The disposable target is Samsung Galaxy Note10 `RF8M81WSL1V`, package `com.vivaldi.browser.snapshot`. User authorization includes app/profile resets, force-stop/relaunch, and local extension install/reload for AFFO testing. Do not reset stable `com.vivaldi.browser`, another device, or another Android user/work profile under this authorization. Keep Snapshot signed out of browser Sync. Reset for clean-install tests; retain the session for iterative debugging.

Do not use the Firefox geckodriver harness for Vivaldi. Use ADB for native UI and CDP for page/extension code. Verify visible popup layout with a screenshot as well as DOM measurements.

## Install the shared build

Verified with Snapshot 8.2.4147.50 on Android 12. Check the installed version each session with `adb -s RF8M81WSL1V shell dumpsys package com.vivaldi.browser.snapshot`.

1. Run `npm run build:chromium` in AFFO.
2. For a clean-install case, reset only the approved Snapshot package:

   ```bash
   adb -s RF8M81WSL1V shell pm clear com.vivaldi.browser.snapshot
   ```

3. Copy the build contents (the `/.` matters when updating an existing directory):

   ```bash
   adb -s RF8M81WSL1V push ztemp/edge-mv3-src/. /sdcard/Download/affo-mv3
   adb -s RF8M81WSL1V shell monkey -p com.vivaldi.browser.snapshot -c android.intent.category.LAUNCHER 1
   ```

4. Complete observed onboarding: Continue → Quick Start → Continue → choose blocking preference → Start Browsing. Use No Blocking when isolating AFFO from Vivaldi's built-in blocker.
5. Extensions menu → Manage extensions → Developer mode → Load unpacked.
6. In Android's folder picker, open internal storage → Download → affo-mv3 → Use this folder → Allow. The Download root itself cannot be selected, but its affo-mv3 subfolder can.
7. Confirm AFFO is enabled and has no manifest errors. Do not infer installation success from the picker closing.

No Chrome Web Store publication or CRX signing is required for this path. [Vivaldi's installation instructions](https://help.vivaldi.com/android/android-tools/extensions-on-android/).

## Identify the correct debugging socket

Run each ADB command separately, with the literal serial:

```bash
adb -s RF8M81WSL1V shell pidof com.vivaldi.browser.snapshot
adb -s RF8M81WSL1V shell cat /proc/net/unix
```

Match the actual Snapshot PID to `chrome_devtools_remote_<PID>`. Other browsers may expose `chrome_devtools_remote` or another PID socket. Do not guess which one belongs to Snapshot. Forward the observed literal socket to a dedicated local port, for example:

```bash
adb -s RF8M81WSL1V forward tcp:9235 localabstract:chrome_devtools_remote_7017
curl -s http://127.0.0.1:9235/json
```

`7017` is a past observation, not a fixed PID. Rediscover it after relaunching Snapshot. Localhost HTTP and WebSocket connections may require execution outside the Codex sandbox.

## Runtime inspection and regression script

Android's `/json` returns numeric page IDs as well as IDs created by CDP. Use the returned `webSocketDebuggerUrl`; do not substitute the distinct Target-domain target ID into a guessed URL. The extension service worker appears while awake, and may be absent while suspended. Opening an extension page or sending an extension message wakes it.

From `vivaldi://extensions`, `chrome.developerPrivate.getExtensionsInfo` can report extension IDs, enabled state, views, runtime errors, and manifest errors. This is a privileged browser page, not an API available inside AFFO.

For the repeatable runtime checks, open `https://example.com/`, `vivaldi://extensions`, and the installed extension's `popup.html?domain=example.com&sourceTabId=<actual-browser-tab-id>`. Obtain the browser tab ID from `browser.tabs.query` in an extension context; it is different from the CDP target ID. A popup extension tab exercises shared popup logic; separately test the native Extensions-menu popup with ADB.

```bash
node scripts/test-android-chromium.js --endpoint http://127.0.0.1:9235 --extension-id ACTUAL_INSTALLED_EXTENSION_ID --out ztemp/android-chromium-test.json
```

The script attaches to these existing test pages and records assertions. It does not select a device, reset data, or install the extension. Keep its output in `ztemp/`. Do not run it against a user's regular browser profile.

## Updating a loaded extension

Rebuild and push the folder contents. Reload AFFO through its Extensions page (or `chrome.developerPrivate.reload` in that page), reopen extension views, then reload the test web page after the extension has finished starting. Reloading the extension invalidates old extension contexts and may close popup tabs. Reusing the page's old content script can test stale code; check the new content marker and APIs before asserting behavior.

The unpacked path is a SAF folder (`/SAF/com.android.externalstorage.documents/tree/...`). Changes pushed into the authorized folder are picked up on extension reload. Inspect current packaged code when verifying an update; a copied directory's existence alone does not prove which version is running.

## Verified results and pitfalls

The September 2026 Note10 run verified remote Lora loading, TMI's rendered Lora/Inter/Roboto Mono families with aggressive mode off, WhatFont activation, the Chromium DNR rule, USER-origin CSS insertion/removal, and exact Sroulette CSS removal after stopping/restarting the extension service worker. `ServiceWorker.enable` supplies the version ID; detach the worker debugger before `ServiceWorker.stopWorker`, then wake it through an extension message.

The native Extensions-menu popup appears in `/json` as `type: "other"`; ordinary popup tabs appear as `type: "page"`. Verify the actual native target, not a stale popup tab. Vivaldi's native popup sizes to content and requires AFFO's `affo-popup-panel` fixed-height rule; `100dvh` alone initially collapsed it to about 201 CSS pixels. Explicit popup tabs and Firefox Android retain viewport sizing.

Chromium serializes extension messages as JSON: native ArrayBuffers become empty objects. AFFO now base64-encodes binary `affoFetch` replies at the message boundary, preserving native ArrayBuffers in IndexedDB. A font downloaded by the worker is not proof it arrived intact; assert both computed font-family and FontFace load success.

The Extensions page retains old error records after reload. Record the initial IDs/occurrence counts and fail for new or incremented entries. Do not erase prior failures to claim a clean run. Reports distinguish pre-existing records from errors produced by the current test.

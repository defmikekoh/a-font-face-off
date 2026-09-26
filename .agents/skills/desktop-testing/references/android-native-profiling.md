# Android native reload reproduction and Firefox profiling

Use this reference for intermittent Firefox Android reload stalls where the user's browser UI path or sampling stacks matter. Verified on Note10 Nightly 158.0a1 in September 2026. The parent skill's device authorization and keep-awake rules apply.

## Preserve the interaction being tested

- Establish the user's reload control: menu **Refresh**, pull-to-refresh, or another control. Selenium `driver.navigate().refresh()` and JavaScript `location.reload()` are comparisons, not proof of the same native path. For a menu reproduction, tap freshly located **More options → Refresh** controls through ADB.
- Preserve popup entry, tab closure, and reopening order. Use the native tab tray to close the popup and article when that is the reported flow. Android Back can return to the home screen while leaving a popup tab open; verify the tab count/list. Distinguish onboarding, extra tabs, and setup retries from the measured sequence.
- In custom Selenium launchers, include the documented `automationtest=true` Android intent extras at initial session creation. Adding them to an already-running activity did not dismiss an existing onboarding screen. See [fresh-start verification](android-page-verification.md).
- `adb shell input text` dropped characters in Nightly's address bar during this investigation. If observed, type smaller chunks or individual characters with a short delay (about 120 ms worked here), then verify the full field before submitting. Use an exact history suggestion when available.
- UIAutomator can omit visible web controls such as a cookie dialog. Use a fresh screenshot to locate them when necessary. A dump reporting `null root node` is not fresh evidence: do not pull and act on an old remote XML file left by a previous successful dump.
- Separate `NS_ERROR_OFFLINE` or confirmed device connectivity failures from an extension hang. Wait for connection recovery before counting reloads. Record cookie-consent state and other site changes across runs.

## Prove that the font settled

Check the intended visible article, loaded faces for the selected font, and computed family/markers on representative article paragraphs. `document.fonts.check()` alone can return true when no matching face exists. `document.readyState === 'complete'` and the navigation load event do not prove the font swap finished.

Report an observation at 12 seconds as “settled when checked at 12 seconds,” not “took 12 seconds.” Record page-relative time, URL, visibility, font-face status, paragraph styles, toolbar presence, and navigation timing together. Bound diagnostic reads; stop repetitive reads when a stalled document no longer answers. Preserve the failure before reloading, restarting, or changing networking.

## Enable and capture a Firefox sampling profile

Existing ADB forwards do not prove a live debugger socket. Check the current socket/connection first. In the verified fresh Nightly session, setting `devtools.debugger.remote-enabled` in Selenium alone did not expose RDP; enabling **Settings → Remote debugging via USB** did. Use fresh actor IDs from the active connection.

Prefer Firefox DevTools' profiler when available. For a direct RDP client, the verified protocol was:

1. Root `getRoot` exposes `perfActor`; query `getSupportedFeatures` and `isActive`.
2. `startProfiler` accepts `entries`, `interval` in milliseconds, `features`, `threads`, and `duration` in seconds. A useful bounded starting point was 1–2 million entries, 2–5 ms sampling, `['js', 'stackwalk']`, and `['GeckoMain']`. Add `java` and `AndroidUI` when native Android UI stacks are needed. Avoid collecting every thread or screenshots unless they answer the question; `cpuallthreads` greatly increased data volume in the initial run.
3. Confirm start success, perform the native action, and capture soon after the success or stall. Save separate short profiles around attempts. If profiling may alter timing, include an explicitly unprofiled comparison.
4. `startCaptureAndStopProfiler` returns a capture handle, not the profile. Pass it to `getPreviouslyCapturedProfileDataBulk`. The response uses RDP bulk framing (`bulk <actor> <type> <byteLength>:` plus raw bytes), not ordinary JSON framing. Save the complete gzip payload as a local `.json.gz` file and verify it decompresses/parses before treating capture as successful.
5. Check `isActive` and stop recording during cleanup. An interrupted or partially received bulk transfer can block that connection's parser; bound capture, preserve byte counts/errors, and reconnect for status/another capture rather than treating it as a page hang. One transfer stalled partway while the page remained responsive; a fresh connection later captured successfully.

Keep captured profiles local unless publication is requested. Temporary clients in `ztemp/` are exploratory artifacts, not maintained skill APIs. Consult Mozilla's [perf protocol specification](https://github.com/mozilla-firefox/firefox/blob/main/devtools/shared/specs/perf.js) and [actor implementation](https://github.com/mozilla-firefox/firefox/blob/main/devtools/server/actors/perf.js) when the target version differs.

## Interpret the evidence narrowly

A profile of a successful reload cannot diagnose a hang that did not occur. In sample analysis, count a stack containing an AFFO frame once; summing inclusive function counts double-counts callers. A fraction of all sampled stacks, including idle stacks, is not a CPU-time percentage and does not capture every asynchronous native consequence.

A missing toolbar is a correlated symptom until its initialization is inspected. Repeated `UpdateBackNavigationStateAction` / `UpdateForwardNavigationStateAction` log messages also occur during successful navigation; their names alone do not prove a history loop. Compare their rate with a successful run and seek a stalled stack before assigning a cause.

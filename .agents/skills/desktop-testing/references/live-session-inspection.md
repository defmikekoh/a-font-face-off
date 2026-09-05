# Live Android Firefox inspection and Apply timing

Use this workflow for an intermittent failure in an existing Nightly session, an unexpectedly installed AFFO copy, or slow Apply behavior. Prefer the seeded WebDriver harness when the test requires a fresh reproducible profile. The device/package authorization boundary remains in the parent skill.

## Establish the actual session

- Check current repository status and any running `web-ext`/geckodriver process. The user may commit, rebuild, or restart tooling between messages; do not carry forward an assumption that the phone still has the old build.
- Read `adb -s RF8M81WSL1V forward --list` and reuse the matching Nightly debugger endpoint. Ports and actor IDs are session-specific. Do not start another browser/test session just to inspect the current one.
- ADB transport health is separate from device awake state, foreground UI, and internet health. Wake/dismiss a non-secure keyguard within existing authorization, then inspect the current UI before navigating. Refresh the UI tree after a delay before using tap coordinates.
- On this Note10, the user has observed broken internet after extended sleep, recovered by toggling Wi-Fi. Treat that as a device-specific possibility, not a diagnosis for every slow Apply. Check the actual font request/status on the phone. A successful Mac `curl` does not prove phone connectivity, and an error face alone does not prove CSP blocking. Preserve failing state before any network reset.
- `listAddons` can distinguish `temporarilyInstalled` and the installed source URL. Both `web-ext` and `driver.installAddon(xpi, true)` can install temporary copies; do not infer who installed one without evidence. Build output timestamps do not identify the active extension.

## Identify the popup and source page

Android has both a native full-viewport browser-action surface (`popup.html`) and the toolbar-created popup tab (`popup.html?domain=…&sourceTabId=…`). A visible native popup can be absent from RDP `listTabs`, while `browser.extension.getViews()` reveals it from another real AFFO context. A native surface and a popup tab can coexist. Reproduce the user's entry path; label a different surface as a comparison.

From a real extension page, inspect `browser.tabs.query({})`, `browser.extension.getViews()`, the popup URL/sourceTabId, and the visible mode. Use ADB UI state for the foreground surface; do not decide solely from RDP's `selected` flag. Inspect the source page's `document.visibilityState` and `scrollY` through the explicit source tab ID. Keep page inspection and CSS injection aimed at that tab, not the currently active extension tab.

Verify updated popup code and page code separately. Fetching `browser.runtime.getURL('content.js')` proves the packaged resource changed; it does not prove an already-open page re-executed it. Reload/reopen the relevant contexts and verify the changed runtime behavior before calling an observation a regression or a fix. Functions inside content.js's IIFE are not globals: `typeof somePrivateHelper === 'undefined'` is not evidence that an old version is loaded.

## Direct Firefox RDP details

Use a working client or Firefox DevTools. The exploratory scripts under `ztemp/` are temporary task artifacts, not a maintained skill API.

- Use fresh actor IDs from `listTabs`/`getTarget` or the add-on watcher. The first watcher target can be `resource://devtools-webextension-fallback/...`; it has no `browser` API. Select an actual extension document before reading storage or calling extension APIs.
- `evaluateJSAsync` has an initial result ID and a later `evaluationResult`. Correlate both and handle an early-arriving result. Do not pair arbitrary notification packets with outstanding requests.
- Raw protocol evaluation does not automatically perform DevTools UI transformations for top-level `await`. Use an async IIFE and inspect its settled result, or store a bounded diagnostic result in the same window and poll it. A Promise grip or “started” message is not a measurement.
- When using a result record, set `finished` only in `finally`, record errors, and verify the same document still exists. Bound each wait; after repeated timeouts, inspect device/context state rather than retrying the same expression indefinitely.
- For page console evidence, `startListeners` with `ConsoleAPI` and `PageError` enables live messages. An empty `getCachedMessages`/logcat result does not establish that no error occurred. Attach before the measured action when cached messages are unavailable.
- Save compact decoded results to `ztemp/` before closing a diagnostic view or reloading. Restore any temporarily wrapped functions in `finally`; do not override console methods. Close only the diagnostic tabs created for the test and restore the user's starting configuration where changed.

## Measure Apply before explaining it

Time one complete Apply and its stages on the same source page and popup surface. For TMI, useful functions are:

| Stage | Functions / evidence |
| --- | --- |
| Font readiness | `prepareFontSwapInTargetTab`, font face status, actual request errors |
| Persistence | `saveBatchApplyStateForOrigin` |
| Classification | `runElementWalkerInTargetTab`, content completion registry and walker logs |
| CSS / layout | `insertCSSInTargetTab`, `restoreFontSwapInTargetTab` |
| UI completion | `handleApply`, `updateAllThirdManInButtons`, actual button state |

Separate initial/cold loading from repeated A → B → A → B swaps. Record font configuration, URL, source visibility, scroll position, build evidence, timings, errors, and rendered font/markers. A programmatic `handleApply()` timing excludes the click handler's final debounce; label it accordingly. Test the real click path if the claim concerns the entire visible button interaction.

The source page can suspend timers or animation frames while Android extension UI is open. In the Andika/Charis investigation, stage timing identified the TMI walker wait rather than a download delay. Unit tests for this behavior should hold page timers/frames stopped; ordinary immediate-callback mocks miss it. Do not add a timeout/fallback or attribute the delay to networking merely because the duration resembles one.

## Distinguish completion from timeout

`runElementWalkerInTargetTab()` historically resolves `{ done: true, count: 0 }` on its polling timeout or an injection error. That return value alone cannot prove a scan completed. Confirm the content script's `window.__affoWalkerDone[type]`, absence of timeout/injection errors, and a completed walker log or expected marker state. Likewise, `handleApply()` catches errors; a resolved promise alone is not proof that the requested font applied.

Test a previously unclassified type separately from an already-completed type. If a scan spans multiple attempts, report the cumulative time and each timeout; a quick final attempt is not a fast fresh scan. The earlier investigation verified repeated font swaps around half a second, but a separate initial scan spanned multiple attempts. Do not generalize the repeated-swap result to every initial apply.

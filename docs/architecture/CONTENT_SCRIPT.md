# Content Script Architecture (content.js)

## SPA Hook Infrastructure

SPA navigation hooks (`history.pushState`/`replaceState` wrappers, `popstate` listener) are installed once globally via `installSpaHooks()` with an idempotent guard (`spaHooksInstalled` flag). All code paths register handlers via `registerSpaHandler(fn)` which deduplicates by reference. Focus/visibility listeners use the same pattern via `registerFocusHandler(fn)`. This prevents unbounded listener stacking when fonts are reapplied.

### Module-Level State

```javascript
var spaHooksInstalled = false;       // Guard: pushState/replaceState/popstate hooks installed once
var spaNavigationHandlers = [];      // Array of callbacks invoked on SPA navigation (deduped by reference)
var focusHooksInstalled = false;     // Guard: focus/visibilitychange listeners installed once
var focusHandlers = [];              // Array of callbacks invoked on focus/visibility change
```

- **`registerSpaHandler(fn)`** — Calls `installSpaHooks()`, then adds `fn` if not already registered (indexOf check)
- **`installSpaHooks()`** — Wraps `history.pushState`/`replaceState` and adds `popstate` listener exactly once. All wrappers dispatch to `spaNavigationHandlers` array after 100ms delay.
- **`registerFocusHandler(fn)`** — Adds `fn` to `focusHandlers` if not already registered; installs `focus`/`visibilitychange` listeners once

## Storage Change Listener

The `affoApplyMap` storage change listener diffs `oldValue[origin]` vs `newValue[origin]` using `JSON.stringify` comparison. Only tears down and reapplies styles when the current origin's config actually changed, avoiding unnecessary work on tabs showing unrelated domains.

## Unified Element Walker

`runElementWalkerAll(fontTypes)` classifies all requested TMI types (serif/sans/mono) in a single DOM pass. Returns a `Promise<markedCounts>` that resolves when the chunked walk finishes (or `Promise.resolve({})` when all types are already completed).

### Module-Level State

```javascript
var elementWalkerCompleted = {};           // fontType → boolean (prevents redundant scans)
var elementWalkerRechecksScheduled = {};   // fontType → boolean (prevents double-scheduling rechecks)
var elementWalkerInFlight = {};            // fontType → Promise (in-flight coalescing)
var lastWalkElementCount = 0;              // element count from last walk (used to cap rechecks)
var LARGE_PAGE_ELEMENT_THRESHOLD = 5000;   // skip timed rechecks above this
var WALKER_CHUNK_SIZE = 2000;              // elements per chunk before yielding to main thread
```

### Performance Optimizations
- Single `getComputedStyle` call per element — used for both visibility check (display/visibility) and font type detection (fontFamily). The computed style is passed as a parameter to `getElementFontType`.
- Chunked processing: walks 2000 elements at a time, yields via `setTimeout(0)` between chunks
- `knownSerifFonts`, `knownSansFonts`, `preservedFonts` are `Set` objects (O(1) `.has()` lookup instead of O(n) `indexOf`)
- Large page recheck cap: pages with >5,000 elements skip the 700ms/1600ms timed rechecks (only `document.fonts.ready` recheck runs)

### Key Functions
- **`getElementFontType(element, computedStyle)`** — Module-scope classification function. Returns `'serif'`, `'sans'`, `'mono'`, or `null`. Receives pre-computed style from the walker loop. Reads `preservedFonts`, `knownSerifFonts`, `knownSansFonts` from module scope.
- **`runElementWalkerAll(fontTypes)`** — Accepts array of font types (e.g. `['serif', 'sans', 'mono']`). In-flight coalescing: if all requested types already have an in-flight promise in `elementWalkerInFlight`, returns the existing promise instead of starting a concurrent walk.
- **`runElementWalker(fontType)`** — Thin wrapper: `return runElementWalkerAll([fontType])`.
- **`scheduleElementWalkerRechecks(fontTypes)`** — Accepts array. Filters to unscheduled types. On small pages (<5,000 elements): schedules rechecks at 700ms, 1600ms, and `document.fonts.ready`. On large pages: only `document.fonts.ready` recheck.

## Element Exclusions and Guards

Both Body Contact and TMI walkers exclude elements that should not have their font replaced:
- **Shared exclusions**: headings (h1-h6), code/pre/kbd, nav, form elements, ARIA roles (navigation, button, tab, toolbar, menu, alert, status, log), syntax highlighting classes, small-caps, metadata/bylines, widget/ad patterns, WhatFont compatibility
- **Container exclusions (ancestor-aware)**: Elements inside `figcaption`, `button`, `.post-header`, `[role="dialog"]`, or `.comments-page` (Substack comments) are excluded via `element.closest()` in the TMI walker. Body Contact CSS uses `:not(button):not(button *)`, `:not([class*="byline"])`, `:not([class*="subtitle"])`, `:not([role="dialog"]):not([role="dialog"] *)`, `:not(.comments-page):not(.comments-page *)` selectors
- **Guard mechanism**: Elements (or their ancestors) with class `.no-affo` or attribute `data-affo-guard` are skipped entirely by both walkers and by all CSS selectors (Body, Body Contact, TMI). The `data-affo-guard` attribute is used on the quick pick overlay (`left-toolbar.js`) to fully isolate it from the extension's own font overrides. CSS selectors include `:not([data-affo-guard]):not([data-affo-guard] *)` to exclude guarded containers and their descendants
- **Preserved fonts** (`affoPreservedFonts`): Icon font families (Font Awesome, Material Icons, bootstrap-icons, etc.) are never replaced. Configurable via Options page; checked against computed `font-family` stack
- **Implementation difference**: Body Contact uses CSS `:not()` selectors; TMI uses JS runtime checks in the element walker. Kept separate intentionally due to fundamentally different mechanisms

## Aggressive Mode (`affoAggressiveDomains`)

By default, CSS declarations are applied WITHOUT `!important` (relying on `cssOrigin: 'user'` for priority). Domains listed in `affoAggressiveDomains` get `!important` on all font declarations for sites with very strong style rules. Configurable via Options page textarea (one domain per line, defaults to empty). On page reload, `affoAggressiveDomains` is loaded in the same `storage.local.get()` call as `affoApplyMap` to avoid a race condition where aggressive mode CSS would be generated without `!important`. CSS is injected immediately on reapply (before font file loads) to prevent flash of original fonts; the font file loads in parallel and the browser swaps it in via `font-display: swap`.

## Inline-Apply Infrastructure

Shared infrastructure for domains requiring inline style application (x.com, etc.). A single MutationObserver and a single polling interval serve all active font types.

### Module-Level State

```javascript
var inlineConfigs = {};         // fontType → { cssPropsObject, inlineEffectiveWeight, expiresAt }
var sharedInlineObserver = null; // single MutationObserver for all inline types
var sharedInlineTimers = [];     // shared timer IDs (monitoring intervals, switch/stop timers)
```

### Key Functions
- **`ensureSharedInlineObserver()`** — Creates the shared MutationObserver on first call. Callback loops `addedNodes` once, then iterates `Object.keys(inlineConfigs)` to match selectors and apply per-type protection.
- **`ensureSharedInlinePolling()`** — Creates shared polling timers (frequency ramp: fast → slow → stop) on first call. Each tick iterates all active types.
- **`reapplyAllInlineStyles()`** — Shared SPA/focus handler that re-applies inline styles for all active types.
- **`checkExpiredInlineTypes()`** — Removes types whose `expiresAt` has passed from `inlineConfigs`. Calls `cleanupSharedInlineInfra()` when no types remain.
- **`cleanupSharedInlineInfra()`** — Disconnects the shared observer and clears all shared timers.

### Selector Routing
- **`BODY_EXCLUDE`** — Constant: `:not(h1):not(h2)...:not(.no-affo):not([data-affo-guard]):not([data-affo-guard] *)`. The base exclusion chain for body-mode selectors.
- **`isXCom`** — Boolean: whether the current origin is x.com or twitter.com. Controls hybrid selector routing.
- **`getAffoSelector(fontType)`** — Central dispatch: Body mode uses `BODY_EXCLUDE`; TMI mode uses `getHybridSelector()` on x.com or `[data-affo-font-type]` elsewhere.
- **`getHybridSelector(fontType)`** — Returns broad, x.com-specific CSS selectors matching elements by semantic structure (`data-testid`, `div[role]`, tweet patterns) rather than walker-placed marks. See `XCOM.md` for details.
- **`HYBRID_GUARD`** — Constant: `:not([data-affo-guard]):not([data-affo-guard] *)`. Appended to every hybrid selector term via `addHybridGuard(sel)`.

### Style Application
- **`applyAffoProtection(el, propsObj)`** — Applies all CSS properties from `propsObj` to an element with `!important`, plus `--affo-` custom properties and `data-affo-` attributes for resilience.
- **`applyTmiProtection(el, propsObj, effectiveWeight)`** — Wraps `applyAffoProtection` with bold detection. Checks tag name, `data-affo-was-bold` marker, or computed `fontWeight >= 700` before applying, then restores weight to 700 for bold elements.

## Bold Override Strategy

Bold elements (`<strong>`, `<b>`, or elements with computed `font-weight >= 700`) only need `font-weight: 700 !important`. Registered axes (`font-stretch`, `font-style`) inherit from the parent element naturally via CSS cascade. Custom axes are included in the bold rule's `font-variation-settings` if any exist. In the inline-apply path, bold elements are marked with `data-affo-was-bold="true"` so subsequent reapply cycles can detect them without relying on computed style.

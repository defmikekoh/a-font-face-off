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

For explicit Sroulette domain entries, `affoApplyMap[origin].sroulette` is materialized in memory before reapply, including on Substack. `content-sroulette-runtime.js` owns the materialization and tracked-CSS message helpers; `content.js` decides when to resolve/reapply during page load, storage changes, SPA hooks, and focus hooks. Each explicit target (`body`, `serif`, `sans`, or `mono`) samples a fresh favorite from the configured Substack Roulette serif/sans pool; the sampled font is not written back to storage, so page load and pool/favorite changes can reroll without sync churn. For TMI `serif`/`sans`/`mono` materializations, content.js asks background.js to inject the generated Sroulette CSS with tracked `scripting.insertCSS` calls at author and user origins; background.js tracks that per tab so replaced or cleared Sroulette targets can remove the exact previous CSS. Native Substack Roulette is a separate automatic path used only when the domain has no saved font entry; it applies serif/sans plus its beige and text-dimming enhancements.

## Unified Element Walker

`runElementWalkerAll(fontTypes)` classifies all requested TMI types (serif/sans/mono) in a single DOM pass. Returns a `Promise<markedCounts>` that resolves when the chunked walk finishes (or `Promise.resolve({})` when all types are already completed).

### Module-Level State

```javascript
var elementWalkerCompleted = {};           // fontType → boolean (prevents redundant scans)
var elementWalkerRechecksScheduled = {};   // fontType → boolean (prevents double-scheduling rechecks)
var elementWalkerInFlight = {};            // fontType → Promise (in-flight coalescing)
var lastWalkElementCount = 0;              // element count from last walk (used to cap rechecks)
var LARGE_PAGE_ELEMENT_THRESHOLD = 5000;   // skip timed rechecks above this
var WALKER_YIELD_BUDGET_MS = 8;            // wall-clock work budget before yielding
var pendingElementWalkerChunks = {};     // fontType → one-shot continuation for a yielded pass
```

### Performance Optimizations
- Single `getComputedStyle` call per candidate element — used for visibility, font classification, and fixed-position UI detection. Ancestor position checks use a per-walk `WeakMap`, so a shared ancestor is measured at most once per walker pass.
- Time-budgeted processing: yields via `setTimeout(0)` after roughly 8ms instead of allowing a fixed multi-thousand-element chunk to monopolize the main thread
- Dynamic subtree scans use the same 8ms budget. `dynamicMutationJob` serializes batches, deduplicates nested roots, and classifies the union of active inline/CSS/scaling TMI types once. Inline protection and size scaling wait for classification; CSS-only TMI takes effect as markers appear. Each continuation checks active types and live roots, resets ancestor-style caches, and restarts traversal if the page removes or moves its cursor into an excluded subtree. Disabling the last mutation consumer cancels the pending continuation and queued roots. These mutation scans use page timers independently of the popup's initial-scan continuation bridge.
- Popup Apply reuses completed/in-flight classification rather than invalidating it when only the replacement font changes. Navigation and existing reclassification triggers still clear completion when needed.
- While waiting for a required scan, popup polling dispatches `affo-continue-walker` through `executeScript`, advancing at most one pending 8ms chunk. Firefox Android can suspend source-tab timers while its extension UI is open. The continuation cancels its scheduled timer and runs only once, so returning to the page cannot replay consumed work. Ordinary page-driven scans continue through timers.
- `knownSerifFonts`, `knownSansFonts`, `preservedFonts` are `Set` objects (O(1) `.has()` lookup instead of O(n) `indexOf`)
- Recheck control: ordinary small pages get one 700ms safety pass; ChatGPT relies on scoped mutation marking; `document.fonts.ready` is registered only while `document.fonts.status === "loading"`, avoiding an immediate redundant pass when fonts are already ready
- ChatGPT walks start at `<main>` and only classify candidates inside `[data-message-author-role]`; sidebar history and the composer are outside the work scope
- ChatGPT's shared observer also watches `characterData` and added text nodes for active non-inline TMI types. Text arriving in an initially empty/short paragraph queues only its unmarked text-owning parent. Pending roots are deduplicated; ChatGPT flushes within a 250ms batch window instead of delaying until streaming stops. Once marked, later tokens do not queue another walk. Other domains retain child-list-only observation and trailing debounce.

### Key Functions
- **`getElementFontType(element, computedStyle)`** — Module-scope classification function. Returns `'serif'`, `'sans'`, `'mono'`, or `null`. Receives pre-computed style from the walker loop. Reads `preservedFonts`, `knownSerifFonts`, `knownSansFonts` from module scope.
- **`runElementWalkerAll(fontTypes)`** — Accepts array of font types (e.g. `['serif', 'sans', 'mono']`). In-flight coalescing: if all requested types already have an in-flight promise in `elementWalkerInFlight`, returns the existing promise instead of starting a concurrent walk.
- **`runElementWalker(fontType)`** — Thin wrapper: `return runElementWalkerAll([fontType])`.
- **`scheduleElementWalkerRechecks(fontTypes)`** — Accepts an array and filters to types not already scheduled. Ordinary small pages get one 700ms pass. ChatGPT skips timed passes because its live message mutations are handled incrementally. A font-ready pass is attached only when fonts are still loading.
- **`data-affo-original-font-type`** — Set when the walker first marks an element. Later rechecks prefer this original role over the current computed `font-family`, because the current computed family may be an AFFO replacement font. This prevents Google font loads from causing cross-type applications, such as a serif font applied to sans content, to remove their own markers.

## Element Exclusions and Guards

Both Body Contact and TMI walkers exclude elements that should not have their font replaced:
- **Shared exclusions**: heading subtrees (h1-h6 and descendants), code/pre/kbd, navigation/footer/aside/form subtrees, ARIA landmark subtrees, syntax highlighting classes, small-caps, metadata/bylines, widget/ad patterns, WhatFont compatibility. TMI's article-footer exception is described below; Body Contact continues to exclude all footer subtrees.
- **Text ownership requirement**: The TMI walker marks elements with direct text nodes, and also `p`/`li`/`blockquote` wrappers whose content is split only across simple inline text descendants (`span`, `a`, `em`, `strong`, `br`, etc.). Large structural wrappers remain unmarked so ancestor font markers do not leak onto excluded descendants like headings, code blocks, or UI controls.
- **Container exclusions (ancestor-aware)**: The full and mutation-scoped TMI walkers reject navigation, page-level footer, aside, form, button, ARIA landmark, guard, `.post-header`, Substack top-bar, interactive modal, and protected drop-cap roots before descending. A `footer` inside an `article` remains traversable because sites such as Marginal Revolution place their comment threads there; the footer container itself is not marked, while eligible prose descendants are classified normally. Fixed-position ancestry is determined from computed styles rather than class names, catching site overlays and banners that omit dialog semantics; results are cached for each pass. On Substack pages, styled `p.button-wrapper > a.button.primary > span` button links are also skipped. AFFO also excludes likely article decks/standfirsts in `article header` when the matching `p`/`div` carries deck-style hints such as `summary`, `subtitle`, `dek`, `deck`, `standfirst`, `subheadline`, or `excerpt`. When the current origin is in `affoIgnoreCommentsDomains`, AFFO also excludes `.comments-page` comment views.
- **Drop cap preservation**: Non-prose elements matching semantic drop-cap hints in `style` (`var(--drop-cap)` or `initial-letter`), exact `class` tokens, `data-drop-cap`, `data-dropcap`, or `data-testid` are excluded as containers. Semantic prose hosts (`p`, `li`, and `blockquote`) remain eligible so paragraph-level `dropcap` classes that style `::first-letter`—including New Yorker section openings—do not suppress AFFO for the entire paragraph. Dedicated decorative initials such as Guardian spans using `var(--drop-cap)` remain protected. A `data-drop-cap`/`data-dropcap` node with two or more direct prose siblings is treated as a structural story container rather than a protected glyph wrapper; single-paragraph and dedicated-glyph wrappers remain protected. Exact class-token matching avoids rejecting article wrappers with generated classes such as `dropCap-hash`.
- **TMI text sizing selectors**: Font family applies to all marked TMI elements. Font size, line height, and letter spacing use a narrower text selector that includes marked `p`, `span`, `a`, `em`, `i`, table cells, list items, plus marked `div` and `blockquote` containers. The `div`/`blockquote` cases matter because the walker can mark them when they directly own prose.
- **Percent font-size scaling**: `fontSizeScale` is applied by content.js, not as cascading `%` CSS. Body mode writes only text-owning elements, explicit headings/decks, and x.com tweet author clusters instead of structural containers whose inherited size could compound onto descendants. The content script records each target's original computed `font-size`, writes the scaled px value inline, and restores the prior inline value when scaling is removed. Initial/config/navigation/focus applies may query the full active scope. Mutation dispatch calls `applyFontSizeScaleInRoots()` so only new roots are queried and only changed values are written; existing scaled nodes are not restored and rewritten on every streamed addition. A late inline descendant already inheriting the same scaled px size from a marked ancestor is left to inherit rather than being scaled a second time.
- **ChatGPT scope**: On `chatgpt.com` and subdomains, Body Contact/Body selectors target `[data-message-author-role]` roots and eligible descendants rather than `body`; TMI starts from `<main>` and classifies only inside those message roots. The composer form and application navigation are excluded from both initial and mutation work.
- **Guard mechanism**: Elements (or their ancestors) with class `.no-affo` or attribute `data-affo-guard` are skipped entirely by both walkers and by all CSS selectors (Body, Body Contact, TMI). The `data-affo-guard` attribute is used on the quick pick overlay (`left-toolbar.js`) and each top-level WhatFont overlay (`whatfont_core.js`) to fully isolate extension UI from its own font overrides, including x.com's hybrid inline-apply path. CSS selectors include `:not([data-affo-guard]):not([data-affo-guard] *)` to exclude guarded containers and their descendants
- **Preserved fonts** (`affoPreservedFonts`): Icon font families (Font Awesome, Material Icons, bootstrap-icons, etc.) are never replaced. Configurable via Options page; checked against computed `font-family` stack
- **Implementation difference**: Body Contact uses CSS `:not()` selectors; TMI uses JS runtime checks in the element walker. Kept separate intentionally due to fundamentally different mechanisms

## Aggressive Mode (`affoAggressiveDomains`)

By default, CSS declarations are applied WITHOUT `!important` (relying on `cssOrigin: 'user'` for priority). Domains listed in `affoAggressiveDomains` get `!important` on all font declarations for sites with very strong style rules. Configurable via Options page textarea (one domain per line, defaults to empty). On page reload, `affoAggressiveDomains` is loaded in the same `storage.local.get()` call as `affoApplyMap` to avoid a race condition where aggressive mode CSS would be generated without `!important`. Reapply starts font fetching immediately but delays the visible CSS change until the configured face is ready. Immediately before that change, the content script captures a readable viewport anchor and restores its offset after layout, avoiding a late fallback-to-webfont reflow that can displace or reset a scrolled article.

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
- **`ensureSharedInlinePolling()`** — Creates shared polling timers (frequency ramp: fast → slow → stop) on first call. Each tick verifies sentinel elements for all active types before requesting any full rewrite.
- Hidden tabs cancel periodic timers through one document visibility listener; mutations or explicit Apply do not start polling while hidden. The lifecycle deadline still expires on wall-clock time. `resumeInlineStylesOnFocus()` drops expired configs, preserves full focus-recovery styling, and resumes polling only while monitoring remains active. The elapsed fast/slow phase is preserved across visibility changes. Explicit Apply and mutation-driven styling remain available while hidden.
- **`reapplyAllInlineStyles()`** — Shared SPA/focus handler. Polling skips types whose sampled protected values are intact; TMI recovery checks every candidate and protects only damaged targets. Concurrent recovery requests share a promise, with a full-recovery request preserved if it arrives during polling recovery.
- **`checkExpiredInlineTypes()`** — Removes types whose `expiresAt` has passed from `inlineConfigs`. Calls `cleanupSharedInlineInfra()` when no types remain.
- **`cleanupSharedInlineInfra()`** — Disconnects the shared observer and clears all shared timers.

### Selector Routing
- **`BODY_EXCLUDE`** — Effective chain assembled by `getBodyExcludeSelector()`: heading, code, button, navigation/form/landmark, guard, `.post-header`, `.comments-page`, article-deck, and drop-cap exclusions.
- **`isXCom`** — Boolean: whether the current origin is x.com or twitter.com. Controls hybrid selector routing.
- **`getAffoSelector(fontType)`** — Central dispatch: Body mode uses `BODY_EXCLUDE`; TMI mode uses `getHybridSelector()` on x.com or `[data-affo-font-type]` elsewhere.
- **`getHybridSelector(fontType)`** — Returns broad, x.com-specific CSS selectors matching elements by semantic structure (`data-testid`, `div[role]`, tweet patterns) rather than walker-placed marks. See `XCOM.md` for details.
- **`usesHybridInlineTmiSelectors()`** — Makes x.com hybrid targeting the sole TMI classifier during inline apply, so walkers are skipped for initial apply, mutations, SPA navigation, scaling, and font-loaded reapply.
- **`HYBRID_GUARD`** — Constant: `:not([data-affo-guard]):not([data-affo-guard] *)`. Appended to every hybrid selector term via `addHybridGuard(sel)`.

### Style Application
- **`applyAffoProtection(el, propsObj)`** — Applies all CSS properties from `propsObj` to an element with `!important`, plus `--affo-` custom properties and `data-affo-` attributes for resilience. Existing matching values are left untouched to avoid redundant style/attribute mutations.
- **`prepareTmiProtection(propsObj, effectiveWeight)`** — Prepares normal/bold property entries, comparison/write records, and bold axis overrides once per inline config. Records include the raw string, CSSOM-serialized value, priority, custom-property name, and metadata attribute name; the per-element path does not rebuild strings or consult the normalization cache.
- **`applyTmiProtection(el, cfg, isBold)`** — Uses the prepared normal or bold properties. Boldness comes from the prior bold marker or computed font weight, snapshotted before writing the target batch; non-bold results are not cached across node reuse.
- **`canonicalInlineValue(prop, value)`** — Uses a detached CSSStyleDeclaration and a bounded 256-entry cache to compare browser-serialized values. Both unchanged-write checks and recovery use it, so harmless font-family quote removal and hex-to-RGB color serialization do not trigger repairs. Custom property strings retain their original values. Recovery also verifies protection metadata and prepared bold axes.
- **`applyTmiProtectionBatch()`** — Collects all ready groups before its first queued read. Mutation groups span all affected roots and active TMI types; recovery groups span all ready types needing verification. The batch snapshots every group's boldness before writing any group, deduplicates overlapping roots within each group, and performs one heading pass over its distinct roots. Ready initial applications can share the same pending batch; callers arriving after reads begin start another batch rather than extending the current snapshot. Resetting one type cancels that group's work without discarding other live groups. Recovery processes ready groups before waiting for an in-flight Apply, then verifies that completed type separately.
- **`queueInlineWork()`** — Runs TMI filtering/boldness reads, protection writes, heading resets, and size-scaling read/write passes through one shared queue with an 8 ms budget. Continuations alternate a private `MessageChannel` task with an animation-frame callback on visible pages, avoiding nested timer delays while giving rendering regular opportunities. Hidden pages use message tasks; a visibility listener wakes a frame requested just before the page hid. Sequence IDs discard old messages when the popup bridge already consumed a continuation. The budget is checked between elements; native selector queries and individual DOM operations cannot be interrupted. All boldness reads for a target batch precede its writes. Config identity cancels obsolete work after replacement, removal, or reset; disconnected/guarded targets are skipped when resuming. Mutation dispatch awaits application before scaling and draining the next batch.
- **Shared discovery and deduplication** — Ordinary pages query marked targets once per distinct root and partition them by font type. x.com's overlapping hybrid selectors retain independent discovery. Within a batch, groups sharing a config verify and write each eligible element once; an intact repair-only check never suppresses a full Apply request.
- **Recovery scaling** — Size verification uses the actual scaling selector and recognizes descendants intentionally inheriting a scaled ancestor's size. This avoids polling repairs for marked non-targets and inherited sizes. Repair batches pass their size results to the scaling phase, skipping intact checked elements while retaining damaged targets and unmarked links/emphasis descendants. A concurrent full Apply disables this shortcut. Size-only repairs do not rewrite typography.
- **Follow-up work** — Heading resets are part of the batch iterator, not separate jobs per type. Scaling still measures after typography/heading changes; empty scale and scale-cleanup target lists do not enqueue jobs.
- **Apply completion** — `applyInlineStyles()` returns a promise recorded on the active config. Viewport-anchor restoration waits for it, and popup font-swap polling can advance one queued chunk through `affo-continue-inline` when source-tab work is suspended. Body application and non-inline scaling retain their synchronous paths.

## Bold Override Strategy

Bold elements (`<strong>`, `<b>`, or elements with computed `font-weight >= 700`) only need `font-weight: 700 !important`. Registered axes (`font-stretch`, `font-style`) inherit from the parent element naturally via CSS cascade. Custom axes are included in the bold rule's `font-variation-settings` if any exist. The TMI walker stamps computed-bold marked nodes with `data-affo-was-bold="true"` so CSS-mode TMI can keep marked links/spans out of the non-bold rule, and inline reapply cycles can detect them without re-reading computed style every time.

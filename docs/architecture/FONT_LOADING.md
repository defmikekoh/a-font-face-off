# Font Loading Architecture

## Async Architecture

All async operations are Promise-based (2024 refactor complete). No setTimeout polling for sequencing. CSS injection, font loading, button state updates, and storage operations all use async/await.

## Font Loading Optimizations (Page Reload)

A 4-stage pipeline ensures fonts load as early as possible:

1. **Early preloading from `left-toolbar.js`** (`document_start`): Reads `affoApplyMap` from storage. Normal domains ask background.js to resolve Google Fonts css2 URLs and inject preconnect hints + Google Fonts `<link>` tags as soon as `document.head` is available. FontFace-only domains such as x.com instead send `affoWarmFontFace`; the background resolves/fetches the CSS and warms the configured current-weight Latin WOFF2 in IndexedDB without returning the binary or injecting page CSS.
2. **Eager custom font reads in `content.js`** (module load): `ensureCustomFontsLoaded()` is kicked off immediately when the script loads, not lazily when first needed.
3. **Explicit face readiness in `content.js`**: The reapply path waits for the Google Fonts stylesheet and then calls `document.fonts.load()` for the configured face plus the supplemental bold face. Custom/FontFace-only paths wait for their `FontFace.load()` work before the same readiness check. It does not wait on `document.fonts.ready`, which could be delayed by unrelated site fonts.
4. **Stable visible swap**: AFFO keeps the page's current font styling until the configured face is ready, captures a readable element near the top of the viewport, applies the complete CSS change once, and restores that element's viewport offset over the next layout frames. Popup-triggered applies use the same content-script preparation/anchor bridge before injecting user-origin CSS.

Result: fetching still starts at `document_start`, but a slow first fetch no longer exposes an intermediate fallback-font layout or loses the reader's position when the selected face becomes visible.

## css2Url Resolution

Google Fonts CSS2 API URLs are derived at runtime from `fontName` + Google Fonts metadata. They are not stored in domain storage or a local storage URL cache:

- **font-url-utils.js**: Shared pure URL builder used by popup.js and the background font runtime
- **popup.js**: Computes css2 URLs directly for popup previews and immediate tab injection, but does not include them in `buildPayload()`
- **background.js**: Routes `resolveCss2Url` runtime messages from popup/content/toolbar to `background-font-runtime.js`
- **background-font-runtime.js**: Loads `gfMetadataCache` or bundled `data/gf-axis-registry.json`, memoizes resolved URLs in memory only, and owns CORS-safe font fetch/WOFF2 cache handling
- **content.js**: Requests css2 URLs from background.js when loading standard Google Fonts or FontFace-only Google Fonts
- **popup.js / content.js / left-toolbar.js**: Request css2 URLs from background.js; each keeps only short-lived in-memory promise/memo maps for duplicate calls in the same context
- **Domain storage (affoApplyMap)**: Does NOT store css2Url

## One-shot Page Fonts in Face-off

A pinned WhatFont card exposes a `Face-off` action for comparing the detected page font without adding it to custom fonts:

1. `whatfont_core.js` collects same-origin-accessible matching `@font-face` rules plus candidate stylesheet URLs.
2. `background.js` uses `page-font-utils.js` to extract matching rules, resolve relative font URLs, select the rule matching the detected weight/style, derive variable-axis ranges proven by the selected `@font-face` descriptors, and fetch candidate stylesheets when page CSSOM access is blocked.
3. Background fetches the selected WOFF2, WOFF, TTF, or OTF binary through `background-font-runtime.js`, detects its container from the binary signature, and replaces its remote source with a correctly typed temporary data URL. This avoids cross-origin font restrictions when the rule moves from the source page to the extension popup.
4. Background writes a short-lived `affoFaceoffPageFontDraft` and opens the popup.
5. `popup.js` removes the draft immediately, registers its `fontFaceRule` and proven axis definition in memory, converts the embedded source to a popup-safe blob URL, forces Face-off mode, and loads it into the top preview.

Adobe Fonts specimen pages are a special dynamic-source case: their internal families (for example `jyts-n5`) are loaded through `use.typekit.net/pf/tk/...` XHR resources and may have no stylesheet `@font-face` rule. WhatFont collects only a resource whose Adobe family/style path exactly matches the detected internal family. The background then synthesizes a temporary `@font-face` rule and passes its response through the same font-signature validation and data-URL embedding pipeline as stylesheet-discovered fonts.

The temporary family is preview-only. It is not added to custom CSS, favorites, domain storage, or saved Face-off UI state. Face-off Apply and Save Favorite are disabled until the top panel switches to a normal font. No CSS or font source is injected into the source page.

## WOFF2 Binary Cache

FontFace-only domains such as x.com cannot rely on page-level Google Fonts `<link>` injection. For those domains, `content.js` asks `background-font-runtime.js` to fetch the Google Fonts CSS, select matching WOFF2 subsets, and fetch font binaries via `affoFetch`.

Binary font responses are cached in IndexedDB (`affo-font-cache` / `fonts`) as `ArrayBuffer` records keyed by URL. This avoids the old `browser.storage.local.affoFontCache` format, which stored large `Array.from(Uint8Array)` payloads and created avoidable serialization/deserialization pressure on Android Firefox. Cache management still uses a 1-year TTL and an 80MB size cap; the Options page queries/clears the cache through background runtime messages.

The background runtime also coalesces concurrent `affoFetch` requests for the same URL and keeps a short in-memory cache for text responses such as Google Fonts CSS. Pending IndexedDB writes are readable immediately, so the document-start warm and content-script load share one WOFF2 request even when they overlap. This prevents popup/page reload races from issuing duplicate CSS or WOFF2 fetches in the same wake window.

Before requesting Google WOFF2 files, `content.js` samples visible text nodes from the current document, converts them to Unicode code points, and selects only `@font-face` entries whose `unicode-range` overlaps the page text. Loads started within two seconds share that snapshot, while lazy-subset checks force a fresh scan. The visibility scan caches ancestor results, and parsed Google Fonts CSS is memoized, avoiding repeated DOM/computed-style and CSS parsing work across TMI families. The configured weight is ordered before the supplemental bold face inside each subset group. The initial FontFace pass is capped by a byte budget, so a complex variable family can render with the first needed subset while selected secondary subsets are deferred to idle time and loaded serially. Subsets whose scripts are not present in the initial visible text stay unloaded; a short-lived mutation observer only queues them later if newly added text overlaps those unicode ranges.

Expired-cache maintenance is deferred five seconds after a background wake, runs at most once per 24 hours (tracked by `affoFontCacheLastMaintenance`), and uses the IndexedDB `timestamp` index to visit only expired rows. Full cache status scans are debug-only.

Custom font `@font-face` blocks support WOFF2, WOFF, TrueType (TTF), and OpenType (OTF) sources over HTTP(S) or base64 `data:` URLs. Source parsing follows the effective final `src` descriptor, skips obsolete EOT/SVG sources, recognizes both `format()` hints and URL/data-MIME formats, and tries the remaining supported sources in declaration order when decoding or fetching one fails. They use the same initial byte-budget and idle serial-defer model on FontFace-only domains, preventing multi-variant custom families from decoding every selected variant in parallel during first apply.

Variable-axis metadata is read from WOFF2, WOFF, TTF, and OTF binaries when an `fvar` table is present.

## Custom Font Architecture

- **popup.js**: Parses `custom-fonts.css` + `ap-fonts.css` at startup → `fontDefinitions` map with `fontFaceRule`; the picker hydrates from bundled/cached `gf-family-list.json` and loads full Google Fonts metadata only when axis/CSS2 details are needed
- **content.js**: Parses same files on-demand (first font load) → `customFontDefinitions` map with `fontFaceRule`
- **Domain storage (affoApplyMap)**: Does NOT store `fontFaceRule` (eliminated duplication)
- **UI state**: May include `fontFaceRule` from `getCurrentUIConfig` for in-popup behavior
- **Favorites storage/sync**: Strips `fontFaceRule` to avoid duplicating multi-KB custom `@font-face` blocks in `affoFavorites`/`favorites.json`
- Embedded custom fonts may use WOFF2, WOFF, TTF, or OTF base64 data URLs. On FontFace-only domains (x.com), `tryCustomFontFaceAPI` detects the data MIME, decodes base64 → ArrayBuffer → FontFace.
- On FontFace-only domains, custom families only load `@font-face` blocks whose `font-weight` range overlaps the current config weight or 700 (for bold descendants). Variable custom fonts preserve range descriptors like `font-weight: 100 900` when creating `FontFace` objects.

## Firefox Popup Embedded Font Handling

The extension popup converts embedded WOFF2, WOFF, TTF, and OTF base64 font URLs from `data:` to correctly typed `blob:` URLs before injecting their `@font-face` rules. The manifest allows both `data:` and `blob:` in `font-src`, but Firefox extension popups have not rendered the raw `data:` font rules reliably. This is an extension-popup compatibility workaround, not a general claim that Firefox cannot load `data:` fonts.

Popup path: `atob` → `Uint8Array` → typed `Blob` → `URL.createObjectURL`, handled by `ensureCustomFontInjected()` in `popup.js`.

FontFace-only page path: avoids CSS font URLs entirely. `tryCustomFontFaceAPI()` decodes the same base64 payload to an ArrayBuffer and passes it to `new FontFace(...)`.

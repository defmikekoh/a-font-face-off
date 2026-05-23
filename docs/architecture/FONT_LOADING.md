# Font Loading Architecture

## Async Architecture

All async operations are Promise-based (2024 refactor complete). No setTimeout polling for sequencing. CSS injection, font loading, button state updates, and storage operations all use async/await.

## Font Loading Optimizations (Page Reload)

A 4-stage pipeline ensures fonts load as early as possible:

1. **Early preloading from `left-toolbar.js`** (`document_start`): Reads `affoApplyMap` from storage, asks background.js to resolve Google Fonts css2 URLs at runtime, and injects preconnect hints + Google Fonts `<link>` tags as soon as `document.head` is available. This gives the browser maximum lead time to start fetching fonts before the page is fully parsed. FontFace-only domains such as x.com skip this page-level stylesheet path.
2. **Eager custom font reads in `content.js`** (module load): `ensureCustomFontsLoaded()` is kicked off immediately when the script loads, not lazily when first needed.
3. **Early font link injection in reapply path**: The Google Fonts `<link>` tag is resolved and injected alongside the CSS `<style>` element, before or in parallel with the `loadFont()` chain.
4. **CSS injection before font loads**: CSS rules targeting `[data-affo-font-type="..."]` are injected immediately, before font files load. The browser shows fallback fonts until the font file loads, then swaps in via `font-display: swap`.

Result: Font loading starts at `document_start` (earliest possible), eliminating sequential async waits from the critical path.

## css2Url Resolution

Google Fonts CSS2 API URLs are derived at runtime from `fontName` + Google Fonts metadata. They are not stored in domain storage or a local storage URL cache:

- **font-url-utils.js**: Shared pure URL builder used by popup.js and the background font runtime
- **popup.js**: Computes css2 URLs directly for popup previews and immediate tab injection, but does not include them in `buildPayload()`
- **background.js**: Routes `resolveCss2Url` runtime messages to `background-font-runtime.js`
- **background-font-runtime.js**: Loads `gfMetadataCache` or bundled `data/gf-axis-registry.json`, memoizes resolved URLs in memory only, and owns CORS-safe font fetch/WOFF2 cache handling
- **content.js**: Requests css2 URLs from background.js when loading standard Google Fonts or FontFace-only Google Fonts
- **left-toolbar.js**: Requests css2 URLs from background.js at `document_start` for early font preloading
- **Domain storage (affoApplyMap)**: Does NOT store css2Url

## WOFF2 Binary Cache

FontFace-only domains such as x.com cannot rely on page-level Google Fonts `<link>` injection. For those domains, `content.js` asks `background-font-runtime.js` to fetch the Google Fonts CSS, select matching WOFF2 subsets, and fetch font binaries via `affoFetch`.

Binary font responses are cached in IndexedDB (`affo-font-cache` / `fonts`) as `ArrayBuffer` records keyed by URL. This avoids the old `browser.storage.local.affoFontCache` format, which stored large `Array.from(Uint8Array)` payloads and created avoidable serialization/deserialization pressure on Android Firefox. Cache management still uses a 1-year TTL and an 80MB size cap; the Options page queries/clears the cache through background runtime messages.

The background runtime also coalesces concurrent `affoFetch` requests for the same URL and keeps a short in-memory cache for text responses such as Google Fonts CSS. This prevents popup/page reload races from issuing duplicate CSS or WOFF2 fetches in the same wake window.

Before requesting Google WOFF2 files, `content.js` samples visible text nodes from the current document, converts them to Unicode code points, and selects only `@font-face` entries whose `unicode-range` overlaps the page text. Parsed Google Fonts CSS is memoized in the content script so repeated popup/page applies do not re-parse the same CSS response. The initial FontFace pass is capped by a byte budget, so a complex variable family can render with the first needed subset while selected secondary subsets are deferred to idle time and loaded serially. Subsets whose scripts are not present in the initial visible text stay unloaded; a short-lived mutation observer only queues them later if newly added text overlaps those unicode ranges.

Custom font `@font-face` blocks use the same initial byte-budget and idle serial-defer model on FontFace-only domains. This prevents multi-variant custom families from decoding every selected variant in parallel during first apply.

## Custom Font Architecture

- **popup.js**: Parses `custom-fonts.css` + `ap-fonts.css` at startup → `fontDefinitions` map with `fontFaceRule`
- **content.js**: Parses same files on-demand (first font load) → `customFontDefinitions` map with `fontFaceRule`
- **Domain storage (affoApplyMap)**: Does NOT store `fontFaceRule` (eliminated duplication)
- **UI state**: May include `fontFaceRule` from `getCurrentUIConfig` for in-popup behavior
- **Favorites storage/sync**: Strips `fontFaceRule` to avoid duplicating multi-KB custom `@font-face` blocks in `affoFavorites`/`favorites.json`
- AP fonts use `data:font/woff2;base64,...` URLs in `ap-fonts.css`. On FontFace-only domains (x.com), `tryCustomFontFaceAPI` detects data: URLs, decodes base64 → ArrayBuffer → FontFace
- On FontFace-only domains, custom families only load `@font-face` blocks whose `font-weight` range overlaps the current config weight or 700 (for bold descendants). Variable custom fonts preserve range descriptors like `font-weight: 100 900` when creating `FontFace` objects.

## Firefox Popup Embedded Font Handling

The extension popup converts embedded AP/APVar font URLs from `data:font/woff2;base64,...` to `blob:` URLs before injecting their `@font-face` rules. The manifest allows both `data:` and `blob:` in `font-src`, but Firefox extension popups have not rendered the raw `data:` font rules reliably. This is an extension-popup compatibility workaround, not a general claim that Firefox cannot load `data:` fonts.

Popup path: `atob` → `Uint8Array` → `Blob` → `URL.createObjectURL`, handled by `injectApFonts()` in `popup.js`.

FontFace-only page path: avoids CSS font URLs entirely. `tryCustomFontFaceAPI()` decodes the same base64 payload to an ArrayBuffer and passes it to `new FontFace(...)`.

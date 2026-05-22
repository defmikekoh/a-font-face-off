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

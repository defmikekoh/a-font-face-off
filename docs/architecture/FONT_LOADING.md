# Font Loading Architecture

## Async Architecture

All async operations are Promise-based (2024 refactor complete). No setTimeout polling for sequencing. CSS injection, font loading, button state updates, and storage operations all use async/await.

## Font Loading Optimizations (Page Reload)

A 4-stage pipeline ensures fonts load as early as possible:

1. **Early preloading from `left-toolbar.js`** (`document_start`): Reads `affoApplyMap` and `affoCss2UrlCache` from storage; injects preconnect hints + Google Fonts `<link>` tags as soon as `document.head` is available. This gives the browser maximum lead time to start fetching fonts before the page is even parsed.
2. **Eager storage reads in `content.js`** (module load): `ensureCustomFontsLoaded()` and `ensureCss2UrlCache()` are kicked off immediately when the script loads, not lazily when first needed. By the time `reapplyStoredFonts` runs, these promises are likely already resolved.
3. **Early font link injection in reapply path**: The Google Fonts `<link>` tag is injected immediately alongside the CSS `<style>` element, before entering the `loadFont()` async chain. Only injects if cached css2Url is available (skips if not — no fallback URL).
4. **CSS injection before font loads**: CSS rules targeting `[data-affo-font-type="..."]` are injected immediately, before font files load. The browser shows fallback fonts until the font file loads, then swaps in via `font-display: swap`.

Result: Font loading starts at `document_start` (earliest possible), eliminating sequential async waits from the critical path.

## css2Url Caching

Google Fonts CSS2 API URLs are cached globally in `affoCss2UrlCache` (fontName → URL) to avoid per-domain duplication:

- **popup.js**: Computes css2Url when building payload → stores via `storeCss2UrlInCache()`
- **background.js**: `ensureCss2UrlCached(fontName)` checks cache, computes from `gfMetadataCache` if missing (used by Quick Pick `quickApplyFavorite`). `buildCss2UrlFromMetadata()` is a focused replica of popup.js's URL builder
- **content.js**: Looks up css2Url from cache by fontName → skips font loading if not cached (no fallback URL). `refreshCss2UrlCache()` re-reads storage on miss
- **left-toolbar.js**: Reads cache at `document_start` for early font preloading
- **Domain storage (affoApplyMap)**: Does NOT store css2Url (eliminated duplication)
- Cache is local-only, rebuilds naturally as fonts are selected or applied via Quick Pick

## Custom Font Architecture

- **popup.js**: Parses `custom-fonts.css` + `ap-fonts.css` at startup → `fontDefinitions` map with `fontFaceRule`
- **content.js**: Parses same files on-demand (first font load) → `customFontDefinitions` map with `fontFaceRule`
- **Domain storage (affoApplyMap)**: Does NOT store `fontFaceRule` (eliminated duplication)
- **UI state & favorites**: DOES include `fontFaceRule` (from `getCurrentUIConfig`, used for popup preview)
- AP fonts use `data:font/woff2;base64,...` URLs in `ap-fonts.css`. On FontFace-only domains (x.com), `tryCustomFontFaceAPI` detects data: URLs, decodes base64 → ArrayBuffer → FontFace

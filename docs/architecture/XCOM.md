# x.com Special Handling

x.com requires unique treatment due to aggressive style clearing.

## FontFace-only Loading

Background script fetches WOFF2 with unicode-range filtering. Domain lists are configurable via `affoFontFaceOnlyDomains` and `affoInlineApplyDomains` storage keys. At `document_start`, the toolbar avoids page-level Google Fonts `<link>` injection and instead asks the background runtime to resolve the configured family and warm its current-weight Latin WOFF2 in IndexedDB. This overlaps network/cache work with page parsing without exposing a stylesheet to x.com. Google Fonts only load the configured weight plus 700 for bold descendants, prioritize the configured weight within each subset group, and register `FontFace` instances with CSS-derived `font-weight`, `font-style`, `unicode-range`, and `font-stretch` descriptors. Custom non-Google families only load `@font-face` blocks matching the active weight or 700, and preserve variable `font-weight` ranges when registering `FontFace` instances.

## Inline Style Application

Direct DOM element styles with `!important`.

## Hybrid CSS Selectors

`getHybridSelector(fontType)` returns broad, x.com-specific CSS selectors (targeting `data-testid`, `div[role]`, tweet patterns, etc.) instead of `[data-affo-font-type]` attribute selectors. This is necessary because x.com's aggressive SPA constantly recreates DOM nodes, causing walker-placed `data-affo-font-type` marks to disappear. The hybrid selectors match elements by semantic structure so inline-apply, MutationObserver, and polling can re-find and restyle elements without relying on marks persisting.

Routed via `getAffoSelector()` which checks the `isXCom` flag. When x.com is also configured for inline apply, the hybrid selectors fully own TMI targeting: initial apply, mutation handling, SPA navigation, font-size scaling, and font-loaded reapply all skip the element walker.

Body Contact percent font-size scaling also explicitly includes tweet author clusters (`article [data-testid="User-Name"]`) and their text-bearing descendants so display names, handles, and timestamps scale with tweet body text.

## SPA Resilience

Single shared MutationObserver + shared polling interval for all active font types (via `inlineConfigs` registry), plus History API and visibility hooks. Mutation work is scoped to newly added roots. Polling checks a small set of sentinel elements first and only performs a full query/rewrite when protected inline values have changed. Rewrites themselves compare current values before touching style/attribute state, and heading resets run once per affected root rather than once per matched ancestor. Per-type expiry is tracked via `expiresAt` timestamps; shared infrastructure disconnects when all types expire or are removed.

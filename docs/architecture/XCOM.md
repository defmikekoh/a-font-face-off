# x.com Special Handling

x.com requires unique treatment due to aggressive style clearing.

## FontFace-only Loading

Background script fetches WOFF2 with unicode-range filtering. Domain lists configurable via `affoFontFaceOnlyDomains` and `affoInlineApplyDomains` storage keys.

## Inline Style Application

Direct DOM element styles with `!important`.

## Hybrid CSS Selectors

`getHybridSelector(fontType)` returns broad, x.com-specific CSS selectors (targeting `data-testid`, `div[role]`, tweet patterns, etc.) instead of `[data-affo-font-type]` attribute selectors. This is necessary because x.com's aggressive SPA constantly recreates DOM nodes, causing walker-placed `data-affo-font-type` marks to disappear. The hybrid selectors match elements by semantic structure so inline-apply, MutationObserver, and polling can re-find and restyle elements without relying on marks persisting.

Routed via `getAffoSelector()` which checks the `isXCom` flag. The element walker still runs on x.com (marks elements as usual) but the marks are supplementary — the hybrid selectors provide the primary targeting.

## SPA Resilience

Single shared MutationObserver + shared polling interval for all active font types (via `inlineConfigs` registry), History API hooks, computed style restoration. Per-type expiry tracked via `expiresAt` timestamps; shared observer disconnects when all types expire or are removed.

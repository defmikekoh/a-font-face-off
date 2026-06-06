# Popup Architecture (popup.js)

## Storage Operations

### Panel Helper Module
`popup-panel-utils.js` owns the pure popup panel helpers: `MODE_CONFIG`, panel labels/headings, Sroulette intent wrappers, config equality, applied-state comparison, Third Man In difference counting, and Apply All batch-change planning. `popup.js` keeps DOM reads/writes, browser storage, CSS injection, and event binding.

### Centralized Storage Functions
- `getApplyMapForOrigin(origin, fontType?)`: Retrieve from `affoApplyMap` — single read gets all domain fonts or specific font type
- `saveApplyMapForOrigin(origin, fontType, config)`: Save single font type to `affoApplyMap`
- `saveSrouletteApplyMapForOrigin(origin, target, pool)`: Save an explicit Sroulette intent for `body`, `serif`, `sans`, or `mono` without resolving the sampled font
- `saveBatchApplyStateForOrigin(origin, batchConfigs)`: Batch save multiple font targets or Sroulette intents in single storage write (used by Apply All)
- `clearApplyMapForOrigin(origin, fontType?)`: Clear specific font type or all fonts from `affoApplyMap`

### Storage Access Patterns
- **popup.js**: Read-only callers use `getApplyMapForOrigin()`. Primary write path is via `saveApplyMapForOrigin`, `saveBatchApplyStateForOrigin`, `clearApplyMapForOrigin`, with reads by `getAppliedConfigForDomain` (read-modify-write pattern).
- **favorites.js**: Load Favorites renders Sroulette Serif/Sans as pseudo-favorites above saved favorites for Body and all TMI panels, including Mono, when the corresponding pool has at least one valid favorite. On Substack pages, these pseudo-favorites are exposed in Mono only, allowing a configured mono-heavy publication to use a sampled font without starting native Substack Roulette. Clicking one marks the panel; Apply writes only Sroulette intent. Save is disabled while a panel is showing Sroulette because the synced state is the Sroulette intent, not the sampled font.
- **background.js**: WebDAV manual domain pull writes directly to `affoApplyMap` when importing `/a-font-face-off/affo-apply-map.json`.
- **background.js**: WebDAV manual favorites pull writes directly to `affoFavorites`/`affoFavoritesOrder` when importing `/a-font-face-off/affo-favorites.json`.
- **content.js**: Read-only — 3 inline reads (page-load reapply, custom font load, storage change listener). Storage change listener diffs `oldValue[origin]` vs `newValue[origin]` before acting. No write operations.

## Config Conversion & Payload Building

### `normalizeConfig(raw)` (config-utils.js)
Single entry point for converting any external config (favorites, domain storage, legacy formats) into canonical format. Handles:
- `fontSizePx` → `fontSize` legacy rename
- `fontSizeScale` → percent-based size scaling, mutually exclusive with `fontSize`
- Coercion to `Number` for all numeric properties (including `letterSpacing` where `0` is a valid value)
- `fontStyle: "italic"` static style preservation; `fontStyle: "normal"` is omitted
- `fontFaceRule` passthrough for backward compatibility (from old stored data; not used in new saves)
- Legacy axis props (`wdthVal`, `slntVal`) folded into `variableAxes`; legacy `italVal` / `"ital" 1` toggles map to `fontStyle: "italic"`

Used when loading from: favorites, domain storage (`affoApplyMap`), any external source.

### `buildPayload(position, providedConfig?)`
Unified async function that builds a complete payload for domain storage / content.js from either the current UI state or a provided config. Does NOT include `fontFaceRule`, `css2Url`, or `styleId` in the payload to eliminate per-domain duplication and derived state:
- `fontFaceRule`: content.js looks up custom font @font-face rules on-demand by parsing custom-fonts.css and ap-fonts.css
- `css2Url`: derived at runtime from `fontName` + Google Fonts metadata through `font-url-utils.js`; content.js/left-toolbar.js request resolution from background.js
- `styleId`: content.js computes it as `'a-font-face-off-style-' + fontType` (deterministic, no need to store)

### `getCurrentUIConfig(position)`
Reads current font configuration directly from UI controls. Respects active/unset state — only includes properties for controls the user has activated. For custom fonts, includes `fontFaceRule` from `fontDefinitions` for immediate popup behavior/preview; favorites persistence strips `fontFaceRule` before storage/sync to avoid duplication. This is the canonical "read from UI" function.

### `getCurrentPanelState(position)`
Wraps the UI read with Sroulette awareness and returns one of `{ kind: 'font', config }`, `{ kind: 'sroulette', pool }`, or `{ kind: 'empty' }`. Apply, button-state, and save-disable logic use this helper when a panel may be showing Sroulette, so pseudo-favorites are not mistaken for normal font configs.

## State Management

### UI State Functions
- `loadExtensionState()`: Load from `affoUIState`
- `saveExtensionState()`: Save to `affoUIState`
- `getActiveControlsFromConfig(config)`: Derives active controls as a Set from property presence
- `getActiveAxes(position)`: Derives active variable axes from UI slider state
- `configsEqual(config1, config2)`: Compares two configs using derived active state

### Font Memory (Runtime Only)
Per-panel font setting history, not persisted to storage. Remembers axis/control values when switching fonts within a panel.
- `getFontMemory(position)`: Returns the memory object for a position (`top`, `bottom`, `body`, `serif`, `sans`, `mono`)
- `saveFontSettings(position, fontName)`: Saves current UI config (via `getCurrentUIConfig`) into font memory — only stores active controls
- `restoreFontSettings(position, fontName)`: Restores saved settings from font memory — only activates controls that were previously saved

### One-shot Page-font Face-off
`loadPendingFaceoffPageFontDraft()` consumes and removes `affoFaceoffPageFontDraft` during popup startup. A valid recent draft forces Face-off mode and `applyPendingFaceoffPageFontDraft()` loads its in-memory `fontFaceRule` and any variable-axis ranges proven by its `@font-face` descriptors into the top panel after normal Face-off restoration. `saveExtensionStateImmediate()` skips the ephemeral top family, preserving the previously saved top selection, while Apply and Save Favorite remain disabled for that temporary family.

### Functions that modify BOTH Domain Storage AND UI State
- `resetAllThirdManInFonts()`: Clears domain storage + resets UI to `null` state
- `applyUnsetSettings(panelId)`: Clears domain storage + resets UI to `null` state

### Functions that modify ONLY Domain Storage
- `clearApplyMapForOrigin()`: No UI changes
- `saveApplyMapForOrigin()`: No UI changes

## Mode Architecture

### `MODE_CONFIG` constant
Data-driven mode metadata defined in `popup-panel-utils.js` and used by `saveExtensionStateImmediate`, `performModeSwitch`, and `modeHasAppliedSettings` instead of per-mode if/else branches.
```javascript
{
    'body-contact': { positions: ['body'], stateKeys: { body: 'bodyFont' }, useDomain: true },
    'faceoff': { positions: ['top', 'bottom'], stateKeys: { top: 'topFont', bottom: 'bottomFont' }, useDomain: false },
    'third-man-in': { positions: ['serif', 'sans', 'mono'], stateKeys: { serif: 'serifFont', sans: 'sansFont', mono: 'monoFont' }, useDomain: true }
}
```

### `PANEL_ROUTE` constant
Routing table mapping `(mode, panelId)` → `{ apply, unapply }` functions. Replaces mode-branching if/else chains in `applyPanelConfiguration()` and `unapplyPanelConfiguration()`.

### Panel Positions
All six positions: body, top, bottom, serif, sans, mono. Only body-font-controls exists in HTML; the other five are cloned via `cloneControlPanel(position)` at startup.

## Button State Logic

### `determineButtonState(changeCount, allDefaults, domainHasApplied)` (config-utils.js)
Pure function returning `{ action: 'apply'|'reset'|'none', changeCount }`. Shared by `updateBodyButtonsImmediate`, `updateAllThirdManInButtons`, and `updateThirdManInButtons` (TMI branch). Each caller maps the result to its own button text ("Apply" vs "Apply All (3)").

## UI Control Factories

### `getPositionCallbacks(position)`
Returns `{ preview, buttons, save }` callbacks appropriate for a panel position. Body calls `updateBodyPreview` + `updateBodyButtons`; TMI calls `updateThirdManInPreview` + `updateAllThirdManInButtons`; face-off calls `applyFont`.

### `setupSliderControl(position, controlId, options?)`
Generic factory for slider input, text keydown/blur, and value display handlers. Used for font-size, line-height, letter-spacing, and font-weight across all 6 positions. Options: `{ format, suffix, clampMin, clampMax }`.

### `cloneControlPanel(position)`
Clones the `body-font-controls` template to create control panels for top, bottom, serif, sans, and mono positions at startup. Replaces all `body-` ID prefixes, updates headings (e.g. "Top Font", "Serif"), button text ("Apply All"/"Reset All" for TMI positions), aria-labels, and titles. All 5 panels are cloned before any other initialization code runs.

### `resetFontForPosition(position)`
Generic reset for any panel position. Resets slider values (font-size: 17, line-height: 1.5, letter-spacing: 0, weight: 400), text inputs, value displays, marks all control groups as `unset`, resets variable axes using `getEffectiveFontDefinition()`, and calls `applyFont(position)`.

### `togglePanel(panelId)`
Unified panel toggle for all modes. For face-off panels (top/bottom): manages grip active/aria state, overlay visibility, and narrow-screen single-panel enforcement. For body/TMI panels: simple classList toggle.

## Shell Layout (popup.css / popup-context.js)

The popup is a **three-rectangle flex column** on `body`: `#mode-tabs` (fixed height) / `#preview-region` (`flex:1`) / `#panel-grips` (fixed-height bottom bar). DOM order is tabs/bar/region, so CSS `order` (1/2/3) puts them in visual order.

- `#preview-region` (`position:relative`, the middle rectangle) wraps both `#font-comparison` (the preview) and the slide-in `.controls-panel` overlays. Panels are `position:absolute; top:0; bottom:0` relative to the region — no hardcoded tab/bar offsets.
- **Two sizing contexts, detected by platform** (NOT URL params or `@media(pointer:fine)` — the latter is tripped by the Note10 S-Pen). `popup-context.js` (external, since the extension CSP blocks inline scripts) adds `html.affo-mobile` when the UA is Android. Desktop browser-action panel = fixed `400x600` (it sizes-to-content, so the flex column needs a definite height); Android (normal popup AND the page-font tab) = `width:100vw; height: calc(100dvh + env(safe-area-inset-bottom))` to fill the viewport edge-to-edge. The bottom bar's `--panel-grips-total` (`--panel-grips-h + env(safe-area-inset-bottom)`) keeps its buttons above the system nav.
- The page-font Face-off opens `popup.html?domain=…&sourceTabId=…` as a TAB (mobile `openPopupFallback` → `tabs.create`); desktop uses `browserAction.openPopup`.
- Face-off is comparison-only and does NOT apply to the page; the old "facade" apply-to-page machinery (apply-top/bottom handlers, `syncApplyButtonsForOrigin`, `refreshApplyButtonsDirtyState`) was removed — it had been leaking `reset-top/bottom` into Face-off based on saved serif/sans state. Apply/Reset remain live only in TMI (`syncThirdManInButtons`) and Body-Contact (`updateBodyButtonsImmediate`).

## Font Application

- `applyAllThirdManInFonts()`: Apply all Third Man In font changes using `saveBatchApplyStateForOrigin()` (1 storage write instead of N) with parallel CSS application

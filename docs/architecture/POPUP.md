# Popup Architecture (popup.js)

## Storage Operations

### Centralized Storage Functions
- `getApplyMapForOrigin(origin, fontType?)`: Retrieve from `affoApplyMap` — single read gets all domain fonts or specific font type
- `saveApplyMapForOrigin(origin, fontType, config)`: Save single font type to `affoApplyMap`
- `saveBatchApplyMapForOrigin(origin, fontConfigs)`: Batch save multiple font types in single storage write (used by Apply All)
- `clearApplyMapForOrigin(origin, fontType?)`: Clear specific font type or all fonts from `affoApplyMap`

### Storage Access Patterns
- **popup.js**: Read-only callers use `getApplyMapForOrigin()`. Primary write path is via `saveApplyMapForOrigin`, `saveBatchApplyMapForOrigin`, `clearApplyMapForOrigin`, with reads by `getAppliedConfigForDomain` (read-modify-write pattern).
- **background.js**: WebDAV manual domain pull writes directly to `affoApplyMap` when importing `/a-font-face-off/affo-apply-map.json`.
- **background.js**: WebDAV manual favorites pull writes directly to `affoFavorites`/`affoFavoritesOrder` when importing `/a-font-face-off/affo-favorites.json`.
- **content.js**: Read-only — 3 inline reads (page-load reapply, custom font load, storage change listener). Storage change listener diffs `oldValue[origin]` vs `newValue[origin]` before acting. No write operations.

## Config Conversion & Payload Building

### `normalizeConfig(raw)` (config-utils.js)
Single entry point for converting any external config (favorites, domain storage, legacy formats) into canonical format. Handles:
- `fontSizePx` → `fontSize` legacy rename
- Coercion to `Number` for all numeric properties (including `letterSpacing` where `0` is a valid value)
- `fontFaceRule` passthrough for backward compatibility (from old stored data; not used in new saves)
- Legacy axis props (`wdthVal`, `slntVal`, `italVal`) folded into `variableAxes`

Used when loading from: favorites, domain storage (`affoApplyMap`), any external source.

### `buildPayload(position, providedConfig?)`
Unified async function that builds a complete payload for domain storage / content.js from either the current UI state or a provided config. Does NOT include `fontFaceRule`, `css2Url`, or `styleId` in the payload to eliminate per-domain duplication:
- `fontFaceRule`: content.js looks up custom font @font-face rules on-demand by parsing custom-fonts.css and ap-fonts.css
- `css2Url`: Stored in global `affoCss2UrlCache` (fontName → URL mapping); written by popup.js (`storeCss2UrlInCache`) and background.js (`ensureCss2UrlCached` for Quick Pick); content.js looks up by fontName
- `styleId`: content.js computes it as `'a-font-face-off-style-' + fontType` (deterministic, no need to store)

### `getCurrentUIConfig(position)`
Reads current font configuration directly from UI controls. Respects active/unset state — only includes properties for controls the user has activated. For custom fonts, includes `fontFaceRule` from `fontDefinitions` for use in UI state, favorites, and popup preview. This is the canonical "read from UI" function.

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

### Functions that modify BOTH Domain Storage AND UI State
- `resetAllThirdManInFonts()`: Clears domain storage + resets UI to `null` state
- `applyUnsetSettings(panelId)`: Clears domain storage + resets UI to `null` state

### Functions that modify ONLY Domain Storage
- `clearApplyMapForOrigin()`: No UI changes
- `saveApplyMapForOrigin()`: No UI changes

## Mode Architecture

### `MODE_CONFIG` constant
Data-driven mode metadata used by `saveExtensionStateImmediate`, `performModeSwitch`, and `modeHasAppliedSettings` instead of per-mode if/else branches.
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

## Font Application

- `applyAllThirdManInFonts()`: Apply all Third Man In font changes using `saveBatchApplyMapForOrigin()` (1 storage write instead of N) with parallel CSS application

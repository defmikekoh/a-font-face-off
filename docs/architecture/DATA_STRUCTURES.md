# A Font Face-off Data Structures Documentation

This document outlines the key data structures used in the A Font Face-off browser extension for font management and persistence.

## Storage Systems

The extension uses `browser.storage.local` for all persistence.

### Domain Storage (`affoApplyMap`)
**Purpose**: Stores fonts applied to specific domains across all modes (Body Contact, Third Man In)
**Key**: `affoApplyMap`

```javascript
{
  "example.com": {
    "body": {
      "fontName": "Roboto"
    }
  }
}
```

### UI State Storage (`affoUIState`)
**Purpose**: Stores current UI state and font selections
**Key**: `affoUIState`

**Unset state (no fonts configured):**
```javascript
{
  "body-contact": {},
  "faceoff": {},
  "third-man-in": {}
}
```

**Font configured with active controls:**
```javascript
{
  "body-contact": {},
  "faceoff": {
    "topFont": {
      "fontName": "ABeeZee",
      "fontSize": 16,
      "variableAxes": {"ital": 0}
    }
  },
  "third-man-in": {
    "serifFont": {
      "fontName": "Merriweather",
      "fontWeight": 400
    }
  }
}
```

### Other Storage Keys

| Key | Purpose | Example Value |
|-----|---------|---------------|
| `affoCurrentMode` | Current view mode persistence | `"third-man-in"` |
| `affoKnownSerif` | User-defined serif font families | `["PT Serif", "Times New Roman"]` |
| `affoKnownSans` | User-defined sans-serif font families | `["Inter", "Arial"]` |
| `affoFontFaceOnlyDomains` | Domains requiring FontFace-only loading | `["x.com"]` |
| `affoInlineApplyDomains` | Domains requiring inline style application | `["x.com"]` |
| `affoFavorites` | User's favorite font configurations | `[{fontName: "Inter", fontSize: 16}]` |
| `affoFavoritesOrder` | Order of favorite configurations | `[0, 2, 1]` |
| `gfMetadataCache` | Cached Google Fonts metadata (from remote/local fetch) | `{ familyMetadataList: [...] }` |
| `gfMetadataTimestamp` | Timestamp for metadata cache age checks | `1699999999999` |
| `affoCustomFontsCss` | Custom font @font-face CSS override | `"@font-face { ... }"` |
| `affoSyncMeta` | Google Drive local sync metadata and tombstones | `{ lastSync: 1700000000000, items: { "domains/example.com.json": { modified: 1700000000000, deletedAt: 1700000000000 } } }` |
| `affoWebDavConfig` | WebDAV config for custom fonts sync | `{ serverUrl: "...", anonymous: false, username: "...", password: "..." }` |

### Google Drive Sync Metadata (`affoSyncMeta`)
**Purpose**: Tracks per-item change timestamps for bidirectional Google Drive sync.
**Key**: `affoSyncMeta`

```javascript
{
  "lastSync": 1700000000000,
  "items": {
    "domains/example.com.json": {
      "modified": 1700000000000
    },
    "domains/removed.com.json": {
      "modified": 1700001000000,
      "deletedAt": 1700001000000
    },
    "favorites.json": {
      "modified": 1700002000000
    }
  }
}
```

- `modified`: last known write time for the item
- `deletedAt` (optional): tombstone timestamp used to propagate deletes safely across devices

## WebDAV Sync

`background.js` uses shared JSON sync helpers for domain/favorites (`pullJsonObjectFromWebDav`, `pushJsonToWebDav`, `syncJsonSnapshotOnce`, `scheduleWebDavAutoSync`) to keep behavior consistent.

### Domain settings (`affoApplyMap`)
- Remote file: `/a-font-face-off/affo-apply-map.json`
- Auto sync trigger: `background.js` listens for `browser.storage.local` changes to `affoApplyMap`
- Auto sync flow: pull (best effort) then push local changed snapshot
- Conflict model: last successful push wins
- Guard: if `affoWebDavConfig.serverUrl` is empty/missing, skip sync (no pull/push attempt)
- Manual pull: Options page button **Pull Domain Settings** (`affoWebDavPullDomainSettings`) imports remote JSON into local `affoApplyMap`
- Auto-failure signal: runtime message `affoWebDavDomainSyncFailed` (used by Options retry modal)

### Favorites (`affoFavorites`, `affoFavoritesOrder`)
- Remote file: `/a-font-face-off/affo-favorites.json`
- Auto sync trigger: `background.js` listens for `browser.storage.local` changes to `affoFavorites` and `affoFavoritesOrder`
- Auto sync flow: pull (best effort) then push local changed snapshot
- Conflict model: last successful push wins
- Guard: if `affoWebDavConfig.serverUrl` is empty/missing, skip sync (no pull/push attempt)
- Manual sync controls: **Pull Favorites** (`affoWebDavPullFavorites`) and **Push Favorites** (`affoWebDavPushFavorites`)
- Auto-failure signal: runtime message `affoWebDavFavoritesSyncFailed` (used by Options retry modal)

### Custom fonts CSS (`affoCustomFontsCss`)
- Remote file: `/a-font-face-off/custom-fonts.css`
- Manual sync controls in Options: **Pull Custom Fonts**, **Push Custom Fonts**

## Mode Types

### View Modes
- `'body-contact'`: Single font application to body text
- `'faceoff'`: Split-screen font comparison (top/bottom)
- `'third-man-in'`: Three-panel font system (serif/sans/mono)

### Font Positions
- `'body'`: Body mode font
- `'top'`/`'bottom'`: Face-off mode fonts
- `'serif'`/`'sans'`/`'mono'`: Third Man In mode fonts

## Configuration Objects

### Font Configuration Structure ("No Key" Architecture)
Only store properties with actual values — no null, undefined, or string placeholders like 'default'.

- **Primitive properties** (fontSize, fontColor, etc.): Only stored when set (omitted when unset)
- **Nested objects** (variableAxes): Always present as empty `{}` even when no axes are active
- **Rationale**: Eliminates defensive `|| {}` checks while keeping storage minimal for primitives

**Unset State:**
```javascript
undefined  // No font configured (not null or empty object)
```

**Font Selected with Settings:**
```javascript
{
  "fontName": "Comic Neue",           // Font family name (always present)
  "fontSize": 16,                     // Font size in px (only if set)
  "lineHeight": 1.5,                  // Line height (only if set)
  "fontWeight": 400,                  // Font weight (only if set)
  "fontColor": "#333333",             // Font color (only if set, NOT 'default')
  "variableAxes": {                   // ALWAYS present (even if empty {})
    "wght": 400,                      // Weight axis (only if modified from default)
    "ital": 1                         // Italic axis (only if modified)
  }
}
```

**Font Selected with No Settings:**
```javascript
{
  "fontName": "Comic Neue",           // Font family name only
  "variableAxes": {}                  // Always present (even when empty)
}
```

**What NEVER gets stored:**
- String `'default'` for color (omit the property instead)
- String `'null'` or `'undefined'` (never use these strings)
- Explicit `null` or `undefined` values for primitives
- Empty arrays `[]` (N/A in current schema)

### Domain Storage Structure
Domain storage uses the same "no key" format as UI state. Both use identical object structures, enabling direct comparison via `configsEqual()`.

## Custom Font Definitions

Custom fonts are defined in `custom-fonts.css`. All detected `font-family` values are treated as pinned custom fonts.

### Storage override (optional)

If present, `affoCustomFontsCss` in `browser.storage.local` overrides the packaged `custom-fonts.css` contents.

### CUSTOM_FONTS

Pinned custom font family names, parsed from the effective CSS (override or packaged file).

```javascript
[
  "Apercu Pro",
  "GuardianTextEgyptian",
  "National",
  "BBC Reith Serif",
  "Graphik Trial",
  "FK Roman Standard Trial",
  "TiemposText"
]
```

### fontDefinitions (custom only)

Map of custom font family name to definition object. All custom font definitions are non-variable and use empty axis metadata.

```javascript
{
  "Apercu Pro": {
    "axes": [],
    "defaults": {},
    "ranges": {},
    "steps": {},
    "fontFaceRule": "@font-face { ... }"
  }
}
```

## Panel State Tracking

```javascript
const panelStates = {
  'faceoff': {
    top: false,      // Top panel open/closed
    bottom: false    // Bottom panel open/closed
  },
  'body-contact': {
    body: false      // Body panel open/closed
  },
  'third-man-in': {
    serif: false,    // Serif panel open/closed
    sans: false,     // Sans panel open/closed
    mono: false      // Mono panel open/closed
  }
};
```

## Key Functions

### Storage Operations

#### Centralized Storage Functions (popup.js primary)
- `getApplyMapForOrigin(origin, fontType?)`: Retrieve from `affoApplyMap` — single read gets all domain fonts or specific font type
- `saveApplyMapForOrigin(origin, fontType, config)`: Save single font type to `affoApplyMap`
- `saveBatchApplyMapForOrigin(origin, fontConfigs)`: Batch save multiple font types in single storage write (used by Apply All)
- `clearApplyMapForOrigin(origin, fontType?)`: Clear specific font type or all fonts from `affoApplyMap`

#### Inline Storage Access
- **popup.js**: Read-only callers use `getApplyMapForOrigin()`. Primary write path is via `saveApplyMapForOrigin`, `saveBatchApplyMapForOrigin`, `clearApplyMapForOrigin`, with reads by `getAppliedConfigForDomain` (read-modify-write pattern).
- **background.js**: WebDAV manual domain pull writes directly to `affoApplyMap` when importing `/a-font-face-off/affo-apply-map.json`.
- **background.js**: WebDAV manual favorites pull writes directly to `affoFavorites`/`affoFavoritesOrder` when importing `/a-font-face-off/affo-favorites.json`.
- **content.js**: Read-only — 3 inline reads (page-load reapply, custom font load, storage change listener). No write operations.

### Config Conversion & Payload Building

#### `normalizeConfig(raw)`
Single entry point for converting any external config (favorites, domain storage, legacy formats) into canonical format. Handles:
- `fontSizePx` → `fontSize` legacy rename
- Coercion to `Number` for all numeric properties
- `fontFaceRule` passthrough for custom fonts
- Legacy axis props (`wdthVal`, `slntVal`, `italVal`) folded into `variableAxes`

Used when loading from: favorites, domain storage (`affoApplyMap`), any external source.

#### `buildPayload(position, providedConfig?)`
Unified async function that builds a complete payload for domain storage / content.js from either the current UI state or a provided config. Adds transport properties (`css2Url`, `styleId`) and resolves `fontFaceRule` from `fontDefinitions` if needed. Replaces the former `buildCurrentPayload`, `buildThirdManInPayload`, and `buildThirdManInPayloadFromConfig`.

#### `getCurrentUIConfig(position)`
Reads current font configuration directly from UI controls. Respects active/unset state — only includes properties for controls the user has activated. This is the canonical "read from UI" function.

### State Management

#### UI State Functions
- `loadExtensionState()`: Load from `affoUIState`
- `saveExtensionState()`: Save to `affoUIState`
- `getCurrentUIConfig(position)`: Get current font configuration from UI controls
- `getActiveControlsFromConfig(config)`: Derives active controls as a Set from property presence
- `getActiveAxes(position)`: Derives active variable axes from UI slider state
- `configsEqual(config1, config2)`: Compares two configs using derived active state

#### Font Memory (Runtime Only)
Per-panel font setting history, not persisted to storage. Remembers axis/control values when switching fonts within a panel.
- `getFontMemory(position)`: Returns the memory object for a position (`top`, `bottom`, `body`, `serif`, `sans`, `mono`)
- `saveFontSettings(position, fontName)`: Saves current UI config (via `getCurrentUIConfig`) into font memory — only stores active controls
- `restoreFontSettings(position, fontName)`: Restores saved settings from font memory — only activates controls that were previously saved

#### Functions that modify BOTH Domain Storage AND UI State
- `resetAllThirdManInFonts()`: Clears domain storage + resets UI to `null` state
- `applyUnsetSettings(panelId)`: Clears domain storage + resets UI to `null` state

#### Functions that modify ONLY Domain Storage
- `clearApplyMapForOrigin()`: No UI changes
- `saveApplyMapForOrigin()`: No UI changes

### Mode Configuration

#### `MODE_CONFIG` constant
Data-driven mode metadata used by `saveExtensionStateImmediate`, `performModeSwitch`, and `modeHasAppliedSettings` instead of per-mode if/else branches.
```javascript
{
    'body-contact': { positions: ['body'], stateKeys: { body: 'bodyFont' }, useDomain: true },
    'faceoff': { positions: ['top', 'bottom'], stateKeys: { top: 'topFont', bottom: 'bottomFont' }, useDomain: false },
    'third-man-in': { positions: ['serif', 'sans', 'mono'], stateKeys: { serif: 'serifFont', sans: 'sansFont', mono: 'monoFont' }, useDomain: true }
}
```

### Button State Logic

#### `determineButtonState(changeCount, allDefaults, domainHasApplied)`
Pure function returning `{ action: 'apply'|'reset'|'none', changeCount }`. Shared by `updateBodyButtonsImmediate`, `updateAllThirdManInButtons`, and `updateThirdManInButtons` (TMI branch). Each caller maps the result to its own button text ("Apply" vs "Apply All (3)").

### UI Control Factories

#### `getPositionCallbacks(position)`
Returns `{ preview, buttons, save }` callbacks appropriate for a panel position. Body calls `updateBodyPreview` + `updateBodyButtons`; TMI calls `updateThirdManInPreview` + `updateAllThirdManInButtons`; face-off calls `applyFont`.

#### `setupSliderControl(position, controlId, options?)`
Generic factory for slider input, text keydown/blur, and value display handlers. Used for font-size, line-height, and font-weight across all 6 positions. Options: `{ format, suffix, clampMin, clampMax }`.

### Font Application
- `applyAllThirdManInFonts()`: Apply all Third Man In font changes using `saveBatchApplyMapForOrigin()` (1 storage write instead of N) with parallel CSS application

## CSS Generation Helpers

Shared helper functions used by all CSS generation paths (popup.js and content.js each have their own copies since they run in different contexts).

### Registered vs Custom Axes

Registered OpenType axes have corresponding high-level CSS properties and should NOT be placed in `font-variation-settings`. Only custom/unregistered axes use `font-variation-settings`.

| Axis | CSS Property | Example |
|------|-------------|---------|
| `wght` | `font-weight` | `font-weight: 380` |
| `wdth` | `font-stretch` | `font-stretch: 90%` |
| `slnt` | `font-style` | `font-style: oblique -12deg` |
| `ital` | `font-style` | `font-style: italic` |
| `opsz` | `font-optical-sizing` | `font-optical-sizing: auto` |
| `GRAD`, `CASL`, etc. | `font-variation-settings` | `font-variation-settings: "GRAD" 150` |

### Helper Functions

- **`getEffectiveWeight(config)`** — Returns numeric weight or `null`. Checks `config.fontWeight` first (basic weight control), falls back to `config.variableAxes.wght` (variable axis slider).
- **`getEffectiveWidth(config)`** — Same pattern for wdth. Checks `config.wdthVal` then `config.variableAxes.wdth`. (Legacy `wdthVal` only exists in old stored domain data; new payloads use `variableAxes` exclusively.)
- **`getEffectiveSlant(config)`** — Same pattern for slnt. (Legacy `slntVal` — same note as wdth.)
- **`getEffectiveItalic(config)`** — Same pattern for ital. (Legacy `italVal` — same note as wdth.)
- **`buildCustomAxisSettings(config)`** — Returns array of `'"axis" value'` strings for custom axes only. Filters out all registered axes (`wght`, `wdth`, `slnt`, `ital`, `opsz`) from `config.variableAxes`.

### Inline-Apply Helpers (content.js module-level)

These helpers are used by `applyInlineStyles()`, `restoreManipulatedStyles()`, and the MutationObserver/reapply logic. They live at module level so all inline-apply code paths share them.

- **`BODY_EXCLUDE`** — Constant: `:not(h1):not(h2)...:not(.no-affo)`. The base exclusion chain for body-mode selectors.
- **`isXCom`** — Boolean: whether the current origin is x.com or twitter.com. Controls hybrid selector only; polling/restore behavior uses `shouldUseInlineApply()`.
- **`getAffoSelector(fontType)`** — Returns the CSS selector for a given font type. Body mode uses `BODY_EXCLUDE`; TMI mode uses `getHybridSelector()` on x.com or `[data-affo-font-type]` elsewhere.
- **`applyAffoProtection(el, propsObj)`** — Applies all CSS properties from `propsObj` to an element with `!important`, plus `--affo-` custom properties and `data-affo-` attributes for resilience.
- **`applyTmiProtection(el, propsObj, effectiveWeight)`** — Wraps `applyAffoProtection` with bold detection. Checks tag name, `data-affo-was-bold` marker, or computed `fontWeight >= 700` before applying, then restores weight to 700 for bold elements.

### Bold Override Strategy

Bold elements (`<strong>`, `<b>`, or elements with computed `font-weight >= 700`) only need `font-weight: 700 !important`. Registered axes (`font-stretch`, `font-style`) inherit from the parent element naturally via CSS cascade. Custom axes are included in the bold rule's `font-variation-settings` if any exist. In the inline-apply path, bold elements are marked with `data-affo-was-bold="true"` so subsequent reapply cycles can detect them without relying on computed style.

### Dev-Mode Logging

All JS files (popup.js, content.js, background.js, left-toolbar.js) declare `var AFFO_DEBUG = true;` in source. When `false`, `console.log` and `console.warn` are replaced with no-ops synchronously. `console.error` is always active. The `npm run build` step automatically sets the flag to `false` via `scripts/set-debug.js` (prebuild) and restores it to `true` (postbuild), so production packages are silent and local `web-ext run` has full logging with no manual toggling.

## Async Architecture

All async operations use Promise-based flow with `async`/`await`:

```javascript
await applyFontConfig(position, config);  // DOM updates complete
await updateButtons(position);           // Guaranteed fresh state
hideFavoritesPopup();                   // UI state is consistent
```

Key async functions: `applyFontConfig()`, `loadFont()`, `selectFont()`, `updateBodyButtons()`, `updateAllThirdManInButtons()`, `switchMode()`, `loadModeSettings()`, `applyFontToPage()`, and all storage operations.

## Example Domain Storage Data

### Body Mode Example
```javascript
// affoApplyMap
{
  "example.com": {
    "body": {
      "fontName": "Merriweather",
      "fontSize": 16
    }
  }
}
```

### Third Man In Mode Example
```javascript
// affoApplyMap
{
  "example.com": {
    "sans": {
      "fontName": "Noto Sans",
      "fontSize": 17
    },
    "serif": {
      "fontName": "Noto Serif",
      "fontSize": 18
    }
  }
}
```

### Multiple Domains Example
```javascript
// affoApplyMap
{
  "example.com": {
    "sans": {
      "fontName": "Noto Sans",
      "fontSize": 17
    }
  },
  "github.com": {
    "mono": {
      "fontName": "Fira Code",
      "variableAxes": {"wght": 400}
    }
  },
  "news.ycombinator.com": {
    "serif": {
      "fontName": "PT Serif"
    },
    "sans": {
      "fontName": "Inter",
      "fontSize": 15
    }
  }
}
```

## Troubleshooting Storage Issues
If the extension behaves unexpectedly, clear stored data:
1. **UI State**: Clear `affoUIState` from browser.storage.local
2. **Domain Storage**: Clear `affoApplyMap` from browser.storage.local
3. **Mode Persistence**: Clear `affoCurrentMode` from browser.storage.local

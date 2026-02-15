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
| `affoCss2UrlCache` | Global cache of Google Fonts css2 URLs (fontName → URL) | `{"Roboto Slab": "https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@100..900&display=swap"}` |
| `affoAggressiveDomains` | Domains where CSS uses `!important` | `["example.com"]` |
| `affoPreservedFonts` | Font families never replaced (icon fonts) | `["Font Awesome 5 Free", "Material Icons", "bootstrap-icons"]` |
| `affoSubstackRoulette` | Substack roulette master toggle | `true` (default) |
| `affoSubstackRouletteSerif` | Favorite names checked for roulette serif pool | `["Spectral", "Lora"]` |
| `affoSubstackRouletteSans` | Favorite names checked for roulette sans pool | `["Inter", "Source Sans 3"]` |
| `affoSyncBackend` | Active sync backend | `"gdrive"` or `"webdav"` |
| `affoSyncMeta` | Local sync metadata and remote revision fingerprints | `{ lastSync: 1700000000000, items: { "domains.json": { modified: 1700000000000, remoteRev: "app-folder:domains.json:v3" } } }` |
| `affoWebDavConfig` | WebDAV connection config | `{ serverUrl: "...", anonymous: false, username: "...", password: "..." }` |

### Cloud Sync Metadata (`affoSyncMeta`)
**Purpose**: Tracks per-item change timestamps for bidirectional cloud sync (Google Drive or WebDAV). Each synced item is a single file in the remote folder.
**Key**: `affoSyncMeta`

```javascript
{
  "lastSync": 1700000000000,
  "items": {
    "domains.json": {
      "modified": 1700000000000,
      "remoteRev": "app-folder:domains.json:v3"  // GDrive only; null for WebDAV
    },
    "favorites.json": {
      "modified": 1700002000000,
      "remoteRev": "app-folder:favorites.json:v5"
    }
  }
}
```

- `modified`: last known write time for the item
- `remoteRev` (optional, GDrive only): last observed Drive file revision fingerprint (`<fileId>:v<version>`) used for optimistic concurrency checks before overwriting remote files

## Cloud Sync Architecture

One backend active at a time (`affoSyncBackend`). Both use the same sync algorithm (`runSync`) with the same remote file structure:

| Remote File | Storage Key | Content |
|---|---|---|
| `sync-manifest.json` | — | Bidirectional merge timestamps |
| `domains.json` | `affoApplyMap` | All domain font configs |
| `favorites.json` | `affoFavorites` + `affoFavoritesOrder` | Saved favorites |
| `custom-fonts.css` | `affoCustomFontsCss` | Custom @font-face rules |
| `known-serif.json` | `affoKnownSerif` | User serif classification |
| `known-sans.json` | `affoKnownSans` | User sans classification |
| `fontface-only-domains.json` | `affoFontFaceOnlyDomains` | FontFace-only domain list |
| `inline-apply-domains.json` | `affoInlineApplyDomains` | Inline apply domain list |
| `aggressive-domains.json` | `affoAggressiveDomains` | Aggressive `!important` domain list |
| `preserved-fonts.json` | `affoPreservedFonts` | Icon font families never replaced |
| `substack-roulette.json` | `affoSubstackRoulette` + `affoSubstackRouletteSerif` + `affoSubstackRouletteSans` | Roulette toggle + serif/sans name pools |

### Backend interface (`gdriveBackend` / `webdavBackend`)
- `init()` — setup (GDrive: ensure app folder; WebDAV: MKCOL sync folder)
- `isConfigured()` — check credentials present
- `get(name)` → `{ data, remoteRev }` or `{ notFound: true }`
- `put(name, content, contentType)` → `{ remoteRev }`
- `remove(name)` → void

### Google Drive specifics
- Uses OAuth PKCE via `browser.identity.launchWebAuthFlow`
- Files in visible "A Font Face-off{suffix}" folder
- Optimistic concurrency via `remoteRev` (file version fingerprints)

### WebDAV specifics
- Basic auth (username/password) or anonymous
- Files in `{serverUrl}/A Font Face-off{suffix}/` folder (created via MKCOL)
- No optimistic concurrency (`remoteRev` always null); timestamp-based sync only
- `credentials: 'omit'` on all requests (avoids Nextcloud CSRF issues)

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

### fontDefinitions (popup.js)

Map of custom font family name to definition object. All custom font definitions are non-variable and use empty axis metadata. Built by parsing `custom-fonts.css` and `ap-fonts.css` at popup startup.

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

### customFontDefinitions (content.js)

Content script maintains its own parsed custom font definitions by fetching and parsing `custom-fonts.css` and `ap-fonts.css` on-demand (first font load). This eliminates the need to store `fontFaceRule` in domain storage (`affoApplyMap`). When a custom font is applied, content.js looks up the `fontFaceRule` by `fontName` from its parsed definitions.

```javascript
{
  "GuardianTextEgyptian": {
    "fontFaceRule": "@font-face { ... }"
  }
}
```

**Note:** Domain storage no longer includes `fontFaceRule`. This prevents multi-KB @font-face rules from being duplicated across all domains using the same custom font.

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
- **content.js**: Read-only — 3 inline reads (page-load reapply, custom font load, storage change listener). Storage change listener diffs `oldValue[origin]` vs `newValue[origin]` before acting. No write operations.

### Config Conversion & Payload Building

#### `normalizeConfig(raw)`
Single entry point for converting any external config (favorites, domain storage, legacy formats) into canonical format. Handles:
- `fontSizePx` → `fontSize` legacy rename
- Coercion to `Number` for all numeric properties
- `fontFaceRule` passthrough for backward compatibility (from old stored data; not used in new saves)
- Legacy axis props (`wdthVal`, `slntVal`, `italVal`) folded into `variableAxes`

Used when loading from: favorites, domain storage (`affoApplyMap`), any external source.

#### `buildPayload(position, providedConfig?)`
Unified async function that builds a complete payload for domain storage / content.js from either the current UI state or a provided config. **Note:** Does NOT include `fontFaceRule`, `css2Url`, or `styleId` in the payload to eliminate per-domain duplication:
- `fontFaceRule`: content.js looks up custom font @font-face rules on-demand by parsing custom-fonts.css and ap-fonts.css
- `css2Url`: Stored in global `affoCss2UrlCache` (fontName → URL mapping); content.js looks up by fontName
- `styleId`: content.js computes it as `'a-font-face-off-style-' + fontType` (deterministic, no need to store)

This eliminates storage duplication - the same multi-KB `fontFaceRule` and identical `css2Url` are no longer stored per-domain, and computed values like `styleId` are derived at runtime. Replaces the former `buildCurrentPayload`, `buildThirdManInPayload`, and `buildThirdManInPayloadFromConfig`.

#### `getCurrentUIConfig(position)`
Reads current font configuration directly from UI controls. Respects active/unset state — only includes properties for controls the user has activated. For custom fonts, includes `fontFaceRule` from `fontDefinitions` for use in UI state, favorites, and popup preview. This is the canonical "read from UI" function.

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

#### `cloneControlPanel(position)`
Clones the `body-font-controls` template to create control panels for top, bottom, serif, sans, and mono positions at startup. Replaces all `body-` ID prefixes, updates headings (e.g. "Top Font", "Serif"), button text ("Apply All"/"Reset All" for TMI positions), aria-labels, and titles. All 5 panels are cloned before any other initialization code runs.

#### `PANEL_ROUTE` constant
Routing table mapping `(mode, panelId)` → `{ apply, unapply }` functions. Replaces mode-branching if/else chains in `applyPanelConfiguration()` and `unapplyPanelConfiguration()`.

#### `resetFontForPosition(position)`
Generic reset for any panel position. Resets slider values (17, 1.6, 400), text inputs, value displays, marks all control groups as `unset`, resets variable axes using `getEffectiveFontDefinition()`, and calls `applyFont(position)`.

#### `togglePanel(panelId)`
Unified panel toggle for all modes. For face-off panels (top/bottom): manages grip active/aria state, overlay visibility, and narrow-screen single-panel enforcement. For body/TMI panels: simple classList toggle.

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

**Detection note:** Browsers don't expose registered axes in `font-variation-settings` — they're resolved into the high-level CSS properties above. WhatFont's `detectVariableAxes()` reads both `font-variation-settings` (for custom axes) and the high-level CSS properties (for registered axes), mapping non-default values back to axis tags (e.g., `font-stretch: 75%` → `wdth: 75`).

### Helper Functions

- **`getEffectiveWeight(config)`** — Returns numeric weight or `null`. Checks `config.fontWeight` first (basic weight control), falls back to `config.variableAxes.wght` (variable axis slider).
- **`getEffectiveWidth(config)`** — Same pattern for wdth. Checks `config.wdthVal` then `config.variableAxes.wdth`. (Legacy `wdthVal` only exists in old stored domain data; new payloads use `variableAxes` exclusively.)
- **`getEffectiveSlant(config)`** — Same pattern for slnt. (Legacy `slntVal` — same note as wdth.)
- **`getEffectiveItalic(config)`** — Same pattern for ital. (Legacy `italVal` — same note as wdth.)
- **`buildCustomAxisSettings(config)`** — Returns array of `'"axis" value'` strings for custom axes only. Filters out all registered axes (`wght`, `wdth`, `slnt`, `ital`, `opsz`) from `config.variableAxes`.

### SPA Hook Registry (content.js module-level)

Idempotent infrastructure for SPA navigation and focus/visibility handlers. Installed once globally; all code paths register handlers via helper functions.

```javascript
var spaHooksInstalled = false;       // Guard: pushState/replaceState/popstate hooks installed once
var spaNavigationHandlers = [];      // Array of callbacks invoked on SPA navigation (deduped by reference)
var focusHooksInstalled = false;     // Guard: focus/visibilitychange listeners installed once
var focusHandlers = [];              // Array of callbacks invoked on focus/visibility change
```

- **`registerSpaHandler(fn)`** — Calls `installSpaHooks()`, then adds `fn` if not already registered (indexOf check)
- **`installSpaHooks()`** — Wraps `history.pushState`/`replaceState` and adds `popstate` listener exactly once. All wrappers dispatch to `spaNavigationHandlers` array after 100ms delay.
- **`registerFocusHandler(fn)`** — Adds `fn` to `focusHandlers` if not already registered; installs `focus`/`visibilitychange` listeners once

### Unified Element Walker (content.js module-level)

Single-pass DOM walker that classifies elements for all active TMI font types at once.

```javascript
var elementWalkerCompleted = {};           // fontType → boolean (prevents redundant scans)
var elementWalkerRechecksScheduled = {};   // fontType → boolean (prevents double-scheduling rechecks)
```

- **`getElementFontType(element)`** — Module-scope classification function. Returns `'serif'`, `'sans'`, `'mono'`, or `null`. Reads `preservedFonts`, `knownSerifFonts`, `knownSansFonts` from module scope.
- **`runElementWalkerAll(fontTypes)`** — Accepts array of font types (e.g. `['serif', 'sans', 'mono']`). Filters to uncompleted types, clears existing markers, walks DOM once, marks elements with `data-affo-font-type`, schedules rechecks.
- **`runElementWalker(fontType)`** — Thin wrapper: `runElementWalkerAll([fontType])`. Used by runtime message handler and individual-type callers.
- **`scheduleElementWalkerRechecks(fontTypes)`** — Accepts array. Filters to unscheduled types, then schedules rechecks at 700ms, 1600ms, and `document.fonts.ready`.

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

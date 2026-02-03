# A Font Face-off Data Structures Documentation

This document outlines the key data structures used in the A Font Face-off browser extension for font management and persistence.

## Storage Systems

The extension uses a unified storage architecture with `browser.storage.local` for all persistence:

### 1. Unified Domain Storage (`affoApplyMap`)
**Purpose**: Stores fonts applied to specific domains across all modes (Body Contact, Third Man In)
**Storage Location**: `browser.storage.local`  
**Key**: `affoApplyMap` (consolidated from previous dual V1/V2 system)

```javascript
{
  "example.com": {
    "body": {
      "fontName": "Roboto"
      // ... similar structure to Third Man In
    }
  }
}
```

### 3. UI State Storage (browser.storage.local)
**Purpose**: Stores current UI state and font selections
**Storage Location**: `browser.storage.local`
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

### 4. Other Storage Keys (browser.storage.local)
**Purpose**: Additional extension settings and state
**Storage Location**: `browser.storage.local`

| Key | Purpose | Example Value |
|-----|---------|---------------|
| `affoCurrentMode` | Current view mode persistence | `"third-man-in"` |
| `affoKnownSerif` | User-defined serif font families | `["PT Serif", "Times New Roman"]` |
| `affoKnownSans` | User-defined sans-serif font families | `["Inter", "Arial"]` |
| `affoFontFaceOnlyDomains` | Domains requiring FontFace-only loading | `["x.com"]` |
| `affoFavorites` | User's favorite font configurations | `[{fontName: "Inter", fontSize: 16}]` |
| `affoFavoritesOrder` | Order of favorite configurations | `[0, 2, 1]` |
| `gfMetadataCache` | Cached Google Fonts metadata (from remote/local fetch) | `{ familyMetadataList: [...] }` |
| `gfMetadataTimestamp` | Timestamp for metadata cache age checks | `1699999999999` |
| `affoCustomFontsCss` | Custom font @font-face CSS override | `"@font-face { ... }"` |
| `affoWebDavConfig` | WebDAV config for custom fonts sync | `{ serverUrl: "...", anonymous: false, username: "...", password: "..." }` |

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
Used throughout the system for font settings. The "no key" approach only stores properties with actual values - no null, undefined, or string placeholders like 'default'.

**Mixed Approach:**
- **Primitive properties** (fontSize, fontColor, etc.): Only stored when set (omitted when unset)
- **Nested objects** (variableAxes): Always present as empty `{}` even when no axes are active

This eliminates defensive `|| {}` checks throughout the codebase while keeping storage minimal for primitives.

**Unset State:**
```javascript
undefined  // No font configured (not null or empty object)
```

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

Map of custom font family name → definition object. All custom font definitions are non-variable and use empty axis metadata.

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

### Domain Storage Structure (Consistent Format)
Domain storage uses the same "no key" format as UI state for consistency. Both UI state and domain storage use identical object structures, making comparisons simple.

**Basic Font (No Settings):**
```javascript
{
  "fontName": "Comic Neue"
}
```

**Font with Settings:**
```javascript
{
  "fontName": "Comic Neue",
  "fontSize": 16,                     // Applied font size (only if set)
  "lineHeight": 1.5,                  // Applied line height (only if set)  
  "fontWeight": 400,                  // Applied font weight (only if set)
  "fontColor": "#333333",             // Applied font color (only if set)
  "variableAxes": {"wght": 400, "ital": 1} // Variable font axes (only if configured)
}
```

**Comparison Benefits:**
- UI state and domain storage use identical object structures
- Direct object comparison possible (no format conversion needed)
- Simplified `configsEqual()` logic

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

#### Third Man In Mode (Centralized Storage Functions)
- `getApplyMapForOrigin(origin, fontType?)`: Retrieve from `affoApplyMap` - single read gets all domain fonts or specific font type
- `saveApplyMapForOrigin(origin, fontType, config)`: Save single font type to `affoApplyMap` 
- `saveBatchApplyMapForOrigin(origin, fontConfigs)`: **OPTIMIZED** - Batch save multiple font types in single storage write (used by Apply All)
- `clearApplyMapForOrigin(origin, fontType?)`: **Domain storage only** - Clear specific font type or all fonts from `affoApplyMap`
- `clearAllThirdManInFonts(origin)`: **Domain storage only** - Helper to clear all Third Man In fonts (serif, sans, mono) at once

#### Body Mode (Mixed Storage Approach)
- Uses both centralized helper functions (`saveApplyMapForOrigin`, `getApplyMapForOrigin`, `clearApplyMapForOrigin`)
- Also has some inline `browser.storage.local.get('affoApplyMap')` and `browser.storage.local.set({ affoApplyMap: applyMap })` operations
- Mix of centralized functions and embedded storage logic

#### Unified Storage Architecture 

After consolidation, all modes now use the same storage system:
- **Storage Key**: `affoApplyMap` (single unified system)
- **Data Structure**: `domain → fontType → config` (flattened from previous nested structure)  
- **Storage Method**: Mix of centralized functions (Third Man In) and inline code (Body Contact)
- **Font Types Supported**: `body`, `serif`, `sans`, `mono`
- **Benefits**: Eliminated data duplication, simplified storage queries, consistent data format

### State Management

#### UI State (browser.storage.local) Functions
- `loadExtensionState()`: **UI state only** - Load from `affoUIState` key in browser.storage.local
- `saveExtensionState()`: **UI state only** - Save to `affoUIState` key in browser.storage.local
- `getCurrentUIConfig(position)`: **UI state only** - Get current font configuration from UI

#### Functions that modify BOTH Domain Storage AND UI State
- `resetAllThirdManInFonts()`: Clears domain storage + resets UI to `null` state
- `applyUnsetSettings(panelId)`: Clears domain storage + resets UI to `null` state

#### Functions that modify ONLY Domain Storage
- `clearApplyMapForOrigin()`: **Domain storage only** - No UI changes
- `saveApplyMapForOrigin()`: **Domain storage only** - No UI changes

#### "No Key" Architecture Summary
**Core Principle**: Only store properties with meaningful values - no null, undefined, or string placeholders like 'default'.

**Mixed Approach (Updated):**
- **Primitive properties**: Only stored when set (fontSize, fontColor, etc. omitted when unset)
- **Nested objects**: Always present even when empty (`variableAxes: {}` always exists)
- **Rationale**: Eliminates defensive `|| {}` checks (7+ instances) while keeping storage minimal

**Key Changes Made:**
- **Flattened Structure**: Removed `basicControls` wrapper - font properties stored directly on config object
- **Eliminated Redundant Arrays**: Removed `activeControls` and `activeAxes` arrays - active state derived from data presence
- **Consistent Format**: Both UI state and domain storage use identical object structures
- **Null-Free Storage**: Only properties with actual values are stored (no null/undefined/string 'default')
- **Unified Storage**: All persistence uses `browser.storage.local` (migrated from localStorage)
- **Simplified Comparisons**: Direct object comparison between UI state and domain storage
- **Always-Present Containers**: `variableAxes: {}` always present for simpler, safer access

**Technical Implementation:**
- `getCurrentUIConfig()`: Returns flattened config with `variableAxes: {}` always present, or `undefined` when no font selected
- `getActiveControlsFromConfig()`: Derives active state from property presence (fontColor presence = active)
- `configsEqual()`: Uses helper functions to derive active state from data
- Button logic: `undefined` vs `undefined` = no changes = no button shown
- Access patterns: Safe to use `config.variableAxes.wght` without checking if variableAxes exists first
- `saveExtensionStateImmediate()`: Uses `delete` to remove unset fonts from state
- Extension state initialization: Uses empty objects `{}` for clean initialization

**Benefits:**
- Reduced storage footprint (no redundant metadata)
- Simplified comparison logic between UI and domain storage
- Cleaner data structures throughout codebase
- Consistent format eliminates need for data transformation

### Font Application
- `applyAllThirdManInFonts()`: **OPTIMIZED** - Apply all Third Man In font changes using batch storage (1 write instead of N writes)

### Apply All Storage Optimization

**Problem**: Previously, applying multiple fonts (e.g., serif + sans + mono) resulted in multiple storage writes:
- Serif font applied → `saveApplyMapForOrigin()` → 1 storage write
- Sans font applied → `saveApplyMapForOrigin()` → 1 storage write  
- Mono font applied → `saveApplyMapForOrigin()` → 1 storage write
- **Result**: 3 separate storage operations with potential race conditions

**Solution**: Batch optimization collects all font changes and performs single storage write:
1. **Collect** all font configurations that need to be applied
2. **Single batch write** using `saveBatchApplyMapForOrigin(origin, fontConfigs)`
3. **Parallel CSS application** for all fonts simultaneously
4. **Result**: 1 storage write regardless of number of fonts changed

**Benefits**:
- Faster performance with fewer storage operations
- Eliminates race conditions between rapid storage writes
- Cleaner console logging showing batch operations
- Scales efficiently as more font types are added

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
- **`getEffectiveWidth(config)`** — Same pattern for wdth. Checks `config.wdthVal` then `config.variableAxes.wdth`.
- **`getEffectiveSlant(config)`** — Same pattern for slnt.
- **`getEffectiveItalic(config)`** — Same pattern for ital.
- **`buildCustomAxisSettings(config)`** — Returns array of `'"axis" value'` strings for custom axes only. Filters out all registered axes (`wght`, `wdth`, `slnt`, `ital`, `opsz`) from `config.variableAxes`.

### Bold Override Strategy

Bold elements (`<strong>`, `<b>`) only need `font-weight: 700 !important`. Registered axes (`font-stretch`, `font-style`) inherit from the parent element naturally via CSS cascade. Custom axes are included in the bold rule's `font-variation-settings` if any exist.

## Storage Schema

- **Current (`affoApplyMap`)**: Unified schema used by all modes
  - Supports all font types: `body`, `serif`, `sans`, `mono`
  - Flattened data structure: `domain → fontType → config`
  - Single storage key eliminates complexity and data duplication
  - Optimized with batch write operations for Apply All functionality

## Example Domain Storage Data

### Body Mode Example
**Scenario**: Body mode with Merriweather 16px applied to `example.com` (protocol stripped)

```javascript
// Storage key: affoApplyMap
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
**Scenario**: Third Man In mode with Noto Sans 17px and Noto Serif 18px applied to `example.com` (protocol stripped)

```javascript
// Storage key: affoApplyMap (unified)
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
**Scenario**: Different fonts applied to multiple websites

```javascript
// Storage key: affoApplyMap (unified)  
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

## Migration Notes

### Storage Format Evolution
The extension has evolved through several storage format improvements:

1. **Original Format**: Mixed localStorage and browser.storage.local with nested `basicControls` objects
2. **Flattened Format**: Removed `basicControls` wrapper, eliminated redundant `activeControls`/`activeAxes` arrays
3. **Unified Format**: Migrated all storage to browser.storage.local with consistent object structures
4. **"No Key" Format**: Only store properties with actual values, no null/undefined properties



## Async Initialization Architecture

### Promise-based Flow Architecture ✅ **CURRENT SYSTEM**

The extension now uses a comprehensive Promise-based Flow architecture that eliminates race conditions throughout the entire codebase.

**Previous Problem (setTimeout-based timing):**
```javascript
// PROBLEMATIC - Race conditions throughout codebase
applyFontConfig(position, config);
setTimeout(() => updateButtons(), 50); // Hope DOM is ready
updateBodyButtons(); // Called immediately - reads stale state
```

**Current Solution (Promise-based Flow):**
```javascript
// SAFE - Explicit dependencies and sequential execution
await applyFontConfig(position, config);  // DOM updates complete
await updateButtons(position);           // Guaranteed fresh state
hideFavoritesPopup();                   // UI state is consistent
```

**Key Architectural Changes (2024 Promise Refactor):**
1. **Explicit Dependencies**: Every async operation returns a Promise
2. **Sequential Flow**: Related operations await their dependencies
3. **Atomic Operations**: CSS injection and font loading are awaitable
4. **Eliminated setTimeout Hacks**: All timing-based coordination removed
5. **Predictable State**: State changes happen in known, awaitable steps

**Core Functions Refactored:**
- ✅ `applyFontConfig()` - Clean async function with proper DOM waiting
- ✅ `loadFont()` and `selectFont()` - Full async/await conversion
- ✅ `updateBodyButtons()` and `updateAllThirdManInButtons()` - Async button state management
- ✅ `switchMode()` and `loadModeSettings()` - Coordinated mode transitions
- ✅ `applyFontToPage()` and CSS injection - Atomic page operations
- ✅ Storage operations - First-class Promise integration

**Race Condition Fixed:**
The original issue where reset buttons appeared inconsistently for different favorite types is now resolved:
- ✅ `applyFontConfig()` completes fully before `updateButtons()` functions run
- ✅ Control group state is read only after DOM updates are complete
- ✅ Favorites loading is atomic and sequential

**Benefits:**
- ✅ No race conditions possible by design
- ✅ User sees correct state immediately with no flicker
- ✅ Predictable, maintainable execution flow
- ✅ New features can be added without timing concerns


### Troubleshooting Storage Issues
If the extension behaves unexpectedly, clear stored data:
1. **UI State**: Clear `affoUIState` from browser.storage.local
2. **Domain Storage**: Clear `affoApplyMap` from browser.storage.local
3. **Mode Persistence**: Clear `affoCurrentMode` from browser.storage.local

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
Used throughout the system for font settings. The "no key" approach only stores properties with actual values - no null, undefined, or empty properties.

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
  "fontColor": "#333333",             // Font color (only if set, not 'default')
  "variableAxes": {                   // Variable font axes (only if axes are set)
    "wght": 400,                      // Weight axis (only if modified from default)
    "ital": 1                         // Italic axis (only if modified)
  }
}
```

**Font Selected with No Settings:**
```javascript
{
  "fontName": "Comic Neue"            // Font family name only
}
```

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
**Core Principle**: Only store properties with meaningful values - no null, undefined, empty arrays, or placeholder objects.

**Key Changes Made:**
- **Flattened Structure**: Removed `basicControls` wrapper - font properties stored directly on config object
- **Eliminated Redundant Arrays**: Removed `activeControls` and `activeAxes` arrays - active state derived from data presence
- **Consistent Format**: Both UI state and domain storage use identical object structures
- **Null-Free Storage**: Only properties with actual values are stored (no null/undefined properties)
- **Unified Storage**: All persistence uses `browser.storage.local` (migrated from localStorage)
- **Simplified Comparisons**: Direct object comparison between UI state and domain storage

**Technical Implementation:**
- `getCurrentUIConfig()`: Returns flattened config or `undefined` when no font selected
- `configsEqual()`: Uses helper functions `getActiveControlsFromConfig()` to derive active state
- Button logic: `undefined` vs `undefined` = no changes = no button shown
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

### Fontonic-Inspired Async Pattern

The extension follows the async pattern used by the Fontonic extension to eliminate race conditions between storage operations and UI updates.

**Problem with Previous Approach:**
```javascript
// PROBLEMATIC - Race conditions possible
await loadExtensionState();
await initializeModeInterface(); 
await restoreUIFromDomainStorage();
// UI updates could happen before storage completes
```

**Current Solution (Fontonic Pattern):**
```javascript
// SAFE - UI updates only happen INSIDE storage completion callbacks
loadExtensionState().then(() => {
    return initializeModeInterface();
}).then(() => {
    return restoreUIFromDomainStorage();
}).then(() => {
    // ONLY NOW show UI - everything is ready
    document.body.style.visibility = 'visible';
    initializationComplete = true;
});
```

**Key Principles:**
1. **UI stays hidden** until ALL async operations complete
2. **Chain operations** using `.then()` to ensure proper sequencing
3. **UI updates happen INSIDE callbacks** - no race conditions possible
4. **Error handling** with `.catch()` to show UI even if initialization fails

**Benefits:**
- ✅ No race conditions between user interaction and storage restoration
- ✅ User sees correct domain-specific state immediately when UI appears
- ✅ Simple, predictable initialization flow
- ✅ Follows proven pattern from Fontonic extension


### Troubleshooting Storage Issues
If the extension behaves unexpectedly, clear stored data:
1. **UI State**: Clear `affoUIState` from browser.storage.local
2. **Domain Storage**: Clear `affoApplyMap` from browser.storage.local
3. **Mode Persistence**: Clear `affoCurrentMode` from browser.storage.local
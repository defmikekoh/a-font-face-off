# A Font Face-off Data Structures Documentation

This document outlines the key data structures used in the A Font Face-off browser extension for font management and persistence.

## Storage Systems

The extension uses a unified storage architecture with `browser.storage.local` for all persistence:

### 1. Third Man In Mode Domain Storage (`affoApplyMapV2`)
**Purpose**: Stores Third Man In mode fonts applied to specific domains/websites
**Storage Location**: `browser.storage.local`
**Key**: `affoApplyMapV2`

```javascript
{
  "https://example.com": {
    "third-man-in": {
      "serif": {
        "fontName": "PT Serif", 
        "fontSize": 18,
        "variableAxes": {"wdth": 90, "grad": 150}
      },
      "sans": {
        "fontName": "Comic Neue"
      }
      // "mono" key omitted when no mono font is configured
    }
  }
}
```

### 2. Body Mode Domain Storage (`affoApplyMap`)
**Purpose**: Stores body mode fonts applied to specific domains
**Storage Location**: `browser.storage.local`  
**Key**: `affoApplyMap`

```javascript
{
  "https://example.com": {
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
- `getApplyMapForOrigin(origin, mode)`: Retrieve from `affoApplyMapV2`
- `saveApplyMapForOrigin(origin, mode, config)`: Save to `affoApplyMapV2`
- `clearApplyMapForOrigin(origin, mode, fontType)`: **Domain storage only** - Clear specific font type or all fonts from `affoApplyMapV2`
- `clearAllThirdManInFonts(origin)`: **Domain storage only** - Helper to clear all Third Man In fonts (serif, sans, mono) at once

#### Body Mode (Inline Storage)
- Uses direct `browser.storage.local.get('affoApplyMap')` and `browser.storage.local.set({ affoApplyMap: applyMap })` 
- Storage logic embedded directly in `toggleApplyToPage` function
- No centralized helper functions

#### Key Differences Between Storage Systems

| Aspect | Body Mode (`affoApplyMap`) | Third Man In Mode (`affoApplyMapV2`) |
|--------|---------------------------|-------------------------------------|
| **Storage Key** | `affoApplyMap` | `affoApplyMapV2` |
| **Storage Method** | Inline code in `toggleApplyToPage` | Centralized functions (`saveApplyMapForOrigin`, etc.) |
| **Data Structure** | `domain → fontType → config` | `domain → mode → fontType → config` |
| **Modes Supported** | Body mode only | Third Man In mode only |
| **Font Types** | `body` | `serif`, `sans`, `mono` |
| **Schema Version** | V1 (original) | V2 (extended) |
| **Code Location** | `popup.js:2565, 2792` | `popup.js:5190-5200` |

### State Management

#### UI State (browser.storage.local) Functions
- `loadExtensionState()`: **UI state only** - Load from `affoUIState` key in browser.storage.local
- `saveExtensionState()`: **UI state only** - Save to `affoUIState` key in browser.storage.local
- `getCurrentUIConfig(position)`: **UI state only** - Get current font configuration from UI

#### Functions that modify BOTH Domain Storage AND UI State
- `resetAllThirdManInFonts()`: Clears domain storage + resets UI to `null` state
- `applyUnsetSettings(panelId)`: Clears domain storage + resets UI to `null` state  
- `toggleThirdManInFont(fontType)`: Updates domain storage + applies/removes CSS from webpage

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
- `toggleThirdManInFont(fontType)`: Apply/unapply Third Man In fonts
- `toggleApplyToPage(position)`: Apply/unapply Body/Face-off fonts
- `applyAllThirdManInFonts()`: Apply all Third Man In font changes

## Storage Schema Versions

- **V1 (`affoApplyMap`)**: Original schema used for Body mode
- **V2 (`affoApplyMapV2`)**: Extended schema for Third Man In mode only

## Example Domain Storage Data

### Body Mode Example
**Scenario**: Body mode with Merriweather 16px applied to `https://example.com`

```javascript
// Storage key: affoApplyMap
{
  "https://example.com": {
    "body": {
      "fontName": "Merriweather",
      "fontSize": 16
    }
  }
}
```

### Third Man In Mode Example  
**Scenario**: Third Man In mode with Noto Sans 17px and Noto Serif 18px applied to `https://example.com`

```javascript
// Storage key: affoApplyMapV2
{
  "https://example.com": {
    "third-man-in": {
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
}
```

### Multiple Domains Example
**Scenario**: Different fonts applied to multiple websites

```javascript
// Storage key: affoApplyMapV2  
{
  "https://example.com": {
    "third-man-in": {
      "sans": {
        "fontName": "Noto Sans",
        "fontSize": 17
      }
    }
  },
  "https://github.com": {
    "third-man-in": {
      "mono": {
        "fontName": "Fira Code",
        "variableAxes": {"wght": 400}
      }
    }
  },
  "https://news.ycombinator.com": {
    "third-man-in": {
      "serif": {
        "fontName": "PT Serif"
      },
      "sans": {
        "fontName": "Inter",
        "fontSize": 15
      }
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

### Legacy Compatibility
The extension includes backward compatibility for:
- Legacy font-variation-settings CSS strings (replaced with `variableAxes` objects)
- Legacy `fontVariationSettings` CSS strings (replaced with `variableAxes` objects)
- Old localStorage keys (migrated to browser.storage.local keys with `affo*` prefix)

## Storage Operation Queue

### Race Condition Prevention
The extension implements a storage operation queue to prevent async race conditions in `browser.storage.local` operations:

```javascript
// Storage operation queue to prevent race conditions
class StorageQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }

    async enqueue(operation) {
        return new Promise((resolve, reject) => {
            this.queue.push({ operation, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        while (this.queue.length > 0) {
            const { operation, resolve, reject } = this.queue.shift();
            try {
                const result = await operation();
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }
        this.processing = false;
    }
}

const storageQueue = new StorageQueue();

// Queued storage operations wrapper
const queuedStorage = {
    async get(keys) { return storageQueue.enqueue(() => browser.storage.local.get(keys)); },
    async set(items) { return storageQueue.enqueue(() => browser.storage.local.set(items)); },
    async remove(keys) { return storageQueue.enqueue(() => browser.storage.local.remove(keys)); },
    async clear() { return storageQueue.enqueue(() => browser.storage.local.clear()); }
};
```

### Why Storage Queue is Needed

**Problem**: When UI state was migrated from `localStorage` to `browser.storage.local`, async operations created race conditions:
- Multiple rapid Apply button clicks would create concurrent storage operations
- Both operations read same initial storage state
- Resulted in toggle behavior instead of consistent apply behavior
- User needed to click Apply twice to get Reset button

**Solution**: All storage operations are now serialized through `queuedStorage`:
- Operations execute one at a time in order
- Each operation sees the updated state from previous operations
- Eliminates race conditions and ensures consistent behavior
- Apply button works correctly with single click

**Implementation**: All `browser.storage.local.*` calls replaced with `queuedStorage.*` throughout the codebase.

### Troubleshooting Storage Issues
If the extension behaves unexpectedly, clear stored data:
1. **UI State**: Clear `affoUIState` from browser.storage.local
2. **Domain Storage**: Clear `affoApplyMap` and `affoApplyMapV2` from browser.storage.local
3. **Mode Persistence**: Clear `affoCurrentMode` from browser.storage.local
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
| `affoCss2UrlCache` | Global cache of Google Fonts css2 URLs (fontName → URL). Written by popup.js (`storeCss2UrlInCache`) and background.js (`ensureCss2UrlCached` during Quick Pick). Read by left-toolbar.js (early preload), content.js (font loading). Not synced. | `{"Roboto Slab": "https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@100..900&display=swap"}` |
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

### Cloud Sync Remote File Mapping

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

See `docs/architecture/SYNC.md` for backend interface details and sync algorithm.

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
  "letterSpacing": 0.05,             // Letter spacing in em (only if set; 0 is valid)
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

# Font Loading Architecture

This document explains how font loading works in the A Font Face-off extension, comparing Google Fonts with custom fonts, and the differences between Body Mode and Third Man In mode.

## Overview

The extension supports two types of fonts:
- **Google Fonts**: Loaded via Google's CDN with dynamic CSS2 URLs
- **Custom Fonts**: Self-hosted fonts with embedded @font-face rules

## Google Fonts Loading Process

### 1. CSS2 URL Generation
```javascript
// Google Fonts use dynamic CSS2 URLs
buildCss2Url(fontName).then(css2Url => {
    // Creates URLs like:
    // https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap
})
```

### 2. Font Link Injection
```javascript
const linkScript = `
    var linkId = 'a-font-face-off-style-${fontType}-link';
    var existing = document.getElementById(linkId);
    if (existing) existing.remove();
    
    var link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = '${css2Url}';  // Google Fonts CSS URL
    document.head.appendChild(link);
`;
```

### 3. CSS Generation
```javascript
// Generates CSS that uses the font
const css = `
    body { 
        font-family: "${fontName}" !important; 
    }
`;
// No @font-face needed - Google provides it via the link
```

## Custom Fonts Loading Process (BBC Reith Serif, FK Roman Standard Trial, etc.)

### 1. Font Face Rule Inclusion
```javascript
const payload = {
    fontName: "BBC Reith Serif",
    fontFaceRule: `@font-face {
        font-family: "BBC Reith Serif";
        src: url("https://static.files.bbci.co.uk/fonts/reith/2.512/BBCReithSerif_W_Rg.woff2");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
    }
    // ... multiple @font-face declarations for different weights
    `
};
```

### 2. CSS Generation with Font Face
```javascript
function generateBodyContactCSS(payload) {
    const lines = [];
    
    // Font face definition injected first
    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);  // BBC's @font-face rules
    }
    
    // Then the font-family CSS
    lines.push(`body { font-family: "${payload.fontName}" !important; }`);
    
    return lines.join('\n');
}
```

### 3. Direct CSS Injection
```javascript
// Final injected CSS contains both @font-face AND font-family
browser.tabs.insertCSS({ 
    code: `
        @font-face { 
            font-family: "BBC Reith Serif"; 
            src: url("...BBC font file..."); 
        }
        body { 
            font-family: "BBC Reith Serif" !important; 
        }
    `
});
```

## Mode-Specific Differences

### Body Mode Font Loading

**1. Single Generic Key:**
```javascript
// Body mode uses "body" as the generic key
const genericKey = (position === 'top') ? 'serif' :
                  (position === 'body') ? 'body' : 'sans';  // Always "body"
```

**2. CSS Generation:**
```javascript
// Uses Body Contact specific CSS generator
if (position === 'body') {
    css = generateBodyContactCSS(payload);  // Body-specific CSS
} else {
    css = generateBodyCSS(payload, position);  // Face-off CSS
}
```

**3. CSS Target:**
```javascript
// generateBodyContactCSS targets body element directly
function generateBodyContactCSS(payload) {
    // Font face definition if needed
    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);
    }
    
    lines.push(`body { font-family: "${payload.fontName}" !important; }`);
    // Direct body targeting
}
```

### Third Man In Mode Font Loading

**1. Font Type Specific Keys:**
```javascript
// Third Man In uses specific font types: "serif", "sans", "mono"
const fontType = panelId;  // "serif", "sans", or "mono"
```

**2. CSS Generation:**
```javascript
// Uses Third Man In specific CSS generator
const css = generateThirdManInCSS(fontType, payload);
```

**3. CSS Target with Data Attributes:**
```javascript
function generateThirdManInCSS(fontType, payload) {
    // Font face definition if needed  
    if (payload.fontFaceRule) {
        lines.push(payload.fontFaceRule);
    }
    
    // Targets elements marked with data attributes
    lines.push(`[data-affo-font-type="${fontType}"] { font-family: "${payload.fontName}" !important; }`);
    // Attribute-based targeting
}
```

**4. Content Script Integration:**
```javascript
// Third Man In relies on content script to mark elements
// content.js marks elements with data-affo-font-type="serif|sans|mono"
```

## Font Loading Mechanisms Comparison

Both modes share the **same underlying font loading logic**:

**Google Fonts (Both Modes):**
```javascript
// Same buildCss2Url() and link injection
buildCss2Url(fontName).then(css2Url => {
    // Creates <link> element for Google Fonts CSS
});
```

**Custom Fonts (Both Modes):**
```javascript
// Same fontFaceRule injection
if (payload.fontFaceRule) {
    lines.push(payload.fontFaceRule);  // BBC, FK Roman, etc.
}
```

## Summary Table

| Aspect | Google Fonts | Custom Fonts (BBC Reith, etc.) |
|--------|--------------|--------------------------------|
| **Font File Hosting** | Google's CDN | BBC/External CDN |
| **CSS Delivery** | External `<link>` element | Inline CSS injection |
| **@font-face Rules** | Provided by Google's CSS | Stored in extension code |
| **Font Discovery** | Dynamic via Google Fonts API | Static definitions |
| **Caching** | Browser + Google CDN | Browser only |
| **Network Requests** | 2 requests (CSS + font files) | 1 request per font file |

| Aspect | Body Mode | Third Man In Mode |
|--------|-----------|-------------------|
| **CSS Function** | `generateBodyContactCSS()` | `generateThirdManInCSS()` |
| **CSS Target** | `body { }` | `[data-affo-font-type="serif"] { }` |
| **Storage Key** | `"body"` | `"serif"`, `"sans"`, `"mono"` |
| **Element Selection** | All body content | Content script marks elements |
| **Content Script** | Not required | Required for element marking |
| **Font Types** | Single font for everything | Different fonts per type |

## Key Takeaways

**Font loading mechanism is identical** (Google Fonts via links, custom fonts via @font-face injection), but **CSS application is different**:

- **Body Mode**: Applies one font to the entire `body` element
- **Third Man In**: Applies different fonts to elements marked by the content script based on their semantic type (serif for articles, sans for UI, mono for code)

Both modes use the same `fontFaceRule` system for custom fonts like BBC Reith Serif, FK Roman Standard Trial, ABC Ginto Normal Unlicensed Trial, and National.
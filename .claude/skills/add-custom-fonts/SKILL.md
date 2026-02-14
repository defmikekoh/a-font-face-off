---
name: add-custom-fonts
description: Add @font-face rules for custom fonts not on Google Fonts, including extracting fonts from websites and converting local woff2/woff files to base64 data URLs
---

# Adding Custom Font-Face Declarations

Add @font-face rules to the user's custom CSS (stored in `affoCustomFontsCss`, editable via Options → CSS tab) for fonts not available on Google Fonts (site-specific, proprietary, or CDN-hosted fonts). The packaged starter file is `custom-fonts-starter.css`.

## When to Use

When the user wants to add a font they've seen on a website that isn't available through Google Fonts. Typically they'll provide a URL and ask to extract the fonts.

## Extracting Fonts from a Website

### Method 1: Selenium (preferred)

Use Selenium to load the page and extract @font-face rules from all stylesheets:

```python
result = driver.execute_script('''
    var fonts = [];
    for (var i = 0; i < document.styleSheets.length; i++) {
        try {
            var rules = document.styleSheets[i].cssRules;
            for (var j = 0; j < rules.length; j++) {
                if (rules[j] instanceof CSSFontFaceRule) {
                    var style = rules[j].style;
                    fonts.push({
                        family: style.getPropertyValue('font-family'),
                        src: style.getPropertyValue('src'),
                        weight: style.getPropertyValue('font-weight'),
                        style: style.getPropertyValue('font-style'),
                        stretch: style.getPropertyValue('font-stretch'),
                        cssText: rules[j].cssText
                    });
                }
            }
        } catch(e) { /* cross-origin */ }
    }
    return JSON.stringify(fonts, null, 2);
''')
```

Some sites block Selenium. If this happens, try Method 2.

### Method 2: curl + regex

```bash
curl -s -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "URL" \
  | python3 -c "
import sys, re
html = sys.stdin.read()
blocks = re.findall(r'@font-face\s*\{[^}]+\}', html)
for b in blocks:
    print(b)
    print('---')
"
```

This finds @font-face blocks in inline `<style>` tags. For fonts loaded via external CSS links, you may need to fetch those CSS files separately.

## Writing @font-face Rules

### Static Fonts

Follow the existing pattern — one rule per weight/style combination:

```css
@font-face {
  font-family: "Font Name";
  src: url("https://cdn.example.com/font-regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Font Name";
  src: url("https://cdn.example.com/font-bold.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
```

**Rules:**
- Always include `font-display: swap`
- Use `format("woff2")` when the URL is a .woff2 file
- Each weight/style combo gets its own @font-face block
- Font family names should be quoted with double quotes

### CORS-Restricted CDNs

If the font CDN lacks `Access-Control-Allow-Origin` headers (e.g. AP News on `assets.apnews.com`), `@font-face` rules with remote URLs won't load in the extension popup. In this case, **embed the font data directly as base64 data URLs**:

```bash
# Download the font file
curl -o /tmp/font.woff2 "https://cdn.example.com/font.woff2"

# Convert to data URL
echo -n "data:font/woff2;base64," > /tmp/font-dataurl.txt
base64 -i /tmp/font.woff2 | tr -d '\n' >> /tmp/font-dataurl.txt
```

Then use the data URL in the `src`:

```css
@font-face {
  font-family: "Font Name";
  src: url("data:font/woff2;base64,d09GMgABA...") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

To check if a CDN has CORS headers: `curl -sI "https://cdn.example.com/font.woff2" | grep -i access-control`. If no `Access-Control-Allow-Origin` header is present, use data URLs.

**Important:** Firefox extension popups won't render fonts from `data:` URLs in `@font-face`, even with `data:` in CSP `font-src`. The CSS file should still use data URLs for storage, but at injection time `ensureCustomFontInjected(fontName)` in popup.js converts them to blob URLs (`atob` → `Uint8Array` → `Blob` → `URL.createObjectURL`). This requires `blob:` in CSP `font-src` (already configured in manifest.json). This conversion happens automatically — no extra work needed when adding fonts with data URLs.

### Converting Local Font Files to Base64 Data URLs

When you have a locally downloaded `.woff2` or `.woff` file and need to embed it as a data URL in `custom-fonts.css`:

#### woff2 files

```bash
# Convert a local woff2 file to a data URL
echo -n 'url("data:font/woff2;base64,' > ztemp/font-dataurl.txt
base64 -i /path/to/font.woff2 | tr -d '\n' >> ztemp/font-dataurl.txt
echo -n '") format("woff2")' >> ztemp/font-dataurl.txt
```

#### woff files

```bash
# Convert a local woff file to a data URL
echo -n 'url("data:font/woff;base64,' > ztemp/font-dataurl.txt
base64 -i /path/to/font.woff | tr -d '\n' >> ztemp/font-dataurl.txt
echo -n '") format("woff")' >> ztemp/font-dataurl.txt
```

The output in `ztemp/font-dataurl.txt` is the complete `src` value ready to paste into an @font-face rule:

```css
@font-face {
  font-family: "Font Name";
  src: url("data:font/woff2;base64,d09GMgABA...") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

#### When to use data URLs vs remote URLs

- **Remote URL** (preferred): When the font is hosted on a CDN with proper CORS headers (`Access-Control-Allow-Origin`). Keeps the CSS file small.
- **Data URL** (fallback): When the CDN lacks CORS headers, or the font is only available locally. Results in large CSS but ensures the font always loads.

To check CORS: `curl -sI "https://cdn.example.com/font.woff2" | grep -i access-control`

### Condensed / Stretched Variants

Sites may use `font-stretch` to differentiate condensed variants. Since the extension's font picker doesn't support `font-stretch` as a selector, split these into **separate font families**:

```css
/* DON'T: use font-stretch (won't work in the extension) */
@font-face {
  font-family: "AP";
  font-stretch: condensed;
  src: url("...condensed.woff2");
}

/* DO: use separate family names */
@font-face {
  font-family: "AP Condensed";
  src: url("...condensed.woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

### Variable Fonts

Variable fonts contain multiple axes (weight, width, etc.) in a single file. They need **two things**:

#### 1. The @font-face rule

Same as static fonts — just one rule since it's one file:

```css
@font-face {
  font-family: "APVar";
  src: url("https://example.com/font-variable.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

#### 2. Axis metadata in `CUSTOM_FONT_AXES` (popup.js)

Without this, the extension treats the font as static (no axis sliders). Add an entry to the `CUSTOM_FONT_AXES` constant near the top of `popup.js`:

```javascript
const CUSTOM_FONT_AXES = {
    'APVar': {
        axes: ['wght', 'wdth'],
        defaults: { wght: 400, wdth: 100 },
        ranges:   { wght: [100, 900], wdth: [35, 100] },
    },
    // Add new variable fonts here
};
```

**To find the axis values**, inspect the font file's `fvar` table:

```bash
pip3 install fonttools brotli  # one-time setup
python3 -c "
from fontTools.ttLib import TTFont
font = TTFont('path/to/font.woff2')
if 'fvar' in font:
    for axis in font['fvar'].axes:
        print(f'{axis.axisTag}: min={axis.minValue} default={axis.defaultValue} max={axis.maxValue}')
else:
    print('Not a variable font')
"
```

Or download it first:
```bash
curl -o /tmp/font.woff2 "https://example.com/font.woff2"
```

**Common axes:**

| Tag | CSS Property | Typical Range |
|-----|-------------|---------------|
| `wght` | font-weight | 100–900 |
| `wdth` | font-stretch | 25–200 (percentage) |
| `slnt` | font-style: oblique | -90–90 (degrees) |
| `ital` | font-style: italic | 0–1 |
| `opsz` | font-optical-sizing | varies |

Step sizes are automatic — they come from `AXIS_STEP_DEFAULTS` in popup.js (e.g., wght=1, wdth=0.1).

## "m" Variant Pattern

Some fonts in the file have a duplicate family with " m" suffix (e.g., "TiemposText" and "TiemposText m"). The "m" variant includes additional intermediate weights (e.g., 300, 500) for finer control. This is an optional pattern — only add it when extra weight files are available.

## Verification

After adding fonts, the user should test with `web-ext run`:
1. Open the extension popup
2. The new font should appear in the "Pinned" section of the font picker
3. Select it and verify it loads and applies correctly
4. For variable fonts: verify axis sliders appear and work

No lint or test changes needed — custom font CSS is not linted.

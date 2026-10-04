# Variable Font Axes

## Dual CSS Strategy

Registered axes (`wght`, `wdth`, `slnt`, `opsz`, and true variable `ital` axes) map to high-level CSS properties (`font-weight`, `font-stretch`, `font-style`) AND are also included in `font-variation-settings` via `buildAllAxisSettings()`. This dual strategy keeps high-level properties for cascade/inheritance while bypassing `@font-face` descriptor clamping (e.g. Google Fonts serving `font-weight: 400` single-value descriptors that silently clamp `font-weight: 470` to 400).

Custom axes use only `font-variation-settings`. Only "activated" axes get applied. Metadata comes from `data/gf-axis-registry.json`.

### Independent weight controls

Basic **Font Weight (`font-weight`)** stores `fontWeight`, the requested CSS weight used for face selection. **Weight (`wght`)** stores `variableAxes.wght`, an explicit axis override for fonts supporting it. Both controls remain independent and can be saved together, including different values. No migration merges them.

- Basic weight only: emit `font-weight`.
- Axis weight only: emit both `font-weight` and `font-variation-settings: "wght"` at the axis value.
- Both active: emit `font-weight` from the basic control and `"wght"` from the axis control. The explicit axis controls rendered weight when supported; basic weight still participates in face selection and applies to fonts without that axis.
- Resetting the axis omits `wght` and returns rendered-weight control to `font-weight`.

`getRequestedCssWeight()` resolves the high-level CSS request, giving `fontWeight` priority and otherwise using `wght`. `getExplicitAxisWeight()` reads only the explicit axis. The popup shows **Overridden by wght: …** beside the basic control when both are active. Preview CSS follows the same rules as page CSS. Bold overrides continue to set both CSS weight and the `wght` axis to 700 while retaining other active axes.

Google Fonts `ital` in a CSS2 URL can mean "request the static italic files for this family"; that does not make it a variable axis. Static italic is stored as the basic primitive `fontStyle: "italic"`. A slider is created only for tags that appear in the family metadata `axes` list, such as `slnt` on the small set of slanted variable families.

### Style, italic design, and slant

`fontStyle: "italic"` requests an italic face. Explicit `variableAxes.ital` controls the selected variable font's italic design and is preserved independently, including 0 (upright) and 1 (italic). Explicit axis values are never folded into the basic style. With no basic italic request, `ital >= 1` also requests an italic face.

`variableAxes.slnt` controls the angle independently of the italic design. OpenType and CSS use opposite angle signs: `"slnt" -10` corresponds to `font-style: oblique 10deg`. The popup, generated/inline page CSS, WhatFont detection, and descriptor-derived ranges use this conversion. Explicit zero requests `oblique 0deg` when no italic face is requested. With basic Italic active, CSS requests the italic face and retains the explicit slant axis.

The popup explains active `ital`/`slnt` axes beside Font Style. Emphasis rules set an existing `ital` axis to 1 and retain nonzero slant. They remove an explicit zero-slant override and let `font-style: italic` select a supported face/axis value rather than guessing −10°. If no axes remain, they emit `font-variation-settings: normal` to clear the inherited override. The browser handles the font's supported range; no derived range metadata is stored in configs.

## WhatFont Axis Detection

WhatFont (`whatfont_core.js`) detects registered axes by reading their high-level CSS properties (`font-weight`, `font-stretch`, `font-style`) and mapping non-default values back to axis tags, since browsers don't expose them in `font-variation-settings`.

- `detectVariableAxes()` checks both `font-variation-settings` (custom axes) AND high-level CSS properties (registered axes)
- Only reports non-default values (wght≠400, wdth≠100%, slnt with oblique angle)
- CSS property check skipped if axis already found in `font-variation-settings` (no double-reporting)
- The one-shot WhatFont → Face-off handoff fetches the selected page-font binary and reads its OpenType `fvar` axis records. For WOFF2 files, `page-font-utils.js` parses the table directory and uses the browser's native Brotli `DecompressionStream`; it does not reconstruct unrelated transformed glyph tables.
- Binary `fvar` metadata is authoritative for axis tags, ranges, and defaults. Descriptor-derived `wght`, `wdth`, and `slnt` ranges remain as a fallback and can supplement axes not present in the parsed binary metadata.

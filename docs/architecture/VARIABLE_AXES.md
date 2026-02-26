# Variable Font Axes

## Dual CSS Strategy

Registered axes (`wght`, `wdth`, `slnt`, `ital`, `opsz`) map to high-level CSS properties (`font-weight`, `font-stretch`, `font-style`) AND are also included in `font-variation-settings` via `buildAllAxisSettings()`. This dual strategy keeps high-level properties for cascade/inheritance while bypassing `@font-face` descriptor clamping (e.g. Google Fonts serving `font-weight: 400` single-value descriptors that silently clamp `font-weight: 470` to 400).

Custom axes use only `font-variation-settings`. Only "activated" axes get applied. Metadata comes from `data/gf-axis-registry.json`.

## WhatFont Axis Detection

WhatFont (`whatfont_core.js`) detects registered axes by reading their high-level CSS properties (`font-weight`, `font-stretch`, `font-style`) and mapping non-default values back to axis tags, since browsers don't expose them in `font-variation-settings`.

- `detectVariableAxes()` checks both `font-variation-settings` (custom axes) AND high-level CSS properties (registered axes)
- Only reports non-default values (wght≠400, wdth≠100%, slnt with oblique angle)
- CSS property check skipped if axis already found in `font-variation-settings` (no double-reporting)

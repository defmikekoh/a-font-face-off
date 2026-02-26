# CSS Generation (css-generators.js)

Shared CSS generation functions used by popup.js and content.js (each has its own copy since they run in different contexts).

## Constants

- **`GUARD_EXCLUDE`** — `:not([data-affo-guard]):not([data-affo-guard] *)`. Appended to all broad CSS selectors (Body mode `sel`/`weightSel`, Body Contact `selector`/`weightSelector`) to prevent the extension's own injected CSS from matching guarded overlays (e.g. quick pick panel).

## Registered vs Custom Axes

Registered OpenType axes map to high-level CSS properties AND are also included in `font-variation-settings` (via `buildAllAxisSettings`). This dual strategy keeps high-level properties for cascade/inheritance while bypassing `@font-face` descriptor clamping — e.g. Google Fonts serving `font-weight: 400` single-value `@font-face` descriptors that silently clamp `font-weight: 470` to 400. Per CSS Fonts L4 §7.2, `font-variation-settings` (Step 12) overrides `font-weight` (Step 2), ensuring the raw axis value is used.

| Axis | High-level CSS Property | Also in `font-variation-settings`? |
|------|-------------|----|
| `wght` | `font-weight: 380` | `"wght" 380` |
| `wdth` | `font-stretch: 90%` | `"wdth" 90` |
| `slnt` | `font-style: oblique -12deg` | `"slnt" -12` |
| `ital` | `font-style: italic` | `"ital" 1` |
| `opsz` | `font-optical-sizing: auto` | `"opsz" 14` |
| `GRAD`, `CASL`, etc. | — | `"GRAD" 150` |

**Detection note:** Browsers don't expose registered axes in `font-variation-settings` — they're resolved into the high-level CSS properties above. WhatFont's `detectVariableAxes()` reads both `font-variation-settings` (for custom axes) and the high-level CSS properties (for registered axes), mapping non-default values back to axis tags (e.g., `font-stretch: 75%` → `wdth: 75`).

## Helper Functions

- **`getEffectiveWeight(config)`** — Returns numeric weight or `null`. Checks `config.fontWeight` first (basic weight control), falls back to `config.variableAxes.wght` (variable axis slider).
- **`getEffectiveWidth(config)`** — Same pattern for wdth. Checks `config.wdthVal` then `config.variableAxes.wdth`. (Legacy `wdthVal` only exists in old stored domain data; new payloads use `variableAxes` exclusively.)
- **`getEffectiveSlant(config)`** — Same pattern for slnt. (Legacy `slntVal` — same note as wdth.)
- **`getEffectiveItalic(config)`** — Same pattern for ital. (Legacy `italVal` — same note as wdth.)
- **`buildAllAxisSettings(config)`** — Returns array of `'"axis" value'` strings for ALL axes (registered + custom) from `config.variableAxes`. Used by all CSS generators so that `font-variation-settings` bypasses `@font-face` descriptor clamping.
- **`buildCustomAxisSettings(config)`** — Backward-compatible: returns array of `'"axis" value'` strings for custom axes only. Filters out all registered axes (`wght`, `wdth`, `slnt`, `ital`, `opsz`) from `config.variableAxes`.
- **`buildItalicProps(payload, imp, weightOverride?)`** — Returns array of CSS property strings for italic/bold-italic rules. Always includes `font-style: italic`. For variable fonts: forces `ital` axis to `1`, forces `slnt` to `-10` if at default `0`, overrides `wght` axis when `weightOverride` is provided (for bold-italic).

## Italic & Bold-Italic Override Strategy

All three CSS generators produce explicit rules for italic elements (`<em>`, `<i>`) and bold-italic combinations (`<strong>/<b>` containing `<em>/<i>`). This ensures replaced fonts render true italic instead of relying on browser synthesis:

- **Italic rule**: `:where(em, i)` gets `font-style: italic` plus variable font axis overrides (`ital` forced to `1`, `slnt` forced to `-10` if at default)
- **Bold-italic rule**: `:where(strong, b) :where(em, i)` gets italic props plus `font-weight: 700` with `wght` axis override
- Built via `buildItalicProps(payload, imp, weightOverride?)` in `css-generators.js`
- TMI mode uses `[data-affo-font-type]` attribute selectors; body/body-contact use `body :where(...)` descendant selectors

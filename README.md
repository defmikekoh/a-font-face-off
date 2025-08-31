# A Font Face-off — Compare Fonts Side‑by‑Side

Compare two fonts quickly and explore their variable axes directly in your browser. Pick any Google Font at runtime (no rebuilds), or try the built‑in custom fonts, then tune weight, width, optical size, and other axes to see exactly how they render in your sample text.

## Highlights

- Pick any Google Font at runtime via the Font Picker modal (search + A–Z rail)
- Variable axes sliders generated automatically from the font’s fvar table (exact min/default/max)
- Works even when Google serves WOFF2 only (bundled WOFF2→TTF decoder + opentype.js)
- Only axes you “activate” get applied, so defaults stay true until you tweak them
- Per‑panel favorites (save, load, edit) and persistent state across sessions
- Custom font hosts supported (not bundled): BBC Reith Serif (static.files.bbci.co.uk), ABC Ginto Normal Unlicensed Trial (fonts.cdnfonts.com)

Note: No font files are packaged in the extension; all fonts are fetched at runtime from their original hosts.

## License

This is an experimental extension intended for personal/educational use.

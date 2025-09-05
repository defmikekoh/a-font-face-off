# A Font Face-off — Replace Fonts and Compare Fonts Side‑by‑Side

Replace fonts in existing web pages.

Compare fonts quickly and explore their variable axes directly in your browser. Pick any Google Font at runtime (no rebuilds), or try the referenced custom fonts, then tune weight, width, optical size, and other axes to see exactly how they render in your sample text.

## Highlights

- Pick any Google Font at runtime via the Font Picker modal (search + A–Z rail)
- Variable axes sliders generated automatically from Google Fonts metadata (tags, ranges, defaults)
- No remote probing or binary parsing; fonts load via css2 and CSP only
- Only axes you “activate” get applied, so defaults stay true until you tweak them
- Body Contact and Third Man In modes: Apply fonts to the current page (per‑origin) with Apply/Reset button states
- Per‑panel favorites (save, load, edit) and persistent state across sessions (drag‑to‑reorder in Edit Favorites)
- Custom font hosts supported (not bundled): BBC Reith Serif (static.files.bbci.co.uk), ABC Ginto Normal Unlicensed Trial (fonts.cdnfonts.com)

Note: No font files are packaged in the extension; all fonts are fetched at runtime from their original hosts.

## License

This is an experimental extension intended for personal/educational use.

## View Modes

- **Body Contact**: Single font panel for setting the primary reading font on the active page. Apply fonts to typical body text with intelligent Apply/Reset button behavior based on current vs. saved settings.
- **Face-off**: Compare two fonts side‑by‑side inside the popup (ABeeZee vs Zilla Slab Highlight by default) without touching the page. Pure comparison mode for font evaluation.
- **Third Man In**: Three-panel layout targeting specific font families: Serif, Sans-serif, and Monospace. Each panel applies independently to its respective font family type on the page.

Toggle modes with the tabs at the top of the popup.

## Body Contact Mode

- **Apply/Reset Logic**: Buttons appear dynamically based on panel vs. saved settings:
  - No button when both panel and domain are unset
  - Reset button when panel matches saved domain settings
  - Apply button when panel differs from domain settings
  - Loading states during operations
- **Scope**: Only typical body text is affected; headings, code/monospace, nav/UI, and form controls are excluded.
- **Persistence**: Settings saved per-origin and reloaded on revisit.

## Face-off Mode

- Pure comparison mode with no page interaction
- Use the left/right grips to open each panel, pick fonts, and tune variable axes
- Changes update the sample text immediately inside the popup
- Defaults to ABeeZee (16px, line-height 1.6) vs Zilla Slab Highlight (16px, line-height 1.6)

## Third Man In Mode  

- **Three Panels**: Serif, Sans-serif, and Monospace font controls
- **Independent Application**: Each panel applies to its respective font family type on the page
- **Responsive Layout**: Panels resize based on available space (80% on phones, 33.333% on desktop)
- **Same Apply/Reset Logic**: Each panel has independent Apply/Reset button behavior
- **Grip Controls**: Middle grip allows expanding panels to 80% width for detailed work

## Favorites

- Save/Open buttons live inside each panel’s Font Selection section.
- Pencil button opens Edit Favorites where you can rename soon and reorder now (drag with the ⋮⋮ handle). Deleting updates order automatically.

## Performance & How It Works

- One injected `<style>` on the page (Facade) drives the change — no per‑node mutations.
- Fonts load via Google Fonts css2 and the `FontFace` API with a safe background fetch.
- See details in README‑font‑application.md.

## Scary install Required permissions

The install permissions are unfortunately scary looking. Given that the extension is intended to change fonts on any web page and persist across page reloads, they can not be reduced unfortuately. Given the scary permissions, no plans to make this a "real" extension. Only people fancy enough to install a signed xpi may do so. :)

CSS injected only to change fonts you choose. No tracking, no content collection. All code is open source.

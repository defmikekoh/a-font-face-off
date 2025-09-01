# A Font (Facade) Face-off — Replace Fonts and Compare Fonts Side‑by‑Side

Replace fonts in existing web pages.

Compare two fonts quickly and explore their variable axes directly in your browser. Pick any Google Font at runtime (no rebuilds), or try the referenced custom fonts, then tune weight, width, optical size, and other axes to see exactly how they render in your sample text.

## Highlights

- Pick any Google Font at runtime via the Font Picker modal (search + A–Z rail)
- Variable axes sliders generated automatically from Google Fonts metadata (tags, ranges, defaults)
- No remote probing or binary parsing; fonts load via css2 and CSP only
- Only axes you “activate” get applied, so defaults stay true until you tweak them
- Facade mode: Apply fonts to the current page (per‑origin) with Apply/Applied/Update buttons
- Per‑panel favorites (save, load, edit) and persistent state across sessions (drag‑to‑reorder in Edit Favorites)
- Custom font hosts supported (not bundled): BBC Reith Serif (static.files.bbci.co.uk), ABC Ginto Normal Unlicensed Trial (fonts.cdnfonts.com)

Note: No font files are packaged in the extension; all fonts are fetched at runtime from their original hosts.

## License

This is an experimental extension intended for personal/educational use.

## View Modes

- Facade: Set a reading face on the active page. Top panel maps to Serif, bottom panel maps to Sans Serif. Click Apply to inject the chosen font + settings into typical body text for the current site origin. The extension remembers your choice per‑origin and re‑applies it on load.
- Faceoff: Compare two fonts side‑by‑side inside the popup (“Top Font” and “Bottom Font”) without touching the page.

Toggle modes with the center button in the bottom strip of the popup.

## Facade Mode

- Apply: The Serif and Sans apply buttons change between Apply / Applied / Update based on whether your current UI settings match what’s saved for the site.
- Scope: Only typical body text is affected; headings, code/monospace, nav/UI, and form controls are excluded.
- Persistence: Mapped to the site’s origin in storage, so it reloads on revisit.
- Readiness: After Apply, the button waits for the font to be usable (`document.fonts.check`) before switching to Applied.

## Faceoff Mode

- Use the left/right grips to open each panel, pick fonts, and tune variable axes. Changes update the sample text immediately inside the popup.

## Favorites

- Save/Open buttons live inside each panel’s Font Selection section.
- Pencil button opens Edit Favorites where you can rename soon and reorder now (drag with the ⋮⋮ handle). Deleting updates order automatically.

## Performance & How It Works

- One injected `<style>` on the page (Facade) drives the change — no per‑node mutations.
- Fonts load via Google Fonts css2 and the `FontFace` API with a safe background fetch.
- See details in README‑font‑application.md.

## Scary install Required permissions

The install permissions are unfortunately scary looking. Given that the extension is intended to change fonts on any web page and persist across page reloads, they can not be reduced unfortuately.

CSS injected only to change fonts you choose. No tracking, no content collection. All code is open source.

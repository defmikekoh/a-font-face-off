<p align="center">
  <img src="src/icons/icon.svg" width="128" alt="A Font Face-off icon">
</p>

# A Font Face-off

**A Firefox Android extension that replaces fonts and changes font sizes on Firefox web pages and also can compare how they look on your Android device.**

<p align="center">
  <img src="docs/affo-face-off-mode.png" alt="A Font Face-off screenshot showing font comparison on Android" width="300">
  <img src="docs/affo-third-man-in-mode.png" alt="A Font Face-off screenshot from Note10" width="300" style="margin-left: 12px;">
  <img src="docs/affo-third-man-in-mode-selection.png" alt="A Font Face-off screenshot showing Third Man In mode selection" width="300" style="margin-left: 12px;">
</p>

Pick any Google Font at runtime, tune variable axes (weight, width, optical size, and more), and see how they actually render on real content. Just change the size if they're too small. No rebuilds, no font files bundled — everything loads on the fly. Even pick decimal size fonts to get the Goldilocks size.

I created this extension because looking at the Spectral font on my Android tablet on long articles made my eyes bleed.

## Three Ways to Use It

- **Body Contact** — Swap the reading font on any page. Settings persist per-site so your picks come back when you do.
- **Face-off** — Compare two fonts side-by-side in the popup. Pure comparison, no page changes.
- **Third Man In** — Three panels for Serif, Sans, and Mono. Each targets its font family type on the page independently.

## What Makes It Fun

- Full Google Fonts library at your fingertips via search + A-Z rail
- Variable axes sliders auto-generated from Google Fonts metadata. Go nuts on the Roboto Flex and Recursive fonts' multiple axes!
- Save favorites per panel, drag to reorder, load them back instantly
- Efficient CSS injection handles (mostly) everything — can adapt to aggressive style-clearing sites
- Add your own font-face css at-rules in the options UI!
- No tracking, no data collection — all code is open source

## Install

Firefox Android only. Download and install the signed `.xpi` directly.

## Acknowledgments

Built on the shoulders of:

- [Fontonic](https://github.com/amkhrjee/fontonic-firefox-android) by @amkhrjee — the main inspiration for this project
- [WhatFont Bookmarklet](https://github.com/chengyin/WhatFont-Bookmarklet) by @chengyin — packaged for font detection
- [Essential Buttons Toolbar](https://github.com/KristhianX/essential-buttons-toolbar) by @KristhianX — toolbar and options page UI

## License

MIT License - see [LICENSE](LICENSE) file for details.

⚠️ **Alpha Software**: This extension is experimental and under active development. Use at your own risk.

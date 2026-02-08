# A Font Face-off

**A Firefox Android extension that replaces and compares fonts on any web page.**

Pick any Google Font at runtime, tune variable axes (weight, width, optical size, and more), and see how they actually render on real content. No rebuilds, no font files bundled — everything loads on the fly. Even pick decimal size fonts to get the Goldilocks size.

I created this extension because looking at the Spectral font on my Android tablet on long articles made my eyes bleed.

## Three Ways to Use It

- **Body Contact** — Swap the reading font on any page. Settings persist per-site so your picks come back when you do.
- **Face-off** — Compare two fonts side-by-side in the popup. Pure comparison, no page changes.
- **Third Man In** — Three panels for Serif, Sans, and Mono. Each targets its font family type on the page independently.

## What Makes It Fun

- Full Google Fonts library at your fingertips via search + A-Z rail
- Variable axes sliders auto-generated from Google Fonts metadata
- Save favorites per panel, drag to reorder, load them back instantly
- One injected `<style>` drives everything — no per-node DOM mutations
- Custom font hosts supported (BBC Reith, Graphik Trial, etc.)
- No tracking, no data collection — all code is open source

## Install

Firefox Android only. Download and install the signed `.xpi` directly.

## Acknowledgments

Built on the shoulders of:

- [Fontonic](https://github.com/amkhrjee/fontonic-firefox-android) by @amkhrjee — the main inspiration for this project
- [WhatFont Bookmarklet](https://github.com/chengyin/WhatFont-Bookmarklet) by @chengyin — packaged for font detection
- [Essential Buttons Toolbar](https://github.com/KristhianX/essential-buttons-toolbar) by @KristhianX — toolbar and options page UI

## License

Experimental extension for personal/educational use.

// ==UserScript==
// @name        A Font Face-off Body Mode
// @namespace   defmikekoh
// @description Changes body text fonts to Andika, Gentium, or Charis (SIL) per domain
// @version     1.0.0
// @match       *://*/*
// @run-at      document-start
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const FONTS = ['Andika', 'Charis', 'Gentium'];
    const hostname = location.hostname;

    // ── Stored per-domain font choice ───────────────────────────────────────
    // GM storage key: "font:<hostname>" → font name string
    const storageKey = 'font:' + hostname;
    const fontName = GM_getValue(storageKey, null);

    // ── Menu commands to pick a font for this domain ────────────────────────
    for (const font of FONTS) {
        const label = font + (font === fontName ? ' (active)' : '');
        GM_registerMenuCommand(label, () => {
            GM_setValue(storageKey, font);
            location.reload();
        });
    }
    GM_registerMenuCommand('Remove font for this domain', () => {
        GM_setValue(storageKey, null);
        location.reload();
    });

    if (!fontName) return; // no font chosen for this domain

    // ── Font mirror base URL ────────────────────────────────────────────────
    const MIRROR = 'https://raw.githubusercontent.com/defmikekoh/sil-font-mirror/main';

    const FONT_VARIANTS = {
        Andika: [
            { style: 'normal', weight: 400, file: 'Andika-Regular' },
            { style: 'italic', weight: 400, file: 'Andika-Italic' },
            { style: 'normal', weight: 700, file: 'Andika-Bold' },
            { style: 'italic', weight: 700, file: 'Andika-BoldItalic' },
        ],
        Charis: [
            { style: 'normal', weight: 400, file: 'Charis-Regular' },
            { style: 'italic', weight: 400, file: 'Charis-Italic' },
            { style: 'normal', weight: 700, file: 'Charis-Bold' },
            { style: 'italic', weight: 700, file: 'Charis-BoldItalic' },
        ],
        Gentium: [
            { style: 'normal', weight: 400, file: 'Gentium-Regular' },
            { style: 'italic', weight: 400, file: 'Gentium-Italic' },
            { style: 'normal', weight: 700, file: 'Gentium-Bold' },
            { style: 'italic', weight: 700, file: 'Gentium-BoldItalic' },
        ],
    };

    // ── Build @font-face rules ──────────────────────────────────────────────
    const faces = FONT_VARIANTS[fontName].map(f =>
        `@font-face {
  font-family: "${fontName}";
  src: url("${MIRROR}/${fontName}/${f.file}.woff2") format("woff2");
  font-style: ${f.style};
  font-weight: ${f.weight};
  font-display: swap;
}`
    ).join('\n');

    // ── Body-contact selector ───────────────────────────────────────────────
    const BODY_SELECTOR =
        'body, ' +
        'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6)' +
              ':not(button):not(button *)' +
              ':not([role="dialog"]):not([role="dialog"] *)' +
              ':not([class*="byline"]):not([class*="subtitle"])';

    // ── Inject CSS ──────────────────────────────────────────────────────────
    GM_addStyle(`
${faces}

${BODY_SELECTOR} {
  font-family: "${fontName}" !important;
}
body strong, body b {
  font-weight: 700 !important;
}
body :where(em, i) {
  font-style: italic !important;
}
`);
})();

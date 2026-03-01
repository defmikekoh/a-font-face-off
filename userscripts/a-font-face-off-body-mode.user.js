// ==UserScript==
// @name        A Font Face-off Body Mode
// @namespace   defmikekoh
// @description Changes body text fonts per domain with Google Fonts examples
// @version     1.0.1
// @match       *://*/*
// @run-at      document-start
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    // Add your own fonts here:
    // 1) Add a unique key (menu label) below.
    // 2) Paste a css2 URL from https://fonts.google.com (or build one manually).
    // 3) Set bodyCss to the body text styling you want.
    //
    // Variable font example shape:
    // 'Some VF': {
    //   css2Url: 'https://fonts.googleapis.com/css2?family=Some+VF:opsz,wght@8..72,300..800&display=swap',
    //   bodyCss: 'font-family: "Some VF", serif; font-size: 16px; line-height: 1.5; letter-spacing: 0.01em; font-variation-settings: "wdth" 103;'
    // }
    //
    // Fixed/static font example shape:
    // 'Some Static': {
    //   css2Url: 'https://fonts.googleapis.com/css2?family=Some+Static:ital,wght@0,400;0,700;1,400;1,700&display=swap',
    //   bodyCss: 'font-family: "Some Static", sans-serif; font-size: 17px; line-height: 1.45;'
    // }
    const FONT_PRESETS = {
        Andika: {
            source: 'sil',
            fontFamily: 'Andika',
            bodyCss: 'font-family: "Andika", serif;',
            variants: [
                { style: 'normal', weight: 400, file: 'Andika-Regular' },
                { style: 'italic', weight: 400, file: 'Andika-Italic' },
                { style: 'normal', weight: 700, file: 'Andika-Bold' },
                { style: 'italic', weight: 700, file: 'Andika-BoldItalic' },
            ],
        },
        Charis: {
            source: 'sil',
            fontFamily: 'Charis',
            bodyCss: 'font-family: "Charis", serif;',
            variants: [
                { style: 'normal', weight: 400, file: 'Charis-Regular' },
                { style: 'italic', weight: 400, file: 'Charis-Italic' },
                { style: 'normal', weight: 700, file: 'Charis-Bold' },
                { style: 'italic', weight: 700, file: 'Charis-BoldItalic' },
            ],
        },
        Gentium: {
            source: 'sil',
            fontFamily: 'Gentium',
            bodyCss: 'font-family: "Gentium", serif;',
            variants: [
                { style: 'normal', weight: 400, file: 'Gentium-Regular' },
                { style: 'italic', weight: 400, file: 'Gentium-Italic' },
                { style: 'normal', weight: 700, file: 'Gentium-Bold' },
                { style: 'italic', weight: 700, file: 'Gentium-BoldItalic' },
            ],
        },
        'Merriweather (VF)': {
            source: 'google',
            css2Url: 'https://fonts.googleapis.com/css2?family=Merriweather:opsz,wdth,wght@18..144,50..200,300..900&display=swap',
            bodyCss: 'font-family: "Merriweather", serif; font-size: 15.5px; line-height: 1.6; letter-spacing: 0.02em; font-variation-settings: "wdth" 103;',
        },
        'Titillium Web (Fixed)': {
            source: 'google',
            css2Url: 'https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&display=swap',
            bodyCss: 'font-family: "Titillium Web", sans-serif; font-size: 18.5px; line-height: 1.45;',
        },
    };
    const PRESET_NAMES = Object.keys(FONT_PRESETS);
    const hostname = location.hostname;

    // ── Stored per-domain font choice ───────────────────────────────────────
    // GM storage key: "font:<hostname>" → preset name string
    const storageKey = 'font:' + hostname;
    const selectedPresetName = GM_getValue(storageKey, null);
    const selectedPreset = selectedPresetName ? FONT_PRESETS[selectedPresetName] : null;
    const MIRROR = 'https://raw.githubusercontent.com/defmikekoh/sil-font-mirror/main';

    // ── Menu commands to pick a font for this domain ────────────────────────
    for (const presetName of PRESET_NAMES) {
        const label = presetName + (presetName === selectedPresetName ? ' (active)' : '');
        GM_registerMenuCommand(label, () => {
            GM_setValue(storageKey, presetName);
            location.reload();
        });
    }
    GM_registerMenuCommand('Remove font for this domain', () => {
        GM_setValue(storageKey, null);
        location.reload();
    });

    if (!selectedPreset) return; // no preset chosen for this domain

    // ── Body-contact selector ───────────────────────────────────────────────
    const BODY_SELECTOR =
        'body, ' +
        'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6)' +
              ':not(button):not(button *)' +
              ':not([role="dialog"]):not([role="dialog"] *)' +
              ':not([class*="byline"]):not([class*="subtitle"])';

    let fontSourceCss = '';
    if (selectedPreset.source === 'google') {
        fontSourceCss = `@import url("${selectedPreset.css2Url}");`;
    } else if (selectedPreset.source === 'sil') {
        fontSourceCss = selectedPreset.variants.map(v =>
            `@font-face {
  font-family: "${selectedPreset.fontFamily}";
  src: url("${MIRROR}/${selectedPreset.fontFamily}/${v.file}.woff2") format("woff2");
  font-style: ${v.style};
  font-weight: ${v.weight};
  font-display: swap;
}`
        ).join('\n');
    }

    // ── Inject CSS ──────────────────────────────────────────────────────────
    GM_addStyle(`
${fontSourceCss}

${BODY_SELECTOR} {
  ${selectedPreset.bodyCss}
}
`);
})();

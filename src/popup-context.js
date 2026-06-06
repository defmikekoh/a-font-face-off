// Runs in <head> before first paint. The popup renders on two kinds of surface:
//   - desktop Firefox: a small browser-action PANEL that sizes to its content, so
//     popup.css gives it an explicit size (otherwise the flex column collapses);
//   - Firefox Android: a FULL-VIEWPORT surface, whether opened as the normal popup
//     or as the page-font Face-off tab — both must fill the screen.
// So the distinction that matters is the PLATFORM, not URL params. Detect Android
// from the user agent (reliable; unlike @media(pointer:fine), which the Note10
// S-Pen trips, or URL params, which the normal popup lacks). Must be an external
// file — the extension CSP blocks inline scripts.
(function () {
  'use strict';
  try {
    if (/Android/i.test(navigator.userAgent)) {
      document.documentElement.classList.add('affo-mobile');
    }
  } catch (e) { /* default to the desktop panel sizing */ }
})();

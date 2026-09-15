// Runs before first paint: Firefox Android and explicit extension tabs fill
// their viewport. Chromium Android's native popup sizes itself to its content,
// so it needs a definite height to avoid collapsing the flex preview region.
(function () {
  'use strict';
  if (!/Android/i.test(navigator.userAgent)) return;
  document.documentElement.classList.add('affo-mobile');
  const background = browser.runtime.getManifest().background;
  const isChromiumPanel = background && background.service_worker &&
    !new URLSearchParams(location.search).has('sourceTabId');
  if (isChromiumPanel) document.documentElement.classList.add('affo-popup-panel');
  if (isChromiumPanel && /EdgA\//i.test(navigator.userAgent)) {
    document.documentElement.classList.add('affo-edge-panel');
  }
})();

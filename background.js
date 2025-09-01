// Background fetcher for cross-origin CSS/WOFF2 with host permissions
browser.runtime.onMessage.addListener(async (msg, sender) => {
  try {
    if (!msg || msg.type !== 'affoFetch') return;
    const url = msg.url;
    const binary = !!msg.binary;
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (binary) {
      const buf = await res.arrayBuffer();
      const u8 = new Uint8Array(buf);
      return { ok: true, binary: true, data: Array.from(u8) };
    } else {
      const text = await res.text();
      return { ok: true, binary: false, data: text };
    }
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

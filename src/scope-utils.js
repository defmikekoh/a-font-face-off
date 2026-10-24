(function (root) {
  'use strict';

  // Storage remains hostname-based; directory scopes add a case-sensitive path.
  function normalizePathScope(value) {
    var raw = String(value || '').trim();
    if (!raw) throw new Error('Enter a domain and directory, such as example.com/wiki/.');
    var url;
    try { url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : 'https://' + raw); }
    catch (_) { throw new Error('Invalid directory: ' + raw); }
    if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password || url.port || url.search || url.hash || url.pathname === '/') {
      throw new Error('Use a domain and directory without a port, query, or fragment: ' + raw);
    }
    return url.hostname + url.pathname.replace(/\/+$/, '') + '/';
  }

  function resolveKey(map, urlValue) {
    var url = typeof urlValue === 'string' ? new URL(urlValue) : urlValue;
    var host = url.hostname;
    var path = url.pathname || '/';
    var best = host;
    Object.keys(map || {}).forEach(function (key) {
      if (!key.startsWith(host + '/')) return;
      var directory = key.slice(host.length).replace(/\/+$/, '');
      if ((path === directory || path.startsWith(directory + '/')) && key.length > best.length) best = key;
    });
    return best;
  }

  function getEntry(map, url) {
    return (map || {})[resolveKey(map, url)];
  }

  function updatePathScopes(map, values) {
    // Validate the entire input before changing any entries.
    var keys = Array.from(new Set(values.filter(function (v) { return v.trim(); }).map(normalizePathScope)));
    var next = Object.assign({}, map);
    keys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) {
        next[key] = JSON.parse(JSON.stringify(getEntry(map, 'https://' + key) || {}));
      }
    });
    Object.keys(next).forEach(function (key) {
      if (key.includes('/') && !keys.includes(key)) delete next[key];
    });
    return next;
  }

  root.AFFOScopeUtils = { normalizePathScope: normalizePathScope, resolveKey: resolveKey, getEntry: getEntry, updatePathScopes: updatePathScopes };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.AFFOScopeUtils;
})(typeof globalThis !== 'undefined' ? globalThis : this);

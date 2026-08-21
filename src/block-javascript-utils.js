(function(root) {
  'use strict';

  if (root.AFFOBlockJavascriptUtils) {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = root.AFFOBlockJavascriptUtils;
    }
    return;
  }

  var DEFAULT_DOMAINS = Object.freeze(['thedeepview.com']);
  var CSP_HEADER_NAME = 'Content-Security-Policy';
  var CSP_HEADER_VALUE = "script-src 'none'";
  var DNR_RULE_ID = 81001;

  function normalizeDomain(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^\*\./, '')
      .replace(/^\.+|\.+$/g, '');
  }

  function normalizeDomains(values) {
    if (!Array.isArray(values)) return [];
    var domains = new Set();
    values.forEach(function(value) {
      var domain = normalizeDomain(value);
      if (domain) domains.add(domain);
    });
    return Array.from(domains).sort();
  }

  function matchesHostname(hostname, domains) {
    var host = normalizeDomain(hostname);
    if (!host) return false;
    return normalizeDomains(domains).some(function(domain) {
      return host === domain || host.endsWith('.' + domain);
    });
  }

  function shouldBlockRequest(details, domains) {
    if (!details || typeof details.url !== 'string') return false;
    try {
      return matchesHostname(new URL(details.url).hostname, domains);
    } catch (_) {
      return false;
    }
  }

  function buildBlockingResponse(details, domains) {
    if (!shouldBlockRequest(details, domains)) return {};
    var responseHeaders = Array.isArray(details.responseHeaders)
      ? details.responseHeaders.slice()
      : [];
    responseHeaders.push({
      name: CSP_HEADER_NAME,
      value: CSP_HEADER_VALUE
    });
    return { responseHeaders: responseHeaders };
  }

  function buildDynamicRule(domains) {
    var requestDomains = normalizeDomains(domains);
    if (!requestDomains.length) return null;
    return {
      id: DNR_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [{
          header: CSP_HEADER_NAME,
          operation: 'append',
          value: CSP_HEADER_VALUE
        }]
      },
      condition: {
        requestDomains: requestDomains,
        resourceTypes: ['main_frame']
      }
    };
  }

  root.AFFOBlockJavascriptUtils = {
    DEFAULT_DOMAINS: DEFAULT_DOMAINS,
    CSP_HEADER_NAME: CSP_HEADER_NAME,
    CSP_HEADER_VALUE: CSP_HEADER_VALUE,
    DNR_RULE_ID: DNR_RULE_ID,
    normalizeDomain: normalizeDomain,
    normalizeDomains: normalizeDomains,
    matchesHostname: matchesHostname,
    shouldBlockRequest: shouldBlockRequest,
    buildBlockingResponse: buildBlockingResponse,
    buildDynamicRule: buildDynamicRule
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.AFFOBlockJavascriptUtils;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

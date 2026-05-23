(function(root) {
  'use strict';

  if (root.AFFOSiteDetection) {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = root.AFFOSiteDetection;
    }
    return;
  }

  function normalizeHost(hostname) {
    return String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  }

  function isHostOrSubdomain(hostname, domain) {
    var host = normalizeHost(hostname);
    return host === domain || host.endsWith('.' + domain);
  }

  function isSubstackPublicationHost(hostname) {
    return isHostOrSubdomain(hostname, 'substack.com');
  }

  function isSubstackAssetHost(hostname) {
    return isHostOrSubdomain(hostname, 'substackcdn.com');
  }

  function getUrlHost(value, baseUrl) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    try {
      return normalizeHost(new URL(raw, baseUrl || undefined).hostname);
    } catch (_) {
      return '';
    }
  }

  function isSubstackPublicationUrl(value, baseUrl) {
    return isSubstackPublicationHost(getUrlHost(value, baseUrl));
  }

  function isSubstackResourceUrl(value, baseUrl) {
    var host = getUrlHost(value, baseUrl);
    return isSubstackPublicationHost(host) || isSubstackAssetHost(host);
  }

  function hasSubstackGenerator(value) {
    return /\bsubstack\b/i.test(String(value || ''));
  }

  function getSchemaTypes(node) {
    var rawType = node && node['@type'];
    var types = Array.isArray(rawType) ? rawType : [rawType];
    return types.map(function(type) {
      return String(type || '').toLowerCase();
    }).filter(Boolean);
  }

  function hasSchemaType(node, names) {
    var types = getSchemaTypes(node);
    return names.some(function(name) {
      return types.indexOf(name.toLowerCase()) !== -1;
    });
  }

  function schemaUrlValue(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var nested = schemaUrlValue(value[i]);
        if (nested) return nested;
      }
      return '';
    }
    if (typeof value === 'object') {
      return value['@id'] || value.url || value.href || '';
    }
    return '';
  }

  function jsonLdObjectHasSubstackPageSignal(node, baseUrl) {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) {
      return node.some(function(item) {
        return jsonLdObjectHasSubstackPageSignal(item, baseUrl);
      });
    }

    if (Array.isArray(node['@graph'])) {
      return node['@graph'].some(function(item) {
        return jsonLdObjectHasSubstackPageSignal(item, baseUrl);
      });
    }

    var pageLike = hasSchemaType(node, [
      'Article',
      'BlogPosting',
      'CreativeWork',
      'NewsArticle',
      'PublicationIssue',
      'WebPage',
      'WebSite'
    ]);

    if (pageLike) {
      if (isSubstackPublicationUrl(schemaUrlValue(node.url), baseUrl)) return true;
      if (isSubstackPublicationUrl(schemaUrlValue(node.mainEntityOfPage), baseUrl)) return true;
      if (isSubstackPublicationUrl(schemaUrlValue(node.isPartOf), baseUrl)) return true;
    }

    if (node.publisher && typeof node.publisher === 'object') {
      if (isSubstackPublicationUrl(schemaUrlValue(node.publisher.url), baseUrl)) return true;
      if (isSubstackPublicationUrl(schemaUrlValue(node.publisher['@id']), baseUrl)) return true;
    }

    return false;
  }

  function jsonLdHasSubstackPageSignal(text, baseUrl) {
    if (!text || !/substack/i.test(String(text))) return false;
    try {
      return jsonLdObjectHasSubstackPageSignal(JSON.parse(text), baseUrl);
    } catch (_) {
      return false;
    }
  }

  function isSubstackSignals(signals) {
    signals = signals || {};
    var baseUrl = signals.baseUrl || '';

    if (isSubstackPublicationHost(signals.hostname)) return true;
    if (typeof signals.globalPubId === 'string' && signals.globalPubId.trim()) return true;
    if (hasSubstackGenerator(signals.generator)) return true;

    var pageUrls = Array.isArray(signals.pageUrls) ? signals.pageUrls : [];
    if (pageUrls.some(function(url) {
      return isSubstackPublicationUrl(url, baseUrl);
    })) return true;

    var resourceUrls = Array.isArray(signals.resourceUrls) ? signals.resourceUrls : [];
    if (resourceUrls.some(function(url) {
      return isSubstackResourceUrl(url, baseUrl);
    })) return true;

    var jsonLdTexts = Array.isArray(signals.jsonLdTexts) ? signals.jsonLdTexts : [];
    return jsonLdTexts.some(function(text) {
      return jsonLdHasSubstackPageSignal(text, baseUrl);
    });
  }

  function attr(element, name) {
    return element && element.getAttribute ? element.getAttribute(name) : '';
  }

  function queryAttr(documentRef, selector, name) {
    var element = documentRef && documentRef.querySelector ? documentRef.querySelector(selector) : null;
    return attr(element, name);
  }

  function queryAllAttrs(documentRef, selector, name) {
    if (!documentRef || !documentRef.querySelectorAll) return [];
    try {
      return Array.prototype.map.call(documentRef.querySelectorAll(selector), function(element) {
        return attr(element, name);
      }).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function queryAllText(documentRef, selector) {
    if (!documentRef || !documentRef.querySelectorAll) return [];
    try {
      return Array.prototype.map.call(documentRef.querySelectorAll(selector), function(element) {
        return element && element.textContent ? String(element.textContent) : '';
      }).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function isSubstackDocument(documentRef, locationRef, windowRef) {
    var href = locationRef && locationRef.href ? locationRef.href : '';
    return isSubstackSignals({
      hostname: locationRef && locationRef.hostname,
      baseUrl: href,
      globalPubId: windowRef && windowRef.__SUBSTACK_PUB_ID__,
      generator: queryAttr(documentRef, 'meta[name="generator"]', 'content'),
      pageUrls: [
        queryAttr(documentRef, 'link[rel="canonical"]', 'href'),
        queryAttr(documentRef, 'meta[property="og:url"]', 'content'),
        queryAttr(documentRef, 'meta[name="twitter:url"]', 'content')
      ],
      resourceUrls: queryAllAttrs(documentRef, 'link[rel="preconnect"], link[rel="preload"], link[rel="stylesheet"]', 'href')
        .concat(queryAllAttrs(documentRef, 'script[src]', 'src')),
      jsonLdTexts: queryAllText(documentRef, 'script[type="application/ld+json"]')
    });
  }

  root.AFFOSiteDetection = {
    hasSubstackGenerator: hasSubstackGenerator,
    isSubstackAssetHost: isSubstackAssetHost,
    isSubstackDocument: isSubstackDocument,
    isSubstackPublicationHost: isSubstackPublicationHost,
    isSubstackPublicationUrl: isSubstackPublicationUrl,
    isSubstackResourceUrl: isSubstackResourceUrl,
    isSubstackSignals: isSubstackSignals,
    jsonLdHasSubstackPageSignal: jsonLdHasSubstackPageSignal
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.AFFOSiteDetection;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

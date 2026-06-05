/* page-font-utils.js — Pure helpers for one-shot page-font Face-off drafts.
 *
 * Loaded as a plain script in the background context and exported for Node tests.
 */
/* global module, require */
(function(root) {
  'use strict';

  var fontFaceUtils = root.AFFOFontFaceUtils;
  if (!fontFaceUtils && typeof module !== 'undefined' && module.exports) {
    fontFaceUtils = require('./font-face-utils.js');
  }

  function cleanFontFamilyName(value) {
    var text = String(value || '').trim();
    if ((text[0] === '"' && text[text.length - 1] === '"') ||
        (text[0] === "'" && text[text.length - 1] === "'")) {
      text = text.slice(1, -1);
    }
    return text.trim();
  }

  function normalizeFontFamilyName(value) {
    return cleanFontFamilyName(value).toLowerCase();
  }

  function extractFontFaceBlocks(cssText) {
    return String(cssText || '').match(/@font-face\s*{[\s\S]*?}/gi) || [];
  }

  function resolveFontFaceUrls(block, baseUrl) {
    if (!baseUrl) return block;
    return String(block || '').replace(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi,
      function(match, doubleQuoted, singleQuoted, unquoted) {
        var raw = String(doubleQuoted || singleQuoted || unquoted || '').trim();
        if (!raw || /^(?:data:|blob:|about:|#)/i.test(raw)) return match;
        try {
          return 'url("' + new URL(raw, baseUrl).href + '")';
        } catch (_) {
          return match;
        }
      }
    );
  }

  function extractMatchingFontFaceRules(cssText, fontName, baseUrl) {
    var target = normalizeFontFamilyName(fontName);
    if (!target) return [];

    return extractFontFaceBlocks(cssText).filter(function(block) {
      var family = fontFaceUtils.getDescriptorValue(block, 'font-family');
      return normalizeFontFamilyName(family) === target;
    }).map(function(block) {
      return resolveFontFaceUrls(block, baseUrl);
    });
  }

  function getFontWeightRange(block) {
    var descriptor = String(fontFaceUtils.getDescriptorValue(block, 'font-weight') || '400').trim().toLowerCase();
    if (descriptor === 'normal') return [400, 400];
    if (descriptor === 'bold') return [700, 700];
    var values = descriptor.match(/\d+(?:\.\d+)?/g);
    if (!values || values.length === 0) return [400, 400];
    var first = Number(values[0]);
    var second = values.length > 1 ? Number(values[1]) : first;
    return [Math.min(first, second), Math.max(first, second)];
  }

  function selectBestFontFaceRule(rules, fontWeight, fontStyle) {
    var targetWeight = Number.isFinite(Number(fontWeight)) ? Number(fontWeight) : 400;
    var targetStyle = fontStyle === 'italic' ? 'italic' : 'normal';
    var candidates = Array.isArray(rules) ? rules : [];
    if (candidates.length === 0) return '';

    return candidates.map(function(rule, index) {
      var style = String(fontFaceUtils.getDescriptorValue(rule, 'font-style') || 'normal').trim().toLowerCase();
      var range = getFontWeightRange(rule);
      var distance = targetWeight < range[0]
        ? range[0] - targetWeight
        : targetWeight > range[1] ? targetWeight - range[1] : 0;
      return {
        rule: rule,
        score: (style === targetStyle ? 10000 : 0) + (distance === 0 ? 1000 : 0) - distance,
        index: index
      };
    }).sort(function(a, b) {
      return b.score - a.score || a.index - b.index;
    })[0].rule;
  }

  function extractRemoteFontUrls(block) {
    var urls = [];
    String(block || '').replace(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi,
      function(match, doubleQuoted, singleQuoted, unquoted) {
        var value = String(doubleQuoted || singleQuoted || unquoted || '').trim();
        if (/^https?:\/\//i.test(value) && urls.indexOf(value) === -1) urls.push(value);
        return match;
      }
    );
    return urls;
  }

  function replaceFontFaceUrl(block, targetUrl, replacementUrl) {
    return String(block || '').replace(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi,
      function(match, doubleQuoted, singleQuoted, unquoted) {
        var value = String(doubleQuoted || singleQuoted || unquoted || '').trim();
        return value === targetUrl ? 'url("' + replacementUrl + '")' : match;
      }
    );
  }

  function uniqueStrings(values) {
    var seen = {};
    return (Array.isArray(values) ? values : []).filter(function(value) {
      var key = String(value || '').trim();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function rankStylesheetUrls(urls, fontName) {
    var familyToken = normalizeFontFamilyName(fontName).replace(/[^a-z0-9]+/g, '');
    return uniqueStrings(urls).filter(function(url) {
      return /^https?:\/\//i.test(url);
    }).map(function(url, index) {
      var lower = url.toLowerCase();
      var compact = lower.replace(/[^a-z0-9]+/g, '');
      var score = 0;
      if (familyToken && compact.indexOf(familyToken) !== -1) score += 100;
      if (/font|type|face/.test(lower)) score += 20;
      if (/\.css(?:[?#]|$)/i.test(url)) score += 5;
      return { url: url, score: score, index: index };
    }).sort(function(a, b) {
      return b.score - a.score || a.index - b.index;
    }).map(function(entry) {
      return entry.url;
    });
  }

  var api = {
    cleanFontFamilyName: cleanFontFamilyName,
    extractFontFaceBlocks: extractFontFaceBlocks,
    extractMatchingFontFaceRules: extractMatchingFontFaceRules,
    extractRemoteFontUrls: extractRemoteFontUrls,
    normalizeFontFamilyName: normalizeFontFamilyName,
    rankStylesheetUrls: rankStylesheetUrls,
    replaceFontFaceUrl: replaceFontFaceUrl,
    resolveFontFaceUrls: resolveFontFaceUrls,
    selectBestFontFaceRule: selectBestFontFaceRule
  };

  root.AFFOPageFontUtils = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

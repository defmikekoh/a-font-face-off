/* page-font-utils.js — Pure helpers for one-shot page-font Face-off drafts.
 *
 * Loaded as a plain script in the background context and exported for Node tests.
 */
/* global module, require, DecompressionStream */
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

  function extractStylesheetImportUrls(cssText, baseUrl) {
    var urls = [];
    var seen = {};
    var importPattern = /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)|"([^"]*)"|'([^']*)')/gi;
    String(cssText || '').replace(
      importPattern,
      function(match, doubleQuotedUrl, singleQuotedUrl, unquotedUrl, doubleQuoted, singleQuoted) {
        var raw = String(doubleQuotedUrl || singleQuotedUrl || unquotedUrl || doubleQuoted || singleQuoted || '').trim();
        if (!raw) return match;
        try {
          var url = new URL(raw, baseUrl).href;
          if (/^https?:\/\//i.test(url) && !seen[url]) {
            seen[url] = true;
            urls.push(url);
          }
        } catch (_) { }
        return match;
      }
    );
    return urls;
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

  function getDescriptorRange(block, descriptorName, unitPattern) {
    var descriptor = String(fontFaceUtils.getDescriptorValue(block, descriptorName) || '').trim().toLowerCase();
    var values = descriptor.match(unitPattern);
    if (!values || values.length < 2) return null;
    var first = Number(values[0].replace(/[^\d.-]/g, ''));
    var second = Number(values[1].replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(first) || !Number.isFinite(second) || first === second) return null;
    return [Math.min(first, second), Math.max(first, second)];
  }

  function clamp(value, range) {
    return Math.max(range[0], Math.min(range[1], value));
  }

  var EMPTY_AXIS_DEFINITION = { axes: [], defaults: {}, ranges: {} };
  var MAX_FONT_TABLES = 4096;
  var MAX_WOFF2_DECOMPRESSED_SIZE = 64 * 1024 * 1024;
  var WOFF2_KNOWN_TAGS = [
    'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post',
    'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
    'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
    'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
    'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
    'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
    'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
    'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'
  ];

  function emptyAxisDefinition() {
    return {
      axes: EMPTY_AXIS_DEFINITION.axes.slice(),
      defaults: {},
      ranges: {}
    };
  }

  function toUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return new Uint8Array(0);
  }

  function requireBytes(bytes, offset, length) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
        offset < 0 || length < 0 || offset + length > bytes.byteLength) {
      throw new Error('Font metadata extends beyond the available data');
    }
  }

  function readUint16(bytes, offset) {
    requireBytes(bytes, offset, 2);
    return (bytes[offset] << 8) | bytes[offset + 1];
  }

  function readUint32(bytes, offset) {
    requireBytes(bytes, offset, 4);
    return ((bytes[offset] * 0x1000000) +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3]) >>> 0;
  }

  function readFixed(bytes, offset) {
    var unsigned = readUint32(bytes, offset);
    var signed = unsigned >= 0x80000000 ? unsigned - 0x100000000 : unsigned;
    return signed / 65536;
  }

  function readTag(bytes, offset) {
    requireBytes(bytes, offset, 4);
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }

  function readUIntBase128(bytes, cursor) {
    var value = 0;
    for (var i = 0; i < 5; i++) {
      requireBytes(bytes, cursor.offset, 1);
      var current = bytes[cursor.offset++];
      if (i === 0 && current === 0x80) throw new Error('Invalid UIntBase128 leading zero');
      if (value & 0xfe000000) throw new Error('UIntBase128 overflow');
      value = (value * 128) + (current & 0x7f);
      if ((current & 0x80) === 0) return value;
    }
    throw new Error('UIntBase128 exceeds five bytes');
  }

  function parseFvarTable(bytes, tableOffset, tableLength) {
    requireBytes(bytes, tableOffset, tableLength);
    if (tableLength < 16 || readUint16(bytes, tableOffset) !== 1) {
      return emptyAxisDefinition();
    }

    var axesArrayOffset = readUint16(bytes, tableOffset + 4);
    var axisCount = readUint16(bytes, tableOffset + 8);
    var axisSize = readUint16(bytes, tableOffset + 10);
    if (axisCount === 0 || axisCount > 64 || axisSize < 20) return emptyAxisDefinition();

    var axesStart = tableOffset + axesArrayOffset;
    var axesLength = axisCount * axisSize;
    if (axesArrayOffset < 16 || axesLength > tableLength - axesArrayOffset) {
      throw new Error('Invalid fvar axis array');
    }

    var definition = emptyAxisDefinition();
    var seen = {};
    for (var i = 0; i < axisCount; i++) {
      var axisOffset = axesStart + (i * axisSize);
      var tag = readTag(bytes, axisOffset);
      var minimum = readFixed(bytes, axisOffset + 4);
      var defaultValue = readFixed(bytes, axisOffset + 8);
      var maximum = readFixed(bytes, axisOffset + 12);
      if (!/^[\x20-\x7e]{4}$/.test(tag) || seen[tag] ||
          !Number.isFinite(minimum) || !Number.isFinite(defaultValue) || !Number.isFinite(maximum) ||
          minimum >= maximum || defaultValue < minimum || defaultValue > maximum) {
        continue;
      }
      seen[tag] = true;
      definition.axes.push(tag);
      definition.ranges[tag] = [minimum, maximum];
      definition.defaults[tag] = defaultValue;
    }
    return definition;
  }

  function parseSfntAxisDefinition(bytes) {
    if (bytes.byteLength < 12) return emptyAxisDefinition();
    var signature = readTag(bytes, 0);
    if (signature !== '\x00\x01\x00\x00' && signature !== 'OTTO' &&
        signature !== 'true' && signature !== 'typ1') {
      return emptyAxisDefinition();
    }

    var numTables = readUint16(bytes, 4);
    if (numTables === 0 || numTables > MAX_FONT_TABLES) return emptyAxisDefinition();
    requireBytes(bytes, 12, numTables * 16);
    for (var i = 0; i < numTables; i++) {
      var recordOffset = 12 + (i * 16);
      if (readTag(bytes, recordOffset) !== 'fvar') continue;
      var tableOffset = readUint32(bytes, recordOffset + 8);
      var tableLength = readUint32(bytes, recordOffset + 12);
      return parseFvarTable(bytes, tableOffset, tableLength);
    }
    return emptyAxisDefinition();
  }

  async function decompressWoffTable(compressedBytes, expectedLength, decompressDeflate) {
    var decompressed;
    if (typeof decompressDeflate === 'function') {
      decompressed = await decompressDeflate(compressedBytes, expectedLength);
    } else {
      if (typeof DecompressionStream !== 'function' ||
          typeof Blob !== 'function' || typeof Response !== 'function') {
        return new Uint8Array(0);
      }
      var stream;
      try {
        stream = new Blob([compressedBytes]).stream()
          .pipeThrough(new DecompressionStream('deflate'));
      } catch (_) {
        return new Uint8Array(0);
      }
      decompressed = await new Response(stream).arrayBuffer();
    }

    var bytes = toUint8Array(decompressed);
    if (bytes.byteLength !== expectedLength ||
        bytes.byteLength > MAX_WOFF2_DECOMPRESSED_SIZE) {
      throw new Error('Unexpected WOFF table size');
    }
    return bytes;
  }

  async function parseWoffAxisDefinition(bytes, decompressDeflate) {
    if (bytes.byteLength < 44 || readTag(bytes, 0) !== 'wOFF') {
      return emptyAxisDefinition();
    }
    var declaredLength = readUint32(bytes, 8);
    var numTables = readUint16(bytes, 12);
    if (declaredLength !== bytes.byteLength || numTables === 0 || numTables > MAX_FONT_TABLES) {
      throw new Error('Invalid WOFF header');
    }
    requireBytes(bytes, 44, numTables * 20);
    for (var i = 0; i < numTables; i++) {
      var recordOffset = 44 + (i * 20);
      if (readTag(bytes, recordOffset) !== 'fvar') continue;
      var tableOffset = readUint32(bytes, recordOffset + 4);
      var compressedLength = readUint32(bytes, recordOffset + 8);
      var originalLength = readUint32(bytes, recordOffset + 12);
      requireBytes(bytes, tableOffset, compressedLength);
      if (originalLength > MAX_WOFF2_DECOMPRESSED_SIZE || compressedLength > originalLength) {
        throw new Error('Invalid WOFF table length');
      }
      if (compressedLength === originalLength) {
        return parseFvarTable(bytes, tableOffset, originalLength);
      }
      var table = await decompressWoffTable(
        bytes.subarray(tableOffset, tableOffset + compressedLength),
        originalLength,
        decompressDeflate
      );
      return table.byteLength ? parseFvarTable(table, 0, table.byteLength) : emptyAxisDefinition();
    }
    return emptyAxisDefinition();
  }

  async function decompressWoff2Data(compressedBytes, expectedLength, decompressBrotli) {
    var decompressed;
    if (typeof decompressBrotli === 'function') {
      decompressed = await decompressBrotli(compressedBytes, expectedLength);
    } else {
      if (typeof DecompressionStream !== 'function' ||
          typeof Blob !== 'function' || typeof Response !== 'function') {
        return new Uint8Array(0);
      }
      var stream;
      try {
        stream = new Blob([compressedBytes]).stream()
          .pipeThrough(new DecompressionStream('brotli'));
      } catch (_) {
        return new Uint8Array(0);
      }
      decompressed = await new Response(stream).arrayBuffer();
    }

    var bytes = toUint8Array(decompressed);
    if (bytes.byteLength !== expectedLength ||
        bytes.byteLength > MAX_WOFF2_DECOMPRESSED_SIZE) {
      throw new Error('Unexpected WOFF2 decompressed size');
    }
    return bytes;
  }

  async function parseWoff2AxisDefinition(bytes, decompressBrotli) {
    if (bytes.byteLength < 48 || readTag(bytes, 0) !== 'wOF2') {
      return emptyAxisDefinition();
    }

    var flavor = readUint32(bytes, 4);
    if (flavor === 0x74746366) return emptyAxisDefinition(); // Font collections are not needed for page fonts.
    var declaredLength = readUint32(bytes, 8);
    var numTables = readUint16(bytes, 12);
    var totalCompressedSize = readUint32(bytes, 20);
    if (declaredLength !== bytes.byteLength ||
        numTables === 0 || numTables > MAX_FONT_TABLES ||
        totalCompressedSize === 0) {
      throw new Error('Invalid WOFF2 header');
    }

    var cursor = { offset: 48 };
    var entries = [];
    var decompressedLength = 0;
    for (var i = 0; i < numTables; i++) {
      requireBytes(bytes, cursor.offset, 1);
      var flags = bytes[cursor.offset++];
      var tagIndex = flags & 0x3f;
      var tag;
      if (tagIndex === 0x3f) {
        tag = readTag(bytes, cursor.offset);
        cursor.offset += 4;
      } else {
        tag = WOFF2_KNOWN_TAGS[tagIndex];
      }

      var originalLength = readUIntBase128(bytes, cursor);
      var transformVersion = flags >>> 6;
      var transformed = (tag === 'glyf' || tag === 'loca')
        ? transformVersion !== 3
        : transformVersion !== 0;
      var storedLength = transformed ? readUIntBase128(bytes, cursor) : originalLength;
      if (decompressedLength + storedLength > MAX_WOFF2_DECOMPRESSED_SIZE) {
        throw new Error('WOFF2 table data is too large');
      }
      entries.push({
        tag: tag,
        offset: decompressedLength,
        length: storedLength,
        transformed: transformed
      });
      decompressedLength += storedLength;
    }

    requireBytes(bytes, cursor.offset, totalCompressedSize);
    var compressedBytes = bytes.subarray(cursor.offset, cursor.offset + totalCompressedSize);
    var tableData = await decompressWoff2Data(
      compressedBytes,
      decompressedLength,
      decompressBrotli
    );
    if (tableData.byteLength === 0) return emptyAxisDefinition();

    for (var j = 0; j < entries.length; j++) {
      var entry = entries[j];
      if (entry.tag === 'fvar' && !entry.transformed) {
        return parseFvarTable(tableData, entry.offset, entry.length);
      }
    }
    return emptyAxisDefinition();
  }

  async function buildFontBinaryAxisDefinition(fontData, options) {
    var bytes = toUint8Array(fontData);
    if (bytes.byteLength < 4) return emptyAxisDefinition();
    try {
      if (readTag(bytes, 0) === 'wOF2') {
        return await parseWoff2AxisDefinition(
          bytes,
          options && options.decompressBrotli
        );
      }
      if (readTag(bytes, 0) === 'wOFF') {
        return await parseWoffAxisDefinition(
          bytes,
          options && options.decompressDeflate
        );
      }
      return parseSfntAxisDefinition(bytes);
    } catch (_) {
      return emptyAxisDefinition();
    }
  }

  function mergeAxisDefinitions(primary, fallback) {
    var definition = emptyAxisDefinition();
    [primary, fallback].forEach(function(source) {
      if (!source || !Array.isArray(source.axes)) return;
      source.axes.forEach(function(axis) {
        var range = source.ranges && source.ranges[axis];
        var defaultValue = Number(source.defaults && source.defaults[axis]);
        if (definition.axes.indexOf(axis) !== -1 ||
            !Array.isArray(range) || range.length !== 2 ||
            !Number.isFinite(Number(range[0])) || !Number.isFinite(Number(range[1])) ||
            Number(range[0]) >= Number(range[1]) ||
            !Number.isFinite(defaultValue)) {
          return;
        }
        definition.axes.push(axis);
        definition.ranges[axis] = [Number(range[0]), Number(range[1])];
        definition.defaults[axis] = clamp(defaultValue, definition.ranges[axis]);
      });
    });
    return definition;
  }

  function buildFontFaceAxisDefinition(block) {
    var axes = [];
    var defaults = {};
    var ranges = {};

    function addAxis(axis, range, fallback) {
      if (!Array.isArray(range) || range.length !== 2 || range[0] === range[1]) return;
      axes.push(axis);
      ranges[axis] = range;
      defaults[axis] = clamp(fallback, range);
    }

    var weightRange = getFontWeightRange(block);
    addAxis('wght', weightRange, 400);
    addAxis('wdth', getDescriptorRange(block, 'font-stretch', /-?\d+(?:\.\d+)?%/g), 100);
    addAxis('slnt', getDescriptorRange(block, 'font-style', /-?\d+(?:\.\d+)?deg/g), 0);

    return { axes: axes, defaults: defaults, ranges: ranges };
  }

  function selectBestFontFaceRule(rules, fontWeight, fontStyle) {
    var targetWeight = Number.isFinite(Number(fontWeight)) ? Number(fontWeight) : 400;
    var targetStyle = fontStyle === 'italic' ? 'italic' : 'normal';
    var candidates = Array.isArray(rules) ? rules : [];
    if (candidates.length === 0) return '';

    return candidates.map(function(rule, index) {
      var style = String(fontFaceUtils.getDescriptorValue(rule, 'font-style') || 'normal').trim().toLowerCase();
      var range = getFontWeightRange(rule);
      var unicodeRange = fontFaceUtils.getDescriptorValue(rule, 'unicode-range');
      var unicodeRanges = fontFaceUtils.parseUnicodeRanges(unicodeRange);
      var coversBasicLatin = !unicodeRange || unicodeRanges.some(function(candidateRange) {
        return candidateRange[0] <= 0x007e && candidateRange[1] >= 0x0020;
      });
      var distance = targetWeight < range[0]
        ? range[0] - targetWeight
        : targetWeight > range[1] ? targetWeight - range[1] : 0;
      return {
        rule: rule,
        score: (style === targetStyle ? 10000 : 0) +
          (distance === 0 ? 1000 : 0) +
          (coversBasicLatin ? 100 : 0) - distance,
        index: index
      };
    }).sort(function(a, b) {
      return b.score - a.score || a.index - b.index;
    })[0].rule;
  }

  function extractRemoteFontUrls(block) {
    var urls = [];
    fontFaceUtils.extractFontFaceSources(block).forEach(function(source) {
      if (source.supported && /^https?:\/\//i.test(source.url) && urls.indexOf(source.url) === -1) {
        urls.push(source.url);
      }
    });
    return urls;
  }

  function detectFontBinaryFormat(fontData) {
    var bytes = toUint8Array(fontData);
    if (bytes.byteLength < 4) return '';
    var signature = readTag(bytes, 0);
    if (signature === 'wOF2') return 'woff2';
    if (signature === 'wOFF') return 'woff';
    if (signature === 'OTTO') return 'otf';
    if (signature === '\x00\x01\x00\x00' || signature === 'true' || signature === 'typ1') return 'ttf';
    return '';
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
    buildFontBinaryAxisDefinition: buildFontBinaryAxisDefinition,
    detectFontBinaryFormat: detectFontBinaryFormat,
    cleanFontFamilyName: cleanFontFamilyName,
    buildFontFaceAxisDefinition: buildFontFaceAxisDefinition,
    extractFontFaceBlocks: extractFontFaceBlocks,
    extractMatchingFontFaceRules: extractMatchingFontFaceRules,
    extractRemoteFontUrls: extractRemoteFontUrls,
    extractStylesheetImportUrls: extractStylesheetImportUrls,
    getFontFormat: fontFaceUtils.getFontFormat,
    getFontMimeType: fontFaceUtils.getFontMimeType,
    normalizeFontFamilyName: normalizeFontFamilyName,
    rankStylesheetUrls: rankStylesheetUrls,
    mergeAxisDefinitions: mergeAxisDefinitions,
    replaceFontFaceUrl: replaceFontFaceUrl,
    resolveFontFaceUrls: resolveFontFaceUrls,
    selectBestFontFaceRule: selectBestFontFaceRule
  };

  root.AFFOPageFontUtils = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

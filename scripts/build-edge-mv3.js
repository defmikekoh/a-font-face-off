#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'ztemp', 'edge-mv3-src');

const IGNORED_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'custom-fonts-example.css',
  'custom-fonts-example-data-blob.css',
  'gdrive-config.example.js'
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(srcDir, destDir) {
  ensureDir(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (IGNORED_NAMES.has(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function prependScript(jsList, scriptName) {
  const list = Array.isArray(jsList) ? jsList.slice() : [];
  return list.includes(scriptName) ? list : [scriptName].concat(list);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function patchHtmlScript(fileName, markerScript) {
  const filePath = path.join(OUT_DIR, fileName);
  let text = fs.readFileSync(filePath, 'utf8');
  if (text.includes('browser-polyfill-lite.js')) return;

  const pattern = new RegExp(`^(\\s*)<script src="${markerScript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"></script>`, 'm');
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`Could not find script marker ${markerScript} in ${fileName}`);
  }
  text = text.replace(pattern, `${match[1]}<script src="browser-polyfill-lite.js"></script>\n$&`);
  fs.writeFileSync(filePath, text);
}

function addHtmlClass(fileName, className) {
  const filePath = path.join(OUT_DIR, fileName);
  let text = fs.readFileSync(filePath, 'utf8');

  text = text.replace(/<html([^>]*)>/, (match, attrs) => {
    if (new RegExp(`\\b${className}\\b`).test(match)) return match;
    if (/\sclass=/.test(attrs)) {
      return match.replace(/\sclass=(["'])(.*?)\1/, ` class=$1$2 ${className}$1`);
    }
    return `<html${attrs} class="${className}">`;
  });

  fs.writeFileSync(filePath, text);
}

function patchCssGenerators() {
  const filePath = path.join(OUT_DIR, 'css-generators.js');
  let text = fs.readFileSync(filePath, 'utf8');
  const patches = [
    'function generateBodyCSS(payload, aggressive, ignoreComments) {',
    'function generateBodyContactCSS(payload, aggressive, ignoreComments) {',
    'function generateThirdManInCSS(fontType, payload, aggressive) {'
  ];

  for (const signature of patches) {
    if (!text.includes(signature)) {
      throw new Error(`Could not find ${signature} in css-generators.js`);
    }
    text = text.replace(
      signature,
      `${signature}\n    aggressive = true; // Edge MV3 prototype: no Firefox cssOrigin:user equivalent.`
    );
  }

  fs.writeFileSync(filePath, text);
}

function buildManifest(sourceManifest) {
  const contentScripts = sourceManifest.content_scripts.map(script => ({
    ...script,
    js: prependScript(script.js, 'browser-polyfill-lite.js')
  }));

  const webAccessibleResources = unique([
    ...(sourceManifest.web_accessible_resources || []),
    'jquery.js',
    'whatfont_core.js',
    'wf.css',
    'custom-fonts-starter.css',
    'custom-fonts-axes-starter.json',
    'sil-fonts.css',
    'icons/*',
    'icons/*/*'
  ]);

  return {
    manifest_version: 3,
    name: `${sourceManifest.name} Edge MV3 Prototype`,
    version: sourceManifest.version,
    description: `${sourceManifest.description} (Edge/Chrome MV3 prototype build)`,
    action: sourceManifest.browser_action,
    icons: sourceManifest.icons,
    permissions: [
      'tabs',
      'storage',
      'alarms',
      'scripting',
      'webRequest'
    ],
    host_permissions: [
      'http://*/*',
      'https://*/*'
    ],
    content_scripts: contentScripts,
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: blob: https:;"
    },
    web_accessible_resources: [
      {
        resources: webAccessibleResources,
        matches: ['http://*/*', 'https://*/*']
      }
    ],
    background: {
      service_worker: 'edge-mv3-service-worker.js'
    },
    options_ui: sourceManifest.options_ui
  };
}

function writeServiceWorker(sourceManifest) {
  const scripts = [
    'browser-polyfill-lite.js',
    ...sourceManifest.background.scripts
  ];
  const importList = scripts.map(script => `  ${JSON.stringify(script)}`).join(',\n');
  const text = `'use strict';\n\nimportScripts(\n${importList}\n);\n`;
  fs.writeFileSync(path.join(OUT_DIR, 'edge-mv3-service-worker.js'), text);
}

function writeBrowserPolyfillLite() {
  const text = `(function(global) {
  'use strict';

  if (global.browser && global.browser.__affoEdgeMv3Shim) return;
  if (!global.chrome) {
    if (global.browser) global.browser.__affoEdgeMv3Shim = true;
    return;
  }

  var chromeApi = global.chrome;

  function runtimeError() {
    return chromeApi.runtime && chromeApi.runtime.lastError;
  }

  function callbackPromise(fn, thisArg, args) {
    return new Promise(function(resolve, reject) {
      var settled = false;
      function callback() {
        if (settled) return;
        settled = true;
        var error = runtimeError();
        if (error) {
          reject(new Error(error.message));
          return;
        }
        var values = Array.prototype.slice.call(arguments);
        resolve(values.length <= 1 ? values[0] : values);
      }

      try {
        var result = fn.apply(thisArg, args.concat(callback));
        if (result && typeof result.then === 'function') {
          result.then(function(value) {
            if (!settled) {
              settled = true;
              resolve(value);
            }
          }, function(error) {
            if (!settled) {
              settled = true;
              reject(error);
            }
          });
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    });
  }

  function noCallbackPromise(fn, thisArg, args) {
    try {
      return Promise.resolve(fn.apply(thisArg, args));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function wrapMethod(parent, name) {
    if (!parent || typeof parent[name] !== 'function') return undefined;
    return function() {
      return callbackPromise(parent[name], parent, Array.prototype.slice.call(arguments));
    };
  }

  function getTarget(tabId, details) {
    var target = { tabId: tabId };
    if (details && details.allFrames) target.allFrames = true;
    if (details && details.frameId != null) target.frameIds = [details.frameId];
    return target;
  }

  function selectActivePageTab(tabs) {
    if (!tabs || !tabs.length) return null;
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      if (tab && /^https?:\\/\\//.test(tab.url || '')) return tab;
    }
    for (var j = 0; j < tabs.length; j++) {
      if (tabs[j] && tabs[j].id != null) return tabs[j];
    }
    return tabs[0];
  }

  function queryActiveTabFallbacks() {
    var queries = [
      { active: true, currentWindow: true },
      { active: true, lastFocusedWindow: true },
      { active: true }
    ];
    var chain = Promise.resolve(null);
    queries.forEach(function(queryInfo) {
      chain = chain.then(function(tab) {
        if (tab) return tab;
        return browserApi.tabs.query(queryInfo).then(selectActivePageTab).catch(function() {
          return null;
        });
      });
    });
    return chain;
  }

  function getActiveTabId() {
    return queryActiveTabFallbacks().then(function(tab) {
      if (!tab || tab.id == null) {
        throw new Error('No active tab available for MV3 scripting call');
      }
      return tab.id;
    });
  }

  function normalizeTabsArgs(tabIdOrDetails, maybeDetails) {
    if (typeof tabIdOrDetails === 'number') {
      return Promise.resolve({ tabId: tabIdOrDetails, details: maybeDetails || {} });
    }
    if (typeof tabIdOrDetails === 'string' && /^\\d+$/.test(tabIdOrDetails)) {
      return Promise.resolve({ tabId: Number(tabIdOrDetails), details: maybeDetails || {} });
    }
    return getActiveTabId().then(function(tabId) {
      return { tabId: tabId, details: tabIdOrDetails || {} };
    });
  }

  function executeCodeString(code) {
    return (0, eval)(code);
  }

  function executeScript(tabIdOrDetails, maybeDetails) {
    return normalizeTabsArgs(tabIdOrDetails, maybeDetails).then(function(args) {
      var details = args.details;
      var injection = {
        target: getTarget(args.tabId, details)
      };

      if (details.file) {
        injection.files = [details.file];
      } else if (details.files) {
        injection.files = details.files;
      } else if (details.code != null) {
        injection.func = executeCodeString;
        injection.args = [String(details.code)];
      } else {
        throw new Error('executeScript requires code, file, or files');
      }

      return noCallbackPromise(chromeApi.scripting.executeScript, chromeApi.scripting, [injection])
        .then(function(results) {
          return (results || []).map(function(item) { return item && item.result; });
        });
    });
  }

  function insertCSS(tabIdOrDetails, maybeDetails) {
    return normalizeTabsArgs(tabIdOrDetails, maybeDetails).then(function(args) {
      var details = args.details;
      var injection = {
        target: getTarget(args.tabId, details)
      };

      if (details.file) {
        injection.files = [details.file];
      } else if (details.files) {
        injection.files = details.files;
      } else if (details.code != null) {
        injection.css = String(details.code);
      } else {
        throw new Error('insertCSS requires code, file, or files');
      }

      return noCallbackPromise(chromeApi.scripting.insertCSS, chromeApi.scripting, [injection]);
    });
  }

  function removeCSS(tabIdOrDetails, maybeDetails) {
    return normalizeTabsArgs(tabIdOrDetails, maybeDetails).then(function(args) {
      var details = args.details;
      if (details.code === '') return undefined;

      var injection = {
        target: getTarget(args.tabId, details)
      };

      if (details.file) {
        injection.files = [details.file];
      } else if (details.files) {
        injection.files = details.files;
      } else if (details.code != null) {
        injection.css = String(details.code);
      } else {
        throw new Error('removeCSS requires code, file, or files');
      }

      return noCallbackPromise(chromeApi.scripting.removeCSS, chromeApi.scripting, [injection]);
    });
  }

  function wrapOnMessage(onMessage) {
    var listenerMap = new WeakMap();
    return {
      addListener: function(listener) {
        var wrapped = function(message, sender, sendResponse) {
          var result = listener(message, sender, sendResponse);
          if (result && typeof result.then === 'function') {
            result.then(function(value) {
              sendResponse(value);
            }, function(error) {
              sendResponse({
                success: false,
                ok: false,
                error: error && error.message ? error.message : String(error)
              });
            });
            return true;
          }
          return result;
        };
        listenerMap.set(listener, wrapped);
        return onMessage.addListener(wrapped);
      },
      removeListener: function(listener) {
        return onMessage.removeListener(listenerMap.get(listener) || listener);
      },
      hasListener: function(listener) {
        return onMessage.hasListener(listenerMap.get(listener) || listener);
      }
    };
  }

  var browserApi = {
    __affoEdgeMv3Shim: true,
    storage: {
      local: {
        get: wrapMethod(chromeApi.storage.local, 'get'),
        set: wrapMethod(chromeApi.storage.local, 'set'),
        remove: wrapMethod(chromeApi.storage.local, 'remove'),
        clear: wrapMethod(chromeApi.storage.local, 'clear')
      },
      onChanged: chromeApi.storage.onChanged
    },
    runtime: {
      getURL: chromeApi.runtime.getURL.bind(chromeApi.runtime),
      openOptionsPage: wrapMethod(chromeApi.runtime, 'openOptionsPage'),
      sendMessage: wrapMethod(chromeApi.runtime, 'sendMessage'),
      onMessage: wrapOnMessage(chromeApi.runtime.onMessage),
      onInstalled: chromeApi.runtime.onInstalled,
      onStartup: chromeApi.runtime.onStartup
    },
    tabs: {
      query: wrapMethod(chromeApi.tabs, 'query'),
      create: wrapMethod(chromeApi.tabs, 'create'),
      remove: wrapMethod(chromeApi.tabs, 'remove'),
      sendMessage: wrapMethod(chromeApi.tabs, 'sendMessage'),
      executeScript: executeScript,
      insertCSS: insertCSS,
      removeCSS: removeCSS,
      onUpdated: chromeApi.tabs.onUpdated
    },
    alarms: {
      create: function() {
        return noCallbackPromise(chromeApi.alarms.create, chromeApi.alarms, Array.prototype.slice.call(arguments));
      },
      clear: wrapMethod(chromeApi.alarms, 'clear'),
      onAlarm: chromeApi.alarms.onAlarm
    },
    permissions: chromeApi.permissions ? {
      getAll: wrapMethod(chromeApi.permissions, 'getAll'),
      contains: wrapMethod(chromeApi.permissions, 'contains'),
      request: wrapMethod(chromeApi.permissions, 'request')
    } : undefined,
    webRequest: chromeApi.webRequest,
    action: chromeApi.action,
    browserAction: chromeApi.action
  };

  global.browser = browserApi;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

  fs.writeFileSync(path.join(OUT_DIR, 'browser-polyfill-lite.js'), text);
}

function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  copyDir(SRC_DIR, OUT_DIR);

  const sourceManifest = readJson(path.join(SRC_DIR, 'manifest.json'));
  writeJson(path.join(OUT_DIR, 'manifest.json'), buildManifest(sourceManifest));
  writeServiceWorker(sourceManifest);
  writeBrowserPolyfillLite();
  patchHtmlScript('popup.html', 'config-utils.js');
  patchHtmlScript('options.html', 'messaging-utils.js');
  addHtmlClass('options.html', 'affo-chromium-options');
  patchCssGenerators();

  console.log(`Generated Edge MV3 source: ${path.relative(ROOT, OUT_DIR)}`);
}

main();

(function(global) {
  'use strict';

  // Firefox provides the native Promise-based browser API.
  if (global.browser) return;
  if (!global.chrome) return;

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
    storage: {
      session: chromeApi.storage.session ? {
        get: wrapMethod(chromeApi.storage.session, 'get'),
        set: wrapMethod(chromeApi.storage.session, 'set'),
        remove: wrapMethod(chromeApi.storage.session, 'remove')
      } : undefined,
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
      getManifest: chromeApi.runtime.getManifest.bind(chromeApi.runtime),
      // Keep the tab-opening workaround only on Android, where Chromium's
      // openOptionsPage callback may never settle.
      openOptionsPage: /Android/i.test(global.navigator && global.navigator.userAgent || '')
        ? undefined : wrapMethod(chromeApi.runtime, 'openOptionsPage'),
      sendMessage: wrapMethod(chromeApi.runtime, 'sendMessage'),
      onMessage: wrapOnMessage(chromeApi.runtime.onMessage),
      onInstalled: chromeApi.runtime.onInstalled,
      onStartup: chromeApi.runtime.onStartup
    },
    tabs: chromeApi.tabs ? {
      query: wrapMethod(chromeApi.tabs, 'query'),
      get: wrapMethod(chromeApi.tabs, 'get'),
      create: wrapMethod(chromeApi.tabs, 'create'),
      remove: wrapMethod(chromeApi.tabs, 'remove'),
      sendMessage: wrapMethod(chromeApi.tabs, 'sendMessage'),
      onUpdated: chromeApi.tabs.onUpdated,
      onActivated: chromeApi.tabs.onActivated,
      onRemoved: chromeApi.tabs.onRemoved
    } : undefined,
    windows: chromeApi.windows ? {
      onFocusChanged: chromeApi.windows.onFocusChanged
    } : undefined,
    alarms: chromeApi.alarms ? {
      create: function() {
        return noCallbackPromise(chromeApi.alarms.create, chromeApi.alarms, Array.prototype.slice.call(arguments));
      },
      clear: wrapMethod(chromeApi.alarms, 'clear'),
      onAlarm: chromeApi.alarms.onAlarm
    } : undefined,
    permissions: chromeApi.permissions ? {
      getAll: wrapMethod(chromeApi.permissions, 'getAll'),
      contains: wrapMethod(chromeApi.permissions, 'contains'),
      request: wrapMethod(chromeApi.permissions, 'request')
    } : undefined,
    declarativeNetRequest: chromeApi.declarativeNetRequest ? {
      getDynamicRules: wrapMethod(chromeApi.declarativeNetRequest, 'getDynamicRules'),
      updateDynamicRules: wrapMethod(chromeApi.declarativeNetRequest, 'updateDynamicRules')
    } : undefined,
    webRequest: chromeApi.webRequest,
    scripting: chromeApi.scripting,
    action: chromeApi.action
  };

  global.browser = browserApi;
})(typeof globalThis !== 'undefined' ? globalThis : this);

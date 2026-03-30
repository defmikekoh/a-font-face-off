(function(root) {
  'use strict';

  if (root.AFFOMessaging) return;

  var PORT_ERROR_RE = /(Receiving end does not exist|The message port closed before|moved into back\/forward cache)/;

  function getErrorMessage(error) {
    return error && error.message ? error.message : String(error || '');
  }

  function isNoReceiverError(error) {
    return PORT_ERROR_RE.test(getErrorMessage(error));
  }

  function wrapPortError(error, fallbackMessage) {
    if (isNoReceiverError(error) && fallbackMessage) {
      return new Error(fallbackMessage);
    }
    if (error instanceof Error) return error;
    return new Error(getErrorMessage(error));
  }

  function ignoreNoReceiver(error) {
    if (!isNoReceiverError(error)) {
      return Promise.reject(error);
    }
  }

  function delay(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function getBackgroundPageWindow(browserApi) {
    try {
      if (browserApi.runtime && typeof browserApi.runtime.getBackgroundPage === 'function') {
        return await browserApi.runtime.getBackgroundPage();
      }
    } catch (_) {}

    try {
      if (browserApi.extension && typeof browserApi.extension.getBackgroundPage === 'function') {
        return browserApi.extension.getBackgroundPage();
      }
    } catch (_) {}

    return null;
  }

  async function sendRuntimeMessage(browserApi, message, options) {
    options = options || {};

    if (options.directFirst && options.directHandlerName) {
      var bg = await getBackgroundPageWindow(browserApi);
      var handler = bg && bg[options.directHandlerName];
      if (typeof handler === 'function') {
        return handler(message, null);
      }
    }

    var retryMs = options.retryMs || 0;
    var retryDelayMs = options.retryDelayMs || 100;
    var deadline = Date.now() + retryMs;

    for (;;) {
      try {
        return await browserApi.runtime.sendMessage(message);
      } catch (error) {
        if (options.ignoreNoReceiver && isNoReceiverError(error)) {
          return undefined;
        }
        if (!retryMs || !isNoReceiverError(error) || Date.now() >= deadline) {
          throw wrapPortError(error, options.noReceiverMessage);
        }
        await delay(retryDelayMs);
      }
    }
  }

  async function sendTabMessage(browserApi, tabId, message, options) {
    options = options || {};
    try {
      return await browserApi.tabs.sendMessage(tabId, message, options.sendOptions);
    } catch (error) {
      if (options.ignoreNoReceiver && isNoReceiverError(error)) {
        return undefined;
      }
      throw wrapPortError(error, options.noReceiverMessage);
    }
  }

  root.AFFOMessaging = {
    PORT_ERROR_RE: PORT_ERROR_RE,
    getBackgroundPageWindow: getBackgroundPageWindow,
    ignoreNoReceiver: ignoreNoReceiver,
    isNoReceiverError: isNoReceiverError,
    sendRuntimeMessage: sendRuntimeMessage,
    sendTabMessage: sendTabMessage,
    wrapPortError: wrapPortError
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

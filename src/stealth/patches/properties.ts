export function getWebdriverPatch(): string {
  return `
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
    delete Object.getPrototypeOf(navigator).webdriver;
  `;
}

export function getCdcArtifactsPatch(): string {
  return `
    for (const target of [window, document]) {
      for (const key of Object.keys(target)) {
        if (key.startsWith('$cdc_') || key.startsWith('$wdc_')) {
          delete target[key];
        }
      }
    }
    const cdcObserver = new MutationObserver(() => {
      for (const key of Object.keys(document)) {
        if (key.startsWith('$cdc_') || key.startsWith('$wdc_')) {
          delete document[key];
        }
      }
    });
    cdcObserver.observe(document, { attributes: true, childList: true, subtree: true });
  `;
}

export function getChromeRuntimePatch(): string {
  return `
    if (!window.chrome) { window.chrome = {}; }
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        connect: function() { return { onMessage: { addListener: function() {} }, postMessage: function() {} }; },
        sendMessage: function(msg, cb) { if (cb) cb(); },
        onMessage: { addListener: function() {}, removeListener: function() {} },
        id: undefined,
      };
    }
    const nativeToString = Function.prototype.toString;
    const fakeToString = function() { return 'function () { [native code] }'; };
    for (const fn of Object.values(window.chrome.runtime)) {
      if (typeof fn === 'function') { fn.toString = fakeToString; }
    }
  `;
}

export function getPluginsPatch(): string {
  return `
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer', length: 1,
            0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' } },
          { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', length: 1,
            0: { type: 'application/pdf', suffixes: 'pdf', description: '' } },
          { name: 'Native Client', description: '', filename: 'internal-nacl-plugin', length: 2,
            0: { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
            1: { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' } },
        ];
        plugins.item = (i) => plugins[i] || null;
        plugins.namedItem = (name) => plugins.find(p => p.name === name) || null;
        plugins.refresh = () => {};
        return plugins;
      },
      configurable: true,
    });
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const mimeTypes = [
          { type: 'application/pdf', suffixes: 'pdf', description: '', enabledPlugin: { name: 'Chrome PDF Viewer' } },
          { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: { name: 'Chrome PDF Plugin' } },
        ];
        mimeTypes.item = (i) => mimeTypes[i] || null;
        mimeTypes.namedItem = (name) => mimeTypes.find(m => m.type === name) || null;
        return mimeTypes;
      },
      configurable: true,
    });
  `;
}

export function getPermissionsPatch(): string {
  return `
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = function(parameters) {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null });
      }
      return originalQuery.call(this, parameters);
    };
  `;
}

export function getIframePatch(): string {
  return `
    const originalAttachShadow = HTMLElement.prototype.attachShadow;
    HTMLElement.prototype.attachShadow = function(init) {
      return originalAttachShadow.call(this, init);
    };
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function(tagName, options) {
      const el = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'iframe') {
        const originalContentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
        if (originalContentWindow) {
          Object.defineProperty(el, 'contentWindow', {
            get: function() {
              const win = originalContentWindow.get.call(this);
              if (win) {
                try {
                  Object.defineProperty(win.navigator, 'webdriver', { get: () => undefined, configurable: true });
                } catch (e) {}
              }
              return win;
            },
            configurable: true,
          });
        }
      }
      return el;
    };
  `;
}

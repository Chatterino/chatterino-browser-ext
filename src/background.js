const ignoredPages = new Set([
  'directory',
  'downloads',
  'friends',
  'inventory',
  'jobs',
  'messages',
  'p',
  'payments',
  'popout',
  'prime',
  'settings',
  'store',
  'subscriptions',
  'turbo',
  'videos',
  'wallet',
]);

class AttachedWindows {
  /** @param {number} winID */
  static async isAttached(winID) {
    const windows = await AttachedWindows.#load();
    return winID in windows;
  }

  /** @param {number} winID */
  static async markAttached(winID) {
    const windows = await AttachedWindows.#load();
    windows[winID] = true;
    await AttachedWindows.#save(windows);
  }

  /** @param {number} winID */
  static async markDetatched(winID) {
    const windows = await AttachedWindows.#load();
    delete windows[winID];
    await AttachedWindows.#save(windows);
  }

  /** @returns {Promise<number[]>} */
  static async detachAll() {
    const windows = await AttachedWindows.#load();
    await AttachedWindows.#save({});
    return Object.keys(windows).map(Number);
  }

  /** @returns {Promise<Record<number, boolean>} */
  static #load() {
    return chrome.storage.session
      .get('attachedWindows')
      .then(({ attachedWindows }) => attachedWindows ?? {})
      .catch(() => ({}));
  }

  /** @param {Promise<Record<number, boolean>} attachedWindows */
  static #save(attachedWindows) {
    return chrome.storage.session.set({ attachedWindows }).catch(console.warn);
  }
}

const debugCalls = true;

const settings = (() => {
  const map = { replaceTwitchChat: true };

  // load settings
  chrome.storage.local.get(Object.keys(map), result => {
    for (let key in map) {
      if (result[key] !== undefined) {
        map[key] = result[key];
      }
    }
    updateBadge();
  });

  return {
    get: key => {
      map[name];
    },
    set: (key, value) => {
      let obj = {};
      obj[key] = value;
      chrome.storage.local.set(obj);
      map[key] = value;
    },
    all: () => map,
  };
})();

/// return channel name if it should contain a chat
function matchChannelName(url) {
  if (!url) return undefined;

  const [, channelName] =
    url.match(/^https?:\/\/(?:www\.)?twitch\.tv\/(\w+)\/?(?:\?.*)?$/) ?? [];

  if (channelName && !ignoredPages.has(channelName)) {
    return channelName;
  }

  return undefined;
}

const appName = 'com.chatterino.chatterino';
let port = null;

// gets the port for communication with chatterino
function getPort() {
  if (port) {
    return port;
  } else {
    // XXX: add cooldown?
    connectPort();

    return port;
  }
}

// connect to port
function connectPort() {
  port = chrome.runtime.connectNative(appName);
  console.debug('port connected');

  port.onMessage.addListener(msg => {
    if (typeof msg === 'object' && msg.type === 'status') {
      switch (msg.status) {
        case 'exiting-host':
          console.info(
            `Native host is exiting: '${msg.reason ?? '<unknown>'}'`,
          );
          break;
        default:
          console.log(msg);
          break;
      }
    } else {
      console.log(msg);
    }
  });
  port.onDisconnect.addListener(e => {
    console.debug(
      'port disconnected',
      e?.error ?? e ?? chrome.runtime.lastError,
    );

    port = null;
  });
}

// disconnect from port
function disconnectPort() {
  if (debugCalls) console.log('disconnectPort');

  if (port) {
    port.disconnect();
    port = null;
  }
}

// tab activated
chrome.tabs.onActivated.addListener(async activeInfo => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (!tab || !tab.url) return;

  const window = await chrome.windows.get(tab.windowId, {});
  if (!window.focused) return;

  if (debugCalls) console.log('onActivated');

  await onTabSelected(tab.url, tab);
});

// url changed
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.highlighted) return;

  const window = await chrome.windows.get(tab.windowId, {});
  if (!window.focused) return;

  if (debugCalls) console.log('onUpdated');

  onTabSelected(tab.url, tab);
});

// tab detached
chrome.tabs.onDetached.addListener(async (tabId, detachInfo) => {
  if (debugCalls) console.log('onDetached');

  await tryDetach(detachInfo.oldWindowId);
});

// tab closed
chrome.windows.onRemoved.addListener(async windowId => {
  if (debugCalls) console.log('onRemoved');

  await tryDetach(windowId);
});

// window selected
chrome.windows.onFocusChanged.addListener(async windowId => {
  console.log(windowId);
  if (windowId == -1) return;

  // this returns all tabs when the query fails
  const tabs = await chrome.tabs.query({
    windowId: windowId,
    highlighted: true,
  });
  if (tabs.length === 1) {
    let tab = tabs[0];

    const window = await chrome.windows.get(tab.windowId);
    if (debugCalls) console.log('onFocusChanged');

    await onTabSelected(tab.url, tab);
  }
});

// attach or detach from tab
async function onTabSelected(url, tab) {
  let channelName = matchChannelName(url);

  if (!channelName) {
    // detach from window
    await tryDetach(tab.windowId);
  }
}

// receiving messages from the inject script
chrome.runtime.onMessage.addListener((message, sender, callback) => {
  console.log(message);

  switch (message.type) {
    case 'get-settings':
      callback(settings.all());
      break;
    case 'set-setting':
      (async () => {
        settings.set(message.key, message.value);

        for (const id of await AttachedWindows.detachAll()) {
          // they're already cleared
          await sendDetach(id);
        }
        updateBadge();
      })();
      break;
    case 'get-os':
      chrome.runtime.getPlatformInfo(info => callback(info.os));

      // We need to return true here so that `callback` will remain valid
      // after this function returns. This behavior is documented here:
      // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage
      return true;
      break;
    case 'location-updated':
      chrome.windows.get(sender.tab.windowId, {}, window => {
        if (!window.focused) return;

        let data = {
          action: 'select',
          type: 'twitch',
          winId: sender.tab.windowId,
          version: 0,
          name: matchChannelName(sender.tab.url),
        };
        let port = getPort();

        if (port) {
          port.postMessage(data);
        }
      });
      break;
    case 'chat-resized':
      // is tab highlighted
      if (!sender.tab.highlighted) return;

      // is window focused
      chrome.windows.get(sender.tab.windowId, {}, async window => {
        if (!window.focused) return;

        // get zoom value
        const zoom = await chrome.tabs.getZoom(sender.tab.id);
        let size = {
          x: message.rect.x * zoom,
          pixelRatio: 1,
          width: Math.floor(message.rect.width * zoom),
          height: Math.floor(message.rect.height * zoom),
        };

        // attach to window
        await tryAttach(sender.tab.windowId, window.state == 'fullscreen', {
          name: matchChannelName(sender.tab.url),
          size: size,
        });
      });
      break;
    case 'detach':
      tryDetach(sender.tab.windowId);
      break;
  }
});

// attach chatterino to a chrome window
async function tryAttach(windowId, fullscreen, data) {
  console.log('tryAttach ' + windowId);

  data.action = 'select';
  if (settings.all().replaceTwitchChat) {
    if (fullscreen) {
      data.attach_fullscreen = true;
    } else {
      data.attach = true;
    }
  }
  data.type = 'twitch';
  data.winId = '' + windowId;
  data.version = 0;

  let port = getPort();

  if (port) {
    port.postMessage(data);
  }

  await AttachedWindows.markAttached(windowId);
}

/**
 * Detach chatterino from a chrome window
 * @param {number} windowId
 */
async function tryDetach(windowId) {
  if (await AttachedWindows.isAttached(windowId)) {
    sendDetach(windowId);
    await AttachedWindows.markDetatched(windowId);
  }
}

function sendDetach(winID) {
  console.log('sendDetach', { winID });

  const port = getPort();
  if (port) {
    port.postMessage({ action: 'detach', version: 0, winId: winID.toString() });
  }
}

function updateBadge() {
  chrome.action.setBadgeText({
    text: settings.all().replaceTwitchChat ? '' : 'off',
  });
}

function getPreviousTabs() {
  return chrome.storage.session
    .get('previousTabs')
    .then(({ previousTabs }) => new Set(previousTabs ?? []))
    .catch(() => new Set());
}

async function setPreviousTabs(tabs) {
  await chrome.storage.session.set({ previousTabs: [...tabs] });
}

async function syncTabs() {
  function compareTabs(lhs, rhs) {
    if (lhs.size !== rhs.size) {
      return false;
    }

    for (const value of lhs) {
      if (!rhs.has(value)) {
        return false;
      }
    }
    return true;
  }

  let previousTabs = await getPreviousTabs();

  const tabs = await chrome.tabs.query({ url: '*://*.twitch.tv/*' });
  const currentTabs = new Set(
    tabs.map(t => matchChannelName(t.url)).filter(Boolean),
  );
  if (compareTabs(previousTabs, currentTabs)) {
    return;
  }
  previousTabs = currentTabs;
  console.log('sending updated tabs:', currentTabs);

  const port = getPort();
  if (port) {
    port.postMessage({ action: 'sync', twitchChannels: [...currentTabs] });
  }

  await setPreviousTabs(previousTabs);
}
syncTabs();

chrome.tabs.onCreated.addListener(() => syncTabs());
chrome.tabs.onRemoved.addListener(() => syncTabs());
chrome.tabs.onUpdated.addListener((id, changeInfo) => {
  if ('url' in changeInfo) {
    syncTabs();
  }
});

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

/**
 * @typedef {{
 *    replaceTwitchChat: boolean
 * }} SettingTypes
 */

class Settings {
  static #defaults = {
    replaceTwitchChat: async () => {
      const platform = await chrome.runtime.getPlatformInfo();
      return platform.os === 'win';
    },
  };

  /**
   * @template {keyof SettingTypes} T
   * @param {T} key
   * @returns {Promise<SettingTypes[T]>}
   */
  static async get(key) {
    const maybeVal = await this.#getOrUndefined(key);
    if (maybeVal === undefined) {
      return await this.#defaults[key]();
    }
    return maybeVal;
  }

  /**
   * @template {keyof SettingTypes} T
   * @param {T} key
   * @returns {Promise<SettingTypes[T] | undefined>}
   */
  static async #getOrUndefined(key) {
    try {
      const settings = await chrome.storage.local.get(key);
      return settings[key];
    } catch (e) {
      console.warn(`Failed to get ${key}`, e);
    }
    return undefined;
  }

  /**
   * @template {keyof SettingTypes} T
   * @param {T} key
   * @param {SettingTypes[T]} value
   */
  static async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (e) {
      console.warn(`Failed to set ${key} to`, value, e);
    }
  }
}

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
/** @type {chrome.runtime.Port|null} */
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
  console.debug('Port connected');

  port.onMessage.addListener(msg => {
    if (typeof msg === 'object' && msg.type === 'status') {
      switch (msg.status) {
        case 'exiting-host':
          console.info(
            `Native host is exiting: '${msg.reason ?? '<unknown>'}'`,
          );
          break;
        default:
          console.log(
            `port.onMessage(): Unknown status '${msg.status}', msg:`,
            msg,
          );
          break;
      }
    } else {
      console.log('port.onMessage(): Unexpected message:', msg);
    }
  });
  port.onDisconnect.addListener(e => {
    console.debug(
      'Port disconnected',
      e?.error ?? e ?? chrome.runtime.lastError,
    );

    port = null;
  });
}

function sendNativeMessage(msg) {
  const port = getPort();
  if (port) {
    console.debug(`sendNativeMessage()`, msg);
    port.postMessage(msg);
  }
}

// tab activated
chrome.tabs.onActivated.addListener(async activeInfo => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (!tab || !tab.url) return;

  const window = await chrome.windows.get(tab.windowId, {});
  if (!window.focused) return;

  if (debugCalls) console.log(`tabs.onActivated(tabId=${activeInfo.tabId})`);

  await onTabSelected(tab.url, tab);
});

// url changed
chrome.tabs.onUpdated.addListener(async (tabId, _changeInfo, tab) => {
  if (!tab.highlighted) return;

  const window = await chrome.windows.get(tab.windowId, {});
  if (!window.focused) return;

  if (debugCalls) console.log(`tabs.onUpdated(tabId=${tabId})`);

  onTabSelected(tab.url, tab);
});

// tab detached
chrome.tabs.onDetached.addListener(async (tabId, detachInfo) => {
  if (debugCalls) console.log(`tabs.onDetached(tabId=${tabId})`);

  await tryDetach(detachInfo.oldWindowId);
});

// tab closed
chrome.windows.onRemoved.addListener(async windowId => {
  if (debugCalls) console.log(`windows.onRemoved(windowId=${windowId})`);

  await tryDetach(windowId);
});

// window selected
chrome.windows.onFocusChanged.addListener(async windowId => {
  console.log(`windows.onFocusChanged(windowId=${windowId})`);
  if (windowId === -1) return;

  // this returns all tabs when the query fails
  const tabs = await chrome.tabs.query({
    windowId: windowId,
    highlighted: true,
  });
  if (tabs.length === 1) {
    await onTabSelected(tab.url, tabs[0]);
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

function isFirefox() {
  // Only Firefox has browser.*
  return typeof browser !== 'undefined';
}

async function calcDisplayScaleFactor(tabId, dpr) {
  const zoom = await chrome.tabs.getZoom(tabId);
  let scaleFactor = dpr / zoom;
  // On Firefox devicePixelRatio is not just zoom * scaleFactor. There seems to
  // be some additional multiplier, which makes sure, that dimensions of the
  // CSS pixel grid are exact integers (ex. with 175% scaling on 1080p dpr is
  // 1.7647).
  //
  // To workaround that, we will assume, that display scaling is set to a
  // multiple of 25%, which is recommend in Windows, and round to that. This
  // will allow us to get the _actual_ zoom level later with that multiplier
  // included, which lines up everything nicely.
  if (isFirefox()) {
    scaleFactor = Math.round(scaleFactor / 0.25) * 0.25;
  }
  return scaleFactor;
}

// receiving messages from the inject script
chrome.runtime.onMessage.addListener((message, sender, callback) => {
  console.log('runtime.onMessage()', message);

  switch (message.type) {
    case 'get-setting':
      Settings.get(message.key).then(callback);
      return true;
    case 'set-setting':
      (async () => {
        await Settings.set(message.key, message.value);

        for (const id of await AttachedWindows.detachAll()) {
          // they're already cleared
          await sendDetach(id);
        }
        await updateBadge();
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

        sendNativeMessage({
          action: 'select',
          type: 'twitch',
          winId: sender.tab.windowId,
          version: 0,
          name: matchChannelName(sender.tab.url),
        });
      });
      break;
    case 'chat-resized':
      // is tab highlighted
      if (!sender.tab.highlighted) return;

      // is window focused
      chrome.windows.get(sender.tab.windowId, {}, async window => {
        if (!window.focused) return;

        const dpr = message.dpr ?? 1;
        // devicePixelRatio combines both zoom and display scaling set in the
        // system. But the UI elements (sidebars) are unaffected by the zoom
        // level of the tab itself. So we need to separate the two.
        const scaleFactor = await calcDisplayScaleFactor(sender.tab.id, dpr);
        const zoom = dpr / scaleFactor;
        // adjust for sidebars and vertical tabs
        let xOffset = (message.viewportX ?? 0) / scaleFactor;
        let size = {
          x: message.rect.x * zoom + xOffset,
          pixelRatio: 1,
          width: Math.floor(message.rect.width * zoom),
          height: Math.floor(message.rect.height * zoom),
        };

        // attach to window
        await tryAttach(sender.tab.windowId, window.state === 'fullscreen', {
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
  console.log(`tryAttach(windowId=${windowId}, fullscreen=${fullscreen})`);

  data.action = 'select';
  if (await Settings.get('replaceTwitchChat')) {
    if (fullscreen) {
      data.attach_fullscreen = true;
    } else {
      data.attach = true;
    }
  }
  data.type = 'twitch';
  data.winId = '' + windowId;
  data.version = 0;

  sendNativeMessage(data);

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
  console.log(`sendDetach(winID=${winID})`);

  sendNativeMessage({ action: 'detach', version: 0, winId: winID.toString() });
}

async function updateBadge() {
  chrome.action.setBadgeText({
    text: (await Settings.get('replaceTwitchChat')) ? '' : 'off',
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
  console.log('syncTabs(): sending updated tabs:', currentTabs);

  sendNativeMessage({ action: 'sync', twitchChannels: [...currentTabs] });

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

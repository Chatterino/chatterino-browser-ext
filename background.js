const ignoredPages = {
  'settings': true,
  'payments': true,
  'inventory': true,
  'messages': true,
  'subscriptions': true,
  'friends': true,
  'directory': true,
  'videos': true,
  'prime': true,
  'popout': true,
};
const attachedWindows = {};
// we try to detach every native window once at start in case someone reloaded
// the extension
let detachedWindowsCache = {};
const debugCalls = true;

let settings = (() => {
  const map = { replaceTwitchChat: true };

  // load settings
  chrome.storage.local.get(Object.keys(map), (result) => {
    for (let key in map) {
      if (result[key] !== undefined) {
        map[key] = result[key];
      }
    }
    updateBadge();
  });

  return {
    get: (key) => {
      map[name]
    }, set: (key, value) => {
      let obj = {}
      obj[key] = value;
      chrome.storage.local.set(obj);
      map[key] = value;
    }, all: () => map,
  }
})();

/// return channel name if it should contain a chat
function matchChannelName(url) {
  if (!url) return undefined;

  const match =
    url.match(/^https?:\/\/(?:www\.)?twitch\.tv\/(\w+)\/?(?:\?.*)?$/);

  let channelName;
  if (match && (channelName = match[1], !ignoredPages[channelName])) {
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
  console.log('port connected');

  detachedWindowsCache = {};

  port.onMessage.addListener((msg) => {
    console.log(msg);
  });
  port.onDisconnect.addListener((xd) => {
    console.log('port disconnected', (xd | {}).error, chrome.runtime.lastError);

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
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!tab || !tab.url) return;

    chrome.windows.get(tab.windowId, {}, (window) => {
      if (!window.focused) return;

      if (debugCalls) console.log('onActivated');

      onTabSelected(tab.url, tab);
    });
  });
});



// url changed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.highlighted) return;

  chrome.windows.get(tab.windowId, {}, (window) => {
    if (!window.focused) return;

    if (debugCalls) console.log('onUpdated');

    onTabSelected(tab.url, tab);
  });
});

// tab detached
chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
  if (debugCalls) console.log('onDetached');

  tryDetach(detachInfo.oldWindowId);
});

// tab closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (debugCalls) console.log('onRemoved');

  tryDetach(windowId);
});

// window selected
chrome.windows.onFocusChanged.addListener((windowId) => {
  console.log(windowId);
  if (windowId == -1) return;

  // this returns all tabs when the query fails
  chrome.tabs.query({ windowId: windowId, highlighted: true }, (tabs) => {
    if (tabs.length === 1) {
      let tab = tabs[0];

      chrome.windows.get(tab.windowId, (window) => {
        if (debugCalls) console.log('onFocusChanged');

        onTabSelected(tab.url, tab);
      });
    }
  });
});

// attach or detach from tab
function onTabSelected(url, tab) {
  let channelName = matchChannelName(url);

  if (!channelName) {
    // detach from window
    tryDetach(tab.windowId);
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
      settings.set(message.key, message.value);

      for (let id in attachedWindows) {
        tryDetach(id);
      }
      updateBadge();

      break;
    case 'location-updated':
      chrome.windows.get(sender.tab.windowId, {}, (window) => {
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
      chrome.windows.get(sender.tab.windowId, {}, (window) => {
        if (!window.focused) return;

        // get zoom value
        chrome.tabs.getZoom(sender.tab.id, (zoom) => {
          let size = {
            x: message.rect.x,
            pixelRatio: message.pixelRatio,
            width: Math.floor(message.rect.width * zoom),
            height: Math.floor(message.rect.height * zoom),
          };

          // attach to window
          tryAttach(sender.tab.windowId, window.state == 'fullscreen', {
            name: matchChannelName(sender.tab.url),
            size: size,
          });
        });
      });
      break;
    case 'detach':
      tryDetach(sender.tab.windowId);
      break;
  }
});



// attach chatterino to a chrome window
function tryAttach(windowId, fullscreen, data) {
  if (!settings.all().replaceTwitchChat) {
    return;
  }

  console.log('tryAttach ' + windowId);

  data.action = 'select';
  if (fullscreen) {
    data.attach_fullscreen = true;
  } else {
    data.attach = true;
  }
  data.type = 'twitch';
  data.winId = '' + windowId;
  data.version = 0;

  let port = getPort();

  if (port) {
    port.postMessage(data);
  }

  attachedWindows[windowId] = {};
}

// detach chatterino from a chrome window
function tryDetach(windowId) {
  if (attachedWindows[windowId] === undefined &&
    detachedWindowsCache[windowId] !== undefined) {
    return;
  }

  detachedWindowsCache[windowId] = {};

  console.log('tryDetach ' + windowId);

  let port = getPort();

  if (port) {
    port.postMessage({ action: 'detach', version: 0, winId: '' + windowId })
  }

  if (attachedWindows[windowId] !== undefined) {
    delete attachedWindows[windowId];
  }
}

function updateBadge() {
  chrome.browserAction.setBadgeText(
    { text: settings.all().replaceTwitchChat ? '' : 'off' });
}

(() => {
  let lastRect = {};
  let port = null;

  let settings = {};
  let installedObjects = {};
  let rightCollapseButton = null;
  let isCollapsed = false;
  let popupChatLink = null;
  let errorDiv = null;

  let showingChat = false;

  const ignoredPages = {
    'settings': true,
    'payments': true,
    'inventory': true,
    'messages': true,
    'subscriptions': true,
    'friends': true,
    'directory': true,
    'videos': true,
  };

  let errors = {};

  // return channel name if it should contain a chat or undefined
  function matchChannelName(url) {
    if (!url) return undefined;

    const match = url.match(
        /^https?:\/\/(?:www\.)?twitch\.tv\/([a-zA-Z0-9_]+)(?:\/(?!clip)(?:\?.*)?)?$/);

    let channelName;
    if (match && (channelName = match[1], !ignoredPages[channelName])) {
      return channelName;
    }

    return undefined;
  }

  let findChatDiv = () => document.getElementsByClassName('right-column')[0];
  let findRightCollapse = () =>
      document.getElementsByClassName('right-column__toggle-visibility')[0];
  let findRightColumn = () =>
      document.getElementsByClassName('channel-page__right-column')[0];
  let findNavBar = () => document.getElementsByClassName('top-nav__menu')[0];
  let findInfoBar = () =>
      document.getElementsByClassName('channel-info-bar__content-right')[0];

  // logging function
  function log(obj) {
    console.log('Chatterino: ', obj);
  }

  // install events
  function installChatterino() {
    if (matchChannelName(window.location.href)) {
      showingChat = true;
      if (settings.replaceTwitchChat) {
        replaceChat();
      } else {
        window.addEventListener(
            'hashchange',
            () => {chrome.runtime.sendMessage({'type': 'location-updated'})});
      }
    } else {
      showingChat = false;
      chrome.runtime.sendMessage({type: 'detach'});
    }
  }

  function replaceChat() {
    log('attempting to replacing chat');
    queryChatRect();

    let retry = false;

    // right collapse button
    if (!installedObjects.rightCollapse) {
      retry = true;

      let x = findRightCollapse();

      if (x != undefined) {
        rightCollapseButton = x;

        x.addEventListener('click', () => {
          let y = findChatDiv();

          if (parseInt(y.style.width) == 0) {
            y.style.width = '340px';
            isCollapsed = false;
          } else {
            y.style.width = 0;
            isCollapsed = true;
          }
        });

        installedObjects.rightCollapse = true;
      }
    }

    // right column
    if (!installedObjects.rightColumn && installedObjects.rightCollapse) {
      let x = findChatDiv();

      if (x != undefined && x.children.length >= 2) {
        x.children[0].innerHTML =
            '<div style="width: 340px; height: 100%; justify-content: center; display: flex; flex-direction: column; text-align: center; color: #999; user-select: none; background: #222;"></div>';

        errorDiv = x.children[0].children[0];
        updateErrors();

        installedObjects.rightColumn = true;
      } else {
        retry = true;
      }
    }

    // nav bar
    if (!installedObjects.topNav) {
      if (rightCollapseButton) {
        let x = findNavBar();

        x.addEventListener('mouseup', () => {
          if (!isCollapsed) {
            let collapse = findRightCollapse();
            collapse.click();
          }
        });

        installedObjects.topNav = true;
      } else {
        retry = true;
      }
    }

    // open popup link
    if (!installedObjects.infoBar) {
      let x = findInfoBar();

      if (x != undefined) {
        let link = document.createElement('a');
        link.target = '_blank';
        link.style.margin = '0 16px';
        link.style.color = '#ff9999';
        link.appendChild(
            document.createTextNode('Open popup chat (for resubs)'));

        x.appendChild(link);

        popupChatLink = link;
        updatePopupChatLink();
        installedObjects.infoBar = true;
      } else {
        retry = true;
      }
    }

    console.log(installedObjects);

    // retry if needed
    if (retry) {
      setTimeout(installChatterino, 1000);
    } else {
      log('installed all events');
    }
  }

  // query the rect of the chat
  function queryChatRect() {
    if (!showingChat) {
      return;
    }

    let element = findChatDiv();

    if (element === undefined) {
      log('failed to find chat div');
      return;
    }

    let rect = element.getBoundingClientRect();

    /* if (
      lastRect.left == rect.left &&
      lastRect.right == rect.right &&
      lastRect.top == rect.top &&
      lastRect.bottom == rect.bottom
    ) {
      // log("skipped sending message");
      return;
    } */
    lastRect = rect;

    let data = {
      type: 'chat-resized',
      rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
    };

    isCollapsed = rect.width == 0;

    try {
      chrome.runtime.sendMessage(data);
    } catch (err) {
      errors.sendMessage = true;
      updateErrors();
    }
  }

  function updateErrors() {
    if (!errorDiv) return;

    if (errors.sendMessage) {
      errorDiv.innerHTML =
          'Connection to the Chatterino extension lost!<br><br>' +
          'Please reload the page.';
    } else {
      errorDiv.innerHTML = 'Chatterino should show here:<br><br>' +
          'Try deselecting and selecting the page.<br>' +
          'Chatterino also needs to be running.<br>' +
          'You can temporarily disable the extension by clicking the icon.'

      '';
    }
  }

  function updatePopupChatLink() {
    if (popupChatLink !== null) {
      popupChatLink.href =
          '/popout/' + matchChannelName(window.location.href) + '/chat';
    }
  }

  log('hello there in the dev tools 👋');

  try {
    chrome.runtime.sendMessage({'type': 'get-settings'}, (settings_) => {
      log(settings_);

      settings = settings_;
      installChatterino();
    });
  } catch {
    errors.sendMessage = true;
    updateErrors();
  }

  // event listeners
  window.addEventListener('load', () => setTimeout(queryChatRect, 1000));
  window.addEventListener('resize', queryChatRect);
  window.addEventListener('focus', queryChatRect);
  window.addEventListener('mouseup', () => setTimeout(queryChatRect, 10));
  window.addEventListener('hashchange', () => {
    installedObjects = {};
    installChatterino();
    if (settings.replaceTwitchChat) {
      updatePopupChatLink();
    }
  });
})()

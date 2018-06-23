(() => {
  let lastRect = {};
  let port = null;

  let installedObjects = {};
  let rightCollapseButton = null;
  let isCollapsed = false;
  let popupChatLink = null;
  let errorDiv = null;

  const ignoredPages = {
    'settings': true,
    'payments': true,
    'inventory': true,
    'messages': true,
    'subscriptions': true,
    'friends': true,
    'directory': true,
  };

  let errors = {};

  // return channel name if it should contain a chat or undefined
  function matchChannelName(url) {
    if (!url) return undefined;

    const match = url.match(
        /^https?:\/\/(?:www\.)?twitch.tv\/([a-zA-Z0-9_]+)\/?(?:\?.*)?$/);

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
      document.getElementsByClassName('channel-info-bar__action-container')[0];

  // logging function
  function log(str) {
    console.log('Chatterino Native: ' + str);
  }

  // install events
  function installChatterino() {
    log('trying to install events');

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

    // retry if needed
    if (retry) {
      setTimeout(installChatterino, 1000);
    } else {
      log('installed all events');
    }
  }

  // query the rect of the chat
  function queryChatRect() {
    if (!matchChannelName(window.location.href)) return;

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

  function queryChatRectLoop() {
    queryChatRect();
    // setTimeout(queryCharRectLoop, 500);
  }

  function updateErrors() {
    if (!errorDiv) return;

    if (errors.sendMessage) {
      errorDiv.innerHTML =
          'The website lost connection to the chatterino extension.<br><br>' +
          'Please reload the page.';
    } else {
      errorDiv.innerHTML =
          'The extension could not connect to chatterino.<br><br>' +
          'Please focus the window or refresh the page.';
    }
  }

  function updatePopupChatLink() {
    if (popupChatLink !== null) {
      popupChatLink.href =
          '/popout/' + matchChannelName(window.location.href) + '/chat';
    }
  }

  // event listeners
  window.addEventListener('load', () => setTimeout(queryChatRect, 1000));
  window.addEventListener('resize', queryChatRect);
  window.addEventListener('focus', queryChatRect);
  window.addEventListener('mouseup', () => setTimeout(queryChatRect, 10));
  window.addEventListener('hashchange', () => {
    installedObjects = {};
    installChatterino();
    updatePopupChatLink();
  });

  //
  log('hello there in the dev tools 👋');

  queryChatRectLoop();
  installChatterino();
})()

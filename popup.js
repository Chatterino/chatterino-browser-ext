chrome.runtime.sendMessage({type: 'get-settings'}, (settings_) => {
  // replace twitch chat setting
  let item = document.querySelector('#replace-twitch');

  item.checked = settings_.replaceTwitchChat;

  item.onchange = e => {
    chrome.runtime.sendMessage({
      type: 'set-setting',
      key: 'replaceTwitchChat',
      value: item.checked,
    });
  };
});

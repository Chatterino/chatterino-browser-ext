chrome.runtime.sendMessage({ type: 'get-settings' }, settings_ => {
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

const platform = await chrome.runtime.getPlatformInfo();
if (platform.os === 'win') {
  document.body.classList.add('windows');
} else {
  document.getElementById('min-version').textContent = '2.5.3';
}

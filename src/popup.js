async function refreshSettings() {
  const replaceTwitchChat = await chrome.runtime.sendMessage({
    type: 'get-setting',
    key: 'replaceTwitchChat',
  });
  document.querySelector('#replace-twitch').checked = replaceTwitchChat;
}

document.querySelector('#replace-twitch').onchange = () => {
  chrome.runtime.sendMessage({
    type: 'set-setting',
    key: 'replaceTwitchChat',
    value: document.querySelector('#replace-twitch').checked,
  });
};
refreshSettings();
chrome.storage.local.onChanged.addListener(refreshSettings);

const platform = await chrome.runtime.getPlatformInfo();
if (platform.os === 'win') {
  document.body.classList.add('chatterino-windows');
} else {
  document.getElementById('min-version').textContent = '2.5.3';
}

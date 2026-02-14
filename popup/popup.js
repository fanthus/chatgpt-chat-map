(function () {
  'use strict';

  const KEY = 'chat-map-hidden';
  const checkbox = document.getElementById('hide-on-page');

  chrome.storage.local.get(KEY, (data) => {
    checkbox.checked = data[KEY] === true;
  });

  checkbox.addEventListener('change', () => {
    chrome.storage.local.set({ [KEY]: checkbox.checked });
  });
})();

(function () {
  'use strict';

  const STORAGE_KEY = 'chat-map-hidden';
  const STYLE_ID = 'chat-map-hide-style';
  const HIDE_CSS = '#chat-map-sidebar { display: none !important; }';

  function applyHide(hidden) {
    let el = document.getElementById(STYLE_ID);
    if (hidden) {
      if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = HIDE_CSS;
        (document.head || document.documentElement).appendChild(el);
      }
    } else if (el) {
      el.remove();
    }
  }

  function sync() {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      applyHide(data[STORAGE_KEY] === true);
    });
  }

  sync();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      applyHide(changes[STORAGE_KEY].newValue === true);
    }
  });
})();

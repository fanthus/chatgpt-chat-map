(function () {
  'use strict';

  function injectFonts() {
    if (document.getElementById('chat-map-fonts')) return;
    const link = document.createElement('link');
    link.id = 'chat-map-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap';
    document.head.appendChild(link);
  }

  const SIDEBAR_ID = 'chat-map-sidebar';
  const LIST_ID = 'chat-map-list';
  const USER_SELECTOR = 'div[data-message-author-role="user"]';
  const HIGHLIGHT_CLASS = 'chat-map-message-highlight';
  const MAX_PREVIEW_LEN = 48;

  let highlightedEl = null;

  function getPreviewText(el) {
    const raw = (el.textContent || '').trim().replace(/\s+/g, ' ');
    return raw.length > MAX_PREVIEW_LEN ? raw.slice(0, MAX_PREVIEW_LEN) + '…' : raw;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatNum = (n) => n.toString().padStart(2, '0');

  let conversationId = null;
  let conversationMap = new Map();
  let conversationFetch = null;
  let conversationFetchedAt = 0;

  function getReactFiber(node) {
    if (!node) return null;
    const key = Object.keys(node).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    return key ? node[key] : null;
  }

  function findFiberInSubtree(root) {
    if (!root) return null;
    let fiber = getReactFiber(root);
    if (fiber) return fiber;
    const roleNode = root.querySelector?.('[data-message-author-role]');
    if (roleNode) {
      fiber = getReactFiber(roleNode);
      if (fiber) return fiber;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let steps = 0;
    while (walker.nextNode() && steps < 60) {
      fiber = getReactFiber(walker.currentNode);
      if (fiber) return fiber;
      steps += 1;
    }
    return null;
  }

  function getConversationIdFromLocation() {
    const path = window.location.pathname || '';
    const match = path.match(/\/c\/([a-f0-9-]+)/i) || path.match(/\/chat\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  function coerceEpochSeconds(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function buildConversationMap(data) {
    const map = new Map();
    const nodes = data?.mapping ? Object.values(data.mapping) : [];
    nodes.forEach((node) => {
      const message = node?.message;
      const id = message?.id || node?.id;
      if (!id) return;
      const createTime = coerceEpochSeconds(message?.create_time);
      if (!createTime) return;
      map.set(id, { createTime, role: message?.author?.role || null });
    });
    return map;
  }

  async function fetchConversationMap() {
    const id = getConversationIdFromLocation();
    if (!id) return;
    if (conversationFetch) return conversationFetch;
    conversationFetch = (async () => {
      try {
        const res = await fetch(`${window.location.origin}/backend-api/conversation/${id}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        conversationMap = buildConversationMap(data);
        conversationFetchedAt = Date.now();
      } catch (e) {
        console.warn('[ChatGPT Chat Map] conversation fetch failed', e);
      } finally {
        conversationFetch = null;
      }
    })();
    return conversationFetch;
  }

  function findMessageFromFiber(fiber) {
    let current = fiber;
    for (let i = 0; i < 10 && current; i += 1) {
      const props = current.memoizedProps || current.pendingProps;
      if (props?.message?.create_time) return props.message;
      if (props?.msg?.create_time) return props.msg;
      if (props?.messages) {
        if (Array.isArray(props.messages)) {
          const msg = props.messages.find((item) => item?.create_time);
          if (msg) return msg;
        } else if (typeof props.messages === 'object') {
          const values = Object.values(props.messages);
          const msg = values.find((item) => item?.create_time);
          if (msg) return msg;
        }
      }
      current = current.return;
    }
    return null;
  }

  function formatTimestamp(createTime) {
    const date = new Date(createTime * 1000);
    if (Number.isNaN(date.getTime())) return null;
    const use24Hour = localStorage.getItem('chatgpt-timestamps-24h-format') !== 'false';
    if (use24Hour) {
      return `${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()} - ${formatNum(date.getHours())}:${formatNum(date.getMinutes())}:${formatNum(date.getSeconds())}`;
    }
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()} - ${hours}:${formatNum(date.getMinutes())}:${formatNum(date.getSeconds())} ${ampm}`;
  }

  function buildMessageTimeMap() {
    const currentId = getConversationIdFromLocation();
    if (currentId && currentId !== conversationId) {
      conversationId = currentId;
      conversationMap = new Map();
      conversationFetchedAt = 0;
    }
    if (!conversationMap.size && currentId) {
      const stale = !conversationFetchedAt || Date.now() - conversationFetchedAt > 30000;
      if (stale) {
        fetchConversationMap().then(() => {
          setTimeout(refresh, 0);
        });
      }
    }

    const map = new Map();
    document.querySelectorAll('div[data-message-id]').forEach((div) => {
      const messageId = div.getAttribute('data-message-id');
      if (messageId && conversationMap.has(messageId)) {
        const entry = conversationMap.get(messageId);
        const formatted = formatTimestamp(entry.createTime);
        if (formatted) map.set(div, formatted);
        return;
      }
      const fiber = findFiberInSubtree(div);
      if (!fiber) return;
      const message = findMessageFromFiber(fiber);
      const timestamp = coerceEpochSeconds(message?.create_time);
      if (!timestamp) return;
      const formatted = formatTimestamp(timestamp);
      if (formatted) map.set(div, formatted);
    });
    return map;
  }

  function collectUserMessages() {
    const timeMap = buildMessageTimeMap();
    const nodes = document.querySelectorAll(USER_SELECTOR);
    return Array.from(nodes).map((el) => {
      const container = el.closest('div[data-message-id]');
      return {
        el,
        text: getPreviewText(el),
        time: (container && timeMap.get(container)) ?? null,
      };
    });
  }

  function ensureSidebar() {
    let root = document.getElementById(SIDEBAR_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = SIDEBAR_ID;
    root.setAttribute('aria-label', '用户消息列表');
    const title = document.createElement('h2');
    title.className = 'chat-map-title';
    title.textContent = 'ChatGPT Chat Map';
    root.appendChild(title);
    const list = document.createElement('ol');
    list.id = LIST_ID;
    list.className = 'chat-map-list';
    root.appendChild(list);
    document.body.appendChild(root);
    return root;
  }

  function setMessageHighlight(el) {
    if (highlightedEl && highlightedEl !== el) {
      highlightedEl.classList.remove(HIGHLIGHT_CLASS);
    }
    highlightedEl = el;
    el.classList.add(HIGHLIGHT_CLASS);
  }

  function scrollToElement(el) {
    setMessageHighlight(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function copyMessageText(el) {
    const raw = (el.textContent || '').trim();
    if (!raw) return;
    navigator.clipboard.writeText(raw).catch(() => {});
  }

  function renderList(items) {
    const root = ensureSidebar();
    const list = root.querySelector(`#${LIST_ID}`);
    list.innerHTML = '';
    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'chat-map-item';
      const topRow = document.createElement('div');
      topRow.className = 'chat-map-item-top';
      const timeSpan = document.createElement('span');
      timeSpan.className = 'chat-map-item-time';
      timeSpan.textContent = item.time ?? '—';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'chat-map-item-copy';
      copyBtn.setAttribute('aria-label', '复制');
      copyBtn.textContent = '复制';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyMessageText(item.el);
        const t = copyBtn.textContent;
        copyBtn.textContent = '已复制';
        copyBtn.disabled = true;
        setTimeout(() => {
          copyBtn.textContent = t;
          copyBtn.disabled = false;
        }, 800);
      });
      topRow.appendChild(timeSpan);
      topRow.appendChild(copyBtn);
      const label = document.createElement('span');
      label.className = 'chat-map-item-label';
      label.textContent = item.text || `(消息 ${index + 1})`;
      li.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        scrollToElement(item.el);
      });
      li.appendChild(topRow);
      li.appendChild(label);
      list.appendChild(li);
    });
  }

  function refresh() {
    if (highlightedEl && highlightedEl.isConnected) {
      highlightedEl.classList.remove(HIGHLIGHT_CLASS);
    }
    highlightedEl = null;
    const items = collectUserMessages();
    if (items.length === 0) {
      const root = document.getElementById(SIDEBAR_ID);
      if (root) root.classList.add('chat-map-empty');
      return;
    }
    const root = document.getElementById(SIDEBAR_ID);
    if (root) root.classList.remove('chat-map-empty');
    renderList(items);
  }

  function observeConversation() {
    const target = document.body;
    if (!target) return;
    let raf = 0;
    const observer = new MutationObserver((mutations) => {
      const ours = document.getElementById(SIDEBAR_ID);
      const onlyOurs = ours && mutations.every((m) => ours.contains(m.target));
      if (onlyOurs) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        try {
          refresh();
        } catch (e) {
          console.warn('[ChatGPT Chat Map] refresh failed', e);
        }
      });
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function init() {
    try {
      injectFonts();
      refresh();
      observeConversation();
      window.addEventListener('storage', (e) => {
        if (e.key === 'chatgpt-timestamps-24h-format') {
          refresh();
        }
      });
    } catch (e) {
      console.warn('[ChatGPT Chat Map] init failed', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

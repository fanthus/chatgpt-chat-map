(function () {
  'use strict';

  const SIDEBAR_ID = 'chat-map-sidebar';
  const LIST_ID = 'chat-map-list';
  const HOVER_TOOLTIP_ID = 'chat-map-hover-tooltip';
  const USER_SELECTOR = 'div[data-message-author-role="user"]';
  const HIGHLIGHT_CLASS = 'chat-map-message-highlight';
  const MAX_PREVIEW_LEN = 48;

  let highlightedEl = null;
  let hoverTooltipEl = null;

  function getMessageText(el) {
    return (el.textContent || '').trim();
  }

  function getPreviewText(el) {
    const raw = getMessageText(el).replace(/\s+/g, ' ');
    return raw.length > MAX_PREVIEW_LEN ? raw.slice(0, MAX_PREVIEW_LEN) + '…' : raw;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatNum = (n) => n.toString().padStart(2, '0');

  let conversationId = null;
  let conversationMap = new Map();
  let conversationData = null;
  let conversationFetch = null;
  let conversationFetchedAt = 0;
  let lastClickTime = 0;
  const REFRESH_DEBOUNCE_MS = 400;
  let lastItemKeys = null;
  let sidebarCollapsed = false;
  const SIDEBAR_COLLAPSED_KEY = 'chat-map-sidebar-collapsed';

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

  function syncConversationContext() {
    const currentId = getConversationIdFromLocation();
    if (currentId && currentId !== conversationId) {
      conversationId = currentId;
      conversationMap = new Map();
      conversationData = null;
      conversationFetch = null;
      conversationFetchedAt = 0;
    }
    return currentId;
  }

  async function fetchConversationMap(force = false) {
    const id = syncConversationContext();
    if (!id) return;
    const stale =
      force ||
      !conversationFetchedAt ||
      Date.now() - conversationFetchedAt > 30000 ||
      !conversationMap.size ||
      !conversationData;
    if (!stale && conversationData) return conversationData;
    if (conversationFetch) return conversationFetch;
    conversationFetch = (async () => {
      try {
        const res = await fetch(`${window.location.origin}/backend-api/conversation/${id}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        conversationData = data;
        conversationMap = buildConversationMap(data);
        conversationFetchedAt = Date.now();
        return data;
      } catch (e) {
        console.warn('[ChatGPT Chat Map] conversation fetch failed', e);
        return null;
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
    const currentId = syncConversationContext();
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
      const messageId = container?.getAttribute('data-message-id') ?? null;
      return {
        el,
        messageId,
        fullText: getMessageText(el),
        text: getPreviewText(el),
        time: (container && timeMap.get(container)) ?? null,
      };
    });
  }

  function extractMessageTextFromContent(content) {
    if (!content) return '';
    const parts = Array.isArray(content.parts) ? content.parts : null;
    if (parts) {
      const text = parts
        .map((part) => {
          if (typeof part === 'string') return part;
          if (typeof part === 'number' || typeof part === 'boolean') return String(part);
          if (part && typeof part === 'object') {
            if (typeof part.text === 'string') return part.text;
            if (typeof part.content === 'string') return part.content;
            if (typeof part.caption === 'string') return part.caption;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
      if (text) return text;
    }
    if (typeof content.text === 'string') return content.text.trim();
    if (typeof content === 'string') return content.trim();
    if (typeof content.content_type === 'string') return `[${content.content_type}]`;
    return '';
  }

  function collectConversationMessagesFromApi(data) {
    const mapping = data?.mapping;
    if (!mapping || typeof mapping !== 'object') return [];
    const orderedNodeIds = [];
    const seen = new Set();
    let nodeId = data?.current_node;
    while (nodeId && !seen.has(nodeId)) {
      seen.add(nodeId);
      const node = mapping[nodeId];
      if (!node) break;
      orderedNodeIds.push(nodeId);
      nodeId = node.parent;
    }
    if (!orderedNodeIds.length) return [];
    orderedNodeIds.reverse();

    return orderedNodeIds
      .map((id) => {
        const node = mapping[id];
        const message = node?.message;
        const role = message?.author?.role;
        if (role !== 'user' && role !== 'assistant') return null;
        const text = extractMessageTextFromContent(message?.content);
        if (!text) return null;
        const createTime = coerceEpochSeconds(message?.create_time);
        return {
          role,
          text,
          time: createTime ? formatTimestamp(createTime) : null,
        };
      })
      .filter(Boolean);
  }

  function collectConversationMessagesFromDom() {
    return Array.from(document.querySelectorAll('div[data-message-author-role]'))
      .map((el) => {
        const role = el.getAttribute('data-message-author-role');
        if (role !== 'user' && role !== 'assistant') return null;
        const text = getMessageText(el);
        if (!text) return null;
        return { role, text, time: null };
      })
      .filter(Boolean);
  }

  function formatExportRole(role) {
    return role === 'assistant' ? 'AI' : 'User';
  }

  function buildExportMarkdown(messages, meta) {
    const lines = [
      `# ${meta.title || 'ChatGPT Conversation Export'}`,
      '',
      `- Exported At: ${new Date().toLocaleString()}`,
      `- Conversation ID: ${meta.id || 'unknown'}`,
      `- Page: ${window.location.href}`,
      `- Message Count: ${messages.length}`,
      '',
    ];
    messages.forEach((message, idx) => {
      const title = `## ${idx + 1}. ${formatExportRole(message.role)}${message.time ? ` (${message.time})` : ''}`;
      lines.push(title, '', message.text, '');
    });
    return lines.join('\n');
  }

  function buildExportFilename(title) {
    const now = new Date();
    const stamp = `${now.getFullYear()}${formatNum(now.getMonth() + 1)}${formatNum(now.getDate())}-${formatNum(now.getHours())}${formatNum(now.getMinutes())}${formatNum(now.getSeconds())}`;
    const safeTitle = (title || 'chatgpt-conversation')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48);
    const base = safeTitle || 'chatgpt-conversation';
    return `${base}-${stamp}.md`;
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function exportConversation(button) {
    if (!button || button.disabled) return;
    const originalText = button.textContent || 'Export';
    button.disabled = true;
    button.textContent = 'Exporting...';
    try {
      const data = await fetchConversationMap(true);
      let messages = collectConversationMessagesFromApi(data);
      if (!messages.length) messages = collectConversationMessagesFromDom();
      if (!messages.length) throw new Error('no messages');
      const title = data?.title || document.title || 'chatgpt-conversation';
      const markdown = buildExportMarkdown(messages, {
        title,
        id: getConversationIdFromLocation(),
      });
      const filename = buildExportFilename(title);
      downloadTextFile(filename, markdown);
      button.textContent = 'Downloaded';
    } catch (e) {
      console.warn('[ChatGPT Chat Map] export failed', e);
      button.textContent = 'Export Failed';
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 1200);
    }
  }

  function createCollapseButton(root) {
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'chat-map-collapse-btn';
    collapseBtn.setAttribute('aria-label', sidebarCollapsed ? 'Expand panel' : 'Collapse panel');
    collapseBtn.innerHTML = sidebarCollapsed ? getExpandSvg() : getCollapseSvg();
    collapseBtn.addEventListener('click', () => {
      sidebarCollapsed = !sidebarCollapsed;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
      root.classList.toggle('chat-map-collapsed', sidebarCollapsed);
      collapseBtn.setAttribute('aria-label', sidebarCollapsed ? 'Expand panel' : 'Collapse panel');
      collapseBtn.innerHTML = sidebarCollapsed ? getExpandSvg() : getCollapseSvg();
    });
    return collapseBtn;
  }

  function createHeader(root, titleValue) {
    const header = document.createElement('div');
    header.className = 'chat-map-header';
    const titleText = document.createElement('span');
    titleText.className = 'chat-map-title';
    titleText.textContent = titleValue || 'ChatGPT Chat Map';

    const actions = document.createElement('div');
    actions.className = 'chat-map-header-actions';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'chat-map-export-btn';
    exportBtn.setAttribute('aria-label', 'Export conversation');
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportConversation(exportBtn);
    });

    const collapseBtn = createCollapseButton(root);

    actions.appendChild(exportBtn);
    actions.appendChild(collapseBtn);
    header.appendChild(titleText);
    header.appendChild(actions);
    return header;
  }

  function injectHeaderControls(root) {
    const oldHeader = root.querySelector('.chat-map-header');
    const titleValue = root.querySelector('.chat-map-title')?.textContent || 'ChatGPT Chat Map';
    const nextHeader = createHeader(root, titleValue);
    if (oldHeader) {
      oldHeader.replaceWith(nextHeader);
    } else {
      root.prepend(nextHeader);
    }
  }

  function ensureSidebar() {
    let root = document.getElementById(SIDEBAR_ID);
    if (root) {
      if (!root.querySelector('.chat-map-collapse-btn') || !root.querySelector('.chat-map-export-btn')) {
        sidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
        injectHeaderControls(root);
      }
      return root;
    }
    sidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    root = document.createElement('div');
    root.id = SIDEBAR_ID;
    root.setAttribute('aria-label', 'Chat message list');
    if (sidebarCollapsed) root.classList.add('chat-map-collapsed');

    const header = createHeader(root, 'ChatGPT Chat Map');
    root.appendChild(header);

    const list = document.createElement('ol');
    list.id = LIST_ID;
    list.className = 'chat-map-list';
    root.appendChild(list);
    document.body.appendChild(root);
    return root;
  }

  function getCollapseSvg() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
  }

  function getExpandSvg() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
  }

  function setMessageHighlight(el) {
    if (highlightedEl && highlightedEl !== el) {
      highlightedEl.classList.remove(HIGHLIGHT_CLASS);
    }
    highlightedEl = el;
    el.classList.add(HIGHLIGHT_CLASS);
  }

  function getScrollParent(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (/auto|scroll|overlay/.test(style.overflowY) && node.scrollHeight > node.clientHeight)
        return node;
      node = node.parentElement;
    }
    return null;
  }

  function scrollToElement(el) {
    setMessageHighlight(el);
    const scrollParent = getScrollParent(el);
    const duration = 350;
    const startTime = performance.now();
    let startScroll;
    let targetScroll;
    if (scrollParent) {
      const cr = scrollParent.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      startScroll = scrollParent.scrollTop;
      targetScroll = startScroll + (er.top - cr.top);
    } else {
      startScroll = window.scrollY;
      targetScroll = el.getBoundingClientRect().top + window.scrollY;
    }

    function easeOutQuad(t) {
      return 1 - (1 - t) * (1 - t);
    }

    function step(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = easeOutQuad(t);
      const value = startScroll + (targetScroll - startScroll) * eased;
      if (scrollParent) scrollParent.scrollTop = value;
      else window.scrollTo(0, value);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function copyMessageText(el) {
    const raw = (el.textContent || '').trim();
    if (!raw) return;
    navigator.clipboard.writeText(raw).catch(() => {});
  }

  function ensureHoverTooltip() {
    if (hoverTooltipEl?.isConnected) return hoverTooltipEl;
    hoverTooltipEl = document.getElementById(HOVER_TOOLTIP_ID);
    if (hoverTooltipEl) return hoverTooltipEl;
    hoverTooltipEl = document.createElement('div');
    hoverTooltipEl.id = HOVER_TOOLTIP_ID;
    document.body.appendChild(hoverTooltipEl);
    return hoverTooltipEl;
  }

  function positionHoverTooltip(anchorEl, tooltipEl) {
    if (!anchorEl || !tooltipEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    const gap = 12;
    const pad = 10;
    let left = rect.left - tipRect.width - gap;
    let side = 'left';
    if (left < pad) {
      side = 'right';
      left = rect.right + gap;
    }
    if (left + tipRect.width > window.innerWidth - pad) {
      left = window.innerWidth - tipRect.width - pad;
    }
    if (left < pad) left = pad;
    let top = rect.top;
    if (top + tipRect.height > window.innerHeight - pad) top = window.innerHeight - tipRect.height - pad;
    if (top < pad) top = pad;
    tooltipEl.setAttribute('data-side', side);
    tooltipEl.style.left = `${Math.round(left)}px`;
    tooltipEl.style.top = `${Math.round(top)}px`;
  }

  function showHoverTooltip(anchorEl, text) {
    if (!text) return;
    const tooltipEl = ensureHoverTooltip();
    tooltipEl.textContent = text;
    tooltipEl.classList.add('chat-map-hover-tooltip-visible');
    positionHoverTooltip(anchorEl, tooltipEl);
  }

  function hideHoverTooltip() {
    if (!hoverTooltipEl?.isConnected) return;
    hoverTooltipEl.classList.remove('chat-map-hover-tooltip-visible');
    hoverTooltipEl.textContent = '';
  }

  function renderList(items) {
    const root = ensureSidebar();
    const list = root.querySelector(`#${LIST_ID}`);
    hideHoverTooltip();
    list.innerHTML = '';
    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'chat-map-item';
      const fallbackText = `(Message ${index + 1})`;
      const previewText = item.text || fallbackText;
      const fullText = item.fullText || previewText;
      const topRow = document.createElement('div');
      topRow.className = 'chat-map-item-top';
      const timeSpan = document.createElement('span');
      timeSpan.className = 'chat-map-item-time';
      timeSpan.textContent = item.time ?? '—';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'chat-map-item-copy';
      copyBtn.setAttribute('aria-label', 'Copy message');
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyMessageText(item.el);
        const t = copyBtn.textContent;
        copyBtn.textContent = 'Copied';
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
      label.textContent = previewText;
      li.addEventListener('mouseenter', () => {
        showHoverTooltip(li, fullText);
      });
      li.addEventListener('mousemove', () => {
        if (hoverTooltipEl?.classList.contains('chat-map-hover-tooltip-visible')) {
          positionHoverTooltip(li, hoverTooltipEl);
        }
      });
      li.addEventListener('mouseleave', hideHoverTooltip);
      li.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        hideHoverTooltip();
        lastClickTime = Date.now();
        const target =
          (item.messageId && document.querySelector(`div[data-message-id="${item.messageId}"]`)) ||
          (item.el?.isConnected ? item.el : null);
        if (target) scrollToElement(target);
      });
      li.appendChild(topRow);
      li.appendChild(label);
      list.appendChild(li);
    });
  }

  function itemKeys(items) {
    return items.map((i) => i.messageId ?? i.text?.slice(0, 80) ?? '').join('\0');
  }

  function refresh() {
    if (highlightedEl && highlightedEl.isConnected) {
      highlightedEl.classList.remove(HIGHLIGHT_CLASS);
    }
    highlightedEl = null;
    const items = collectUserMessages();
    if (items.length === 0) {
      hideHoverTooltip();
      const root = document.getElementById(SIDEBAR_ID);
      if (root) root.classList.add('chat-map-empty');
      lastItemKeys = null;
      return;
    }
    const root = document.getElementById(SIDEBAR_ID);
    if (root) root.classList.remove('chat-map-empty');
    const keys = itemKeys(items);
    if (lastItemKeys === keys) return;
    lastItemKeys = keys;
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
      if (Date.now() - lastClickTime < REFRESH_DEBOUNCE_MS) return;
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
      refresh();
      observeConversation();
      window.addEventListener('storage', (e) => {
        if (e.key === 'chatgpt-timestamps-24h-format') {
          refresh();
        }
      });
      window.addEventListener('scroll', hideHoverTooltip, true);
      window.addEventListener('resize', hideHoverTooltip);
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

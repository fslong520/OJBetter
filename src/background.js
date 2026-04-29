/**
 * Background Service Worker
 * 处理提示生成、侧边栏管理、消息路由
 */

import { hintGenerator } from './ai/providers.js';
import { getSettings, saveSettings } from './storage/settings.js';
import { addHistory, getRecentHistory } from './storage/history.js';
import { learningPlanGenerator } from './learning-plan/generator.js';

// ==================== Install ====================
chrome.runtime.onInstalled.addListener(() => {
  console.log('OJBetter 已安装');

  chrome.contextMenus.create({
    id: 'coach-coach',
    title: '✨ 灵光一下，小智帮你',
    contexts: ['selection']
  });
});

// ==================== Context Menu ====================
chrome.contextMenus.onClicked.addListener((info, tab) => {
  chrome.storage.local.set({
    pendingHint: {
      problemText: info.selectionText,
      level: 0
    }
  }).then(async () => {
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) await chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
    }
  });
});

// ==================== Action Click ====================
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-side-panel') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {
          chrome.sidePanel.open({ windowId: tabs[0].windowId }).catch(() => {});
        });
      }
    });
  }
});

// ==================== Message Router ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

// ==================== Storage-based Stream ====================
async function startStreaming(message, sender) {
  const { streamId, problemText, hintLevel, previousHints, chatHistory, coachMode, isTranslate } = message;
  const key = 'stream:' + streamId;
  const set = (obj) => chrome.storage.local.set({ [key]: obj }).catch(() => {});

  set({ status: 'thinking', thinking: '', content: '' });

  // 增量缓冲：只写增量，不写全量，降低存储压力
  let accT = '', accC = '';
  let pendT = '', pendC = '', timer = null;
  const FLUSH_MS = 800; // 安全频率：~75次/分钟，远低于120限制

  const flush = () => {
    if (pendT || pendC) {
      accT += pendT; accC += pendC;
      const delta = {};
      if (pendT) delta.thinkDelta = pendT;
      if (pendC) delta.contentDelta = pendC;
      delta.thinkLen = accT.length;
      delta.contentLen = accC.length;
      set({ status: 'streaming', ...delta });
      pendT = ''; pendC = '';
    }
    timer = null;
  };

  // 翻译模式：不传思考内容，减少写入量
  const onThinking = (t) => {
    if (isTranslate) return; // 翻译不需要思考显示
    pendT += t;
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  };
  const onContent = (c) => {
    pendC += c;
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  };
  const onDone = (full) => {
    clearTimeout(timer); flush();
    set({ status: 'done', content: accC || full || '', thinkLen: accT.length, contentLen: (accC || full || '').length });
    addHistory({ question: String(problemText||'').slice(0,200), answer: full || accC, hintLevel: hintLevel || 0, url: '' }).catch(()=>{});
    setTimeout(() => chrome.storage.local.remove(key).catch(()=>{}), 60000);
  };
  const onError = (e) => {
    clearTimeout(timer); flush();
    set({ status: 'error', error: e.message });
    setTimeout(() => chrome.storage.local.remove(key).catch(()=>{}), 60000);
  };

  try {
    if (isTranslate) {
      await hintGenerator.translateStream(problemText, onThinking, onContent, onDone, onError);
    } else if (coachMode) {
      await hintGenerator.coachChat(problemText, chatHistory || [], onThinking, onContent, onDone, onError);
    } else {
      await hintGenerator.generateHintStream(problemText, hintLevel || 2, previousHints || [], onThinking, onContent, onDone, onError);
    }
  } catch (e) {
    onError(e);
  }
}

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'generateHint':
      return handleGenerateHint(message, sender);
    case 'getHistory':
      return { history: await getRecentHistory(20) };
    case 'getLearningPlan':
      return { plan: await learningPlanGenerator.generatePlan() };
    case 'getSettings':
      return { settings: await getSettings() };
    case 'saveSettings':
      await saveSettings(message.settings);
      return { success: true };
    case 'getCurrentPageContent':
      return getPageContent(sender);
    case 'startStream':
      startStreaming(message, sender);
      return { status: 'started' };
    case 'translate':
      return handleTranslate(message, sender);
    case 'openSidePanel':
      chrome.sidePanel.open({ tabId: sender.tab?.id }).catch(() => {
        chrome.sidePanel.open({ windowId: sender.tab?.windowId }).catch(() => {});
      });
      return { success: true };
    default:
      return { error: 'Unknown message type' };
  }
}

// ==================== Hint Generation ====================
async function handleGenerateHint(message, sender) {
  const { problemText, hintLevel, previousHints } = message;
  const result = await hintGenerator.generateHint(
    problemText.slice(0, 3000),
    hintLevel || 2,
    previousHints || []
  );

  await addHistory({
    question: problemText.slice(0, 200),
    answer: result,
    hintLevel: hintLevel || 2,
    url: sender?.tab?.url || ''
  });

  return { hint: result };
}

// ==================== Translate ====================
async function handleTranslate(message, sender) {
  const { problemText } = message;
  const result = await hintGenerator.translate(problemText.slice(0, 3000));
  return { translated: result };
}

// ==================== Page Content ====================
async function getPageContent(sender) {
  let tabId = sender?.tab?.id;
  if (!tabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) return { content: '', error: '未找到活跃标签页' };
    tabId = tabs[0].id;
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'capturePageContent' });
    if (response?.content) {
      // response.content 可能是字符串，也可能是对象
      const content = typeof response.content === 'string' ? response.content : String(response.content);
      return { content, isHTML: response.isHTML || false };
    }
  } catch (e) {
    console.debug('sendMessage failed, fallback to executeScript:', e.message);
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const el = document.querySelector('#task-statement, main, article, [class*="problem"], [class*="question"], .markdown-body, #app');
          if (!el) return { content: (document.body?.innerText || '').slice(0, 3000), isHTML: false };
          const clone = el.cloneNode(true);
          clone.querySelectorAll('script, style, noscript, svg, .katex-mathml, nav, footer, header, iframe, img, .btn-copy').forEach(n => n.remove());
          let html = clone.innerHTML;
          if (html.length > 10000) html = html.slice(0, 10000);
          return { content: html, isHTML: true };
        } catch (e) {
          return { content: (document.body?.innerText || '').slice(0, 3000), isHTML: false };
        }
      }
    });
    const r = results[0]?.result;
    // executeScript 返回 { content, isHTML }，直接透传
    if (typeof r === 'object' && r !== null && 'content' in r) return r;
    return { content: String(r || '') };
  } catch (e) {
    console.warn('executeScript failed:', e.message);
    return { content: '', error: e.message };
  }
}

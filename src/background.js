/**
 * Background Service Worker
 * 处理提示生成、侧边栏管理、消息路由
 */

import { hintGenerator } from './ai/providers.js';
import { getSettings, saveSettings } from './storage/settings.js';
import { addHistory, getRecentHistory, getAllHistory, getHistoryByDay, exportHistory, clearHistory } from './storage/history.js';
import { learningPlanGenerator } from './learning-plan/generator.js';

// ==================== Install ====================
chrome.runtime.onInstalled.addListener((details) => {
  console.log('OJBetter 已安装');
  chrome.storage.local.set({ isFirstOpen: true });

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
  chrome.storage.local.set({ lastOpenedByIcon: true });
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

  // ==================== Port-based Keepalive ====================
// MV3 service worker 休眠是流式中断的根因。
// 使用 chrome.alarms + 长连接 双重保活，确保长思考模型不会中断。
const _streamPorts = new Map();
let _activeStreams = new Set(); // 当前活跃的 streamId

// 启动流式保活：创建 chrome alarm 防止 Service Worker 休眠
function startStreamKeepalive(streamId) {
  _activeStreams.add(streamId);
  const alarmName = 'ojbetter-keepalive-' + streamId;
  console.log('[keepalive] Starting for', streamId);
  chrome.alarms.create(alarmName, { delayInMinutes: 0.25, periodInMinutes: 0.25 }); // 每 15 秒
}

// 停止流式保活
function stopStreamKeepalive(streamId) {
  _activeStreams.delete(streamId);
  const alarmName = 'ojbetter-keepalive-' + streamId;
  console.log('[keepalive] Stopping for', streamId);
  chrome.alarms.clear(alarmName).catch(() => {});
}

// Alarm 触发器：定期唤醒 Service Worker，向 storage 写入心跳
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('ojbetter-keepalive-')) {
    const streamId = alarm.name.replace('ojbetter-keepalive-', '');
    const key = 'stream:' + streamId;
    chrome.storage.local.set({
      [key]: { status: 'streaming', keepalive: Date.now() }
    }).catch(() => {});
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name?.startsWith('stream-keepalive:')) {
    const streamId = port.name.split(':')[1];
    _streamPorts.set(streamId, port);
    port.onDisconnect.addListener(() => {
      _streamPorts.delete(streamId);
    });
  }
});

// ==================== Storage-based Stream ====================
async function startStreaming(message, sender) {
  const { streamId, problemText, hintLevel, previousHints, chatHistory, coachMode, isTranslate } = message;
  const key = 'stream:' + streamId;
  const set = (obj) => chrome.storage.local.set({ [key]: obj });

  try {
    await set({ status: 'thinking', thinking: '', content: '' });
  } catch (e) {
    console.error('Failed to init stream storage:', e);
    return;
  }

  // 增量缓冲：只写增量，不写全量，降低存储压力
  let accT = '', accC = '';
  let pendT = '', pendC = '', timer = null;
  const FLUSH_MS = 100; // Increase streaming frequency for smoother feel (60fps range)

  const flush = () => {
    if (pendT || pendC) {
      const dt = pendT; const dc = pendC;
      pendT = ''; pendC = '';
      accT += dt; accC += dc;
      const delta = {};
      if (dt) delta.thinkDelta = dt;
      if (dc) delta.contentDelta = dc;
      delta.thinkLen = accT.length;
      delta.contentLen = accC.length;
      set({ status: 'streaming', ...delta }).catch(e => console.error('Stream flush failed:', e));
    }
    timer = null;
  };

  const onThinking = (t) => {
    pendT += t;
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  };
  const onContent = (c) => {
    pendC += c;
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  };
  // 启动双层 keepalive：chrome.alarms 防止 Service Worker 休眠
  startStreamKeepalive(streamId);

  const cleanupStream = () => {
    stopStreamKeepalive(streamId);
    const port = _streamPorts.get(streamId);
    if (port) { try { port.disconnect(); } catch(_) {} }
  };

  const onDone = (full) => {
    clearTimeout(timer); flush();
    const finalAnswer = full || accC || '';
    set({ status: 'done', content: finalAnswer, thinkLen: accT.length, contentLen: finalAnswer.length }).catch(e => console.error('Stream onDone failed:', e));
    // 把最终助手回复补进 chatHistory
    const updatedChat = [...(chatHistory || [])];
    if (finalAnswer.trim()) updatedChat.push({ role: 'assistant', content: finalAnswer });
    addHistory({ 
      question: String(problemText||'').slice(0, 200),
      fullQuestion: String(problemText||'').slice(0, 4000),
      answer: finalAnswer,
      hintLevel: hintLevel || 0,
      url: '',
      chatHistory: updatedChat
    }).catch(()=>{});
    cleanupStream();
    setTimeout(() => chrome.storage.local.remove(key).catch(()=>{}), 600000);
  };
  const onError = (e) => {
    clearTimeout(timer); flush();
    set({ status: 'error', error: e.message || String(e) }).catch(err => console.error('Stream onError failed:', err));
    cleanupStream();
    setTimeout(() => chrome.storage.local.remove(key).catch(()=>{}), 600000);
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

// ==================== 学习计划流式生成 ====================
async function startPlanStreaming(message, sender) {
  const { streamId, chatHistory, problemText } = message;
  const key = 'plan:' + streamId;
  const set = (obj) => chrome.storage.local.set({ [key]: obj });

  try {
    await set({ status: 'thinking', thinking: '', content: '' });
  } catch (e) {
    console.error('Failed to init plan stream:', e);
    return;
  }

  let accT = '', accC = '';
  let pendT = '', pendC = '', timer = null;
  const FLUSH_MS = 100;

  const flush = () => {
    if (pendT || pendC) {
      const dt = pendT; const dc = pendC;
      pendT = ''; pendC = '';
      accT += dt; accC += dc;
      const delta = {};
      if (dt) delta.thinkDelta = dt;
      if (dc) delta.contentDelta = dc;
      set({ status: 'streaming', ...delta }).catch(e => console.error('Plan flush failed:', e));
    }
    timer = null;
  };

  const onThinking = (t) => {
    pendT += t;
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  };
  const onContent = (c) => {
    pendC += c;
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  };
  const onDone = (full) => {
    clearTimeout(timer); flush();
    set({ status: 'done', content: full || accC || '' }).catch(e => console.error('Plan onDone failed:', e));
    setTimeout(() => chrome.storage.local.remove(key).catch(()=>{}), 600000);
  };
  const onError = (e) => {
    clearTimeout(timer); flush();
    set({ status: 'error', error: e.message || String(e) }).catch(err => console.error('Plan onError failed:', err));
    setTimeout(() => chrome.storage.local.remove(key).catch(()=>{}), 600000);
  };

  try {
    await learningPlanGenerator.streamPlan(chatHistory || [], problemText || '', onThinking, onContent, onDone, onError);
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
    case 'getAllHistory':
      return { records: await getAllHistory() };
    case 'getHistoryByDay':
      return { days: await getHistoryByDay() };
    case 'exportHistory':
      exportHistory(message.date);
      return { success: true };
    case 'clearHistory':
      await clearHistory();
      return { success: true };
    case 'getLearningPlan':
      // 流式学习计划现在改由 startPlanStream 处理，这里保留降级逻辑
      return { plan: await learningPlanGenerator.generatePlanFallback(await learningPlanGenerator.analyzeHistory()) };
    case 'startPlanStream':
      startPlanStreaming(message, sender);
      return { status: 'started' };
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
  
  // 如果 sender 没有 tab 信息（扩展刚加载时常见），从所有窗口查找
  if (!tabId) {
    // 先尝试当前窗口的活动标签页
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) { tabId = tabs[0].id; }
  }
  if (!tabId) {
    // 最后尝试任意窗口的活动标签页
    const allTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (allTabs[0]?.id) { tabId = allTabs[0].id; }
  }
  if (!tabId) {
    console.warn('[getPageContent] Could not find any active tab');
    return { content: '', error: '未找到活跃标签页' };
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
          let text = document.body?.innerText || '';
          // 只保留中英文、数字、常见标点、emoji
          text = text.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s.,;:!?()\[\]{}<>"'_\-+*/=@#$%^&|\\~`\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2194}\u{21AA}\u{2935}\u{25C0}\u{25B6}\u{23E9}\u{23EA}\u{23EB}\u{23EC}\u{2705}\u{274C}\u{2B55}\u{2753}\u{2757}\u{2795}\u{2796}\u{2797}\u{2716}\u{1F300}-\u{1F9FF}]+/gu, ' ');
          text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
          text = text.slice(0, 8000);
          return { content: text, isHTML: false };
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

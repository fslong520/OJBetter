/**
 * 题目历史记录管理 - 按天分片存储
 * 每天一个 JSON key，方便导出和合并
 */

const HISTORY_PREFIX = 'history_';
const MAX_DAILY = 200;
const RECENT_DAYS = 7; // 默认加载最近 7 天

function todayKey() {
  const d = new Date();
  return HISTORY_PREFIX + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function dateStr(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function keyToDate(key) {
  return key.replace(HISTORY_PREFIX, '');
}

/** 获取所有存储 key */
async function getAllKeys() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all).filter(k => k.startsWith(HISTORY_PREFIX));
}

/** 添加或更新一条记录到当天（同 fullQuestion 去重更新） */
async function addHistory(entry) {
  const key = todayKey();
  const result = await chrome.storage.local.get(key);
  let list = result[key] || [];

  const fullQ = entry.fullQuestion || entry.question || '';

  // 尝试找到同一题目的已有记录，有则更新
  const idx = list.findIndex(r => (r.fullQuestion || r.question || '') === fullQ);
  const now = Date.now();

  const record = {
    id: idx >= 0 ? list[idx].id : now.toString(36) + Math.random().toString(36).slice(2, 6),
    question: entry.question,
    fullQuestion: fullQ,
    answer: entry.answer,
    hintLevel: entry.hintLevel,
    chatHistory: entry.chatHistory || [],
    topic: entry.topic || extractTopic(entry.question),
    language: entry.language || detectLanguage(entry.question),
    url: entry.url || '',
    timestamp: idx >= 0 ? list[idx].timestamp : now
  };

  if (idx >= 0) {
    list[idx] = record; // 更新已有记录
  } else {
    list.unshift(record);
    if (list.length > MAX_DAILY) list.length = MAX_DAILY;
  }

  await chrome.storage.local.set({ [key]: list });
  return record;
}

/** 获取最近 N 条记录（跨天合并） */
async function getRecentHistory(limit = 20) {
  const keys = (await getAllKeys()).sort().reverse();
  const result = [];
  for (const key of keys) {
    if (result.length >= limit) break;
    const data = await chrome.storage.local.get(key);
    const list = data[key] || [];
    for (const item of list) {
      if (result.length >= limit) break;
      result.push(item);
    }
  }
  return result;
}

/** 获取所有记录（按时间倒序） */
async function getAllHistory() {
  const keys = (await getAllKeys()).sort().reverse();
  const result = [];
  for (const key of keys) {
    const data = await chrome.storage.local.get(key);
    const list = data[key] || [];
    for (const item of list) {
      result.push(item);
    }
  }
  return result;
}

/** 按日分组获取 */
async function getHistoryByDay() {
  const keys = (await getAllKeys()).sort().reverse();
  const days = [];
  for (const key of keys) {
    const data = await chrome.storage.local.get(key);
    const list = data[key] || [];
    if (list.length > 0) {
      days.push({ date: keyToDate(key), key, items: list });
    }
  }
  return days;
}

/** 清除所有历史 */
async function clearHistory() {
  const keys = await getAllKeys();
  if (keys.length > 0) {
    await chrome.storage.local.remove(keys);
  }
}

// ==================== 旧版兼容 ====================
const OLD_KEY = 'question_history';

async function migrateOldData() {
  const result = await chrome.storage.local.get(OLD_KEY);
  const oldList = result[OLD_KEY];
  if (!oldList || oldList.length === 0) return;

  // 按天分组旧数据
  const groups = {};
  for (const item of oldList) {
    const d = dateStr(item.timestamp);
    const key = HISTORY_PREFIX + d;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  // 写入新 key
  for (const [key, list] of Object.entries(groups)) {
    const existing = await chrome.storage.local.get(key);
    const merged = [...list, ...(existing[key] || [])].sort((a, b) => b.timestamp - a.timestamp);
    await chrome.storage.local.set({ [key]: merged });
  }

  // 删除旧 key
  await chrome.storage.local.remove(OLD_KEY);
}

// 启动时自动迁移
migrateOldData().catch(() => {});

  // ==================== 单个记录删除 ====================
  async function deleteHistoryRecord(recordId) {
    const keys = await getAllKeys();
    for (const key of keys) {
      const data = await chrome.storage.local.get(key);
      let list = data[key] || [];
      const initialLength = list.length;
      list = list.filter(r => r.id !== recordId);
      if (list.length < initialLength) {
        if (list.length === 0) {
          await chrome.storage.local.remove(key); // 当日无记录则删key
        } else {
          await chrome.storage.local.set({ [key]: list });
        }
        return true;
      }
    }
    return false; // 未找到记录
  }

  // ==================== 导出 ====================
async function exportHistory(dateFilter) {
  let records;
  if (dateFilter) {
    const key = HISTORY_PREFIX + dateFilter;
    const data = await chrome.storage.local.get(key);
    records = data[key] || [];
  } else {
    records = await getAllHistory();
  }

  const json = JSON.stringify(records, null, 2);
  const filename = dateFilter
    ? `ojbetter_history_${dateFilter}.json`
    : `ojbetter_history_all_${dateStr(Date.now())}.json`;

  // service worker 里用 data URL 代替 blob
  const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(json)));

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true
  });
}

// ==================== 主题/语言检测 ====================
function extractTopic(question) {
  const topics = {
    '排序|sort': '排序算法',
    '搜索|查找|search|find': '搜索/查找',
    '数组|array|列表|list': '数组/列表',
    '字符串|string|str': '字符串',
    '链表|linked': '链表',
    '树|tree|二叉树': '树',
    '图|graph': '图',
    '动态规划|dp|dynamic': '动态规划',
    '递归|recursion': '递归',
    '贪心|greedy': '贪心算法',
    '回溯|backtrack': '回溯',
    '二分|binary': '二分查找',
    '循环|loop|for|while': '循环结构',
    '判断|条件|if|switch|判断|条件': '条件判断',
    '函数|function|def': '函数',
    '类|class|面向对象|oop': '面向对象',
    '文件|file|io': '文件操作',
    '字典|hash|哈希|dict|map': '哈希表/字典'
  };
  for (const [pattern, topic] of Object.entries(topics)) {
    if (new RegExp(pattern, 'i').test(question)) return topic;
  }
  return '综合编程';
}

function detectLanguage(question) {
  const langPatterns = {
    'Java': /\bjava\b|\bpublic\s+class\b|\bSystem\.out\b/i,
    'Python': /\bpython\b|\bdef\s+\w+\(|\bimport\s+\w+|\bprint\b|\bclass\s+\w+:/i,
    'C++': /\bc\+\+\b|\bcpp\b|#include|std::cout|\bvector\b/i,
    'JavaScript': /\bjavascript\b|\bconsole\.log\b|\bconst\s+\w+\s*=/i
  };
  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(question)) return lang;
  }
  return '未知';
}

export { addHistory, getRecentHistory, getAllHistory, getHistoryByDay, clearHistory, exportHistory, deleteHistoryRecord, extractTopic, detectLanguage };

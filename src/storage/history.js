/**
 * 题目历史记录管理
 * 存储孩子的提问历史，用于后续生成学习计划
 */

const HISTORY_KEY = 'question_history';
const MAX_HISTORY = 500;

async function getHistory() {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  return result[HISTORY_KEY] || [];
}

async function addHistory(entry) {
  const history = await getHistory();
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    question: entry.question,
    answer: entry.answer,
    hintLevel: entry.hintLevel,
    topic: entry.topic || extractTopic(entry.question),
    language: entry.language || detectLanguage(entry.question),
    url: entry.url || '',
    timestamp: Date.now()
  };

  history.unshift(record);
  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }

  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return record;
}

async function getRecentHistory(limit = 10) {
  const history = await getHistory();
  return history.slice(0, limit);
}

async function getHistoryByTopic(topic) {
  const history = await getHistory();
  return history.filter(h => h.topic === topic);
}

async function getHistoryByDateRange(start, end) {
  const history = await getHistory();
  return history.filter(h => {
    const t = h.timestamp;
    return (!start || t >= start) && (!end || t <= end);
  });
}

async function clearHistory() {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

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
    const regex = new RegExp(pattern, 'i');
    if (regex.test(question)) return topic;
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

export { getHistory, addHistory, getRecentHistory, getHistoryByTopic, getHistoryByDateRange, clearHistory, extractTopic, detectLanguage };

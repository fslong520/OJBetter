/**
 * Content Script - 页面注入
 * 检测页面中的编程题目，添加悬浮按钮方便快速提问
 */

(function () {
  'use strict';

  let floatingBtn = null;

  // ==================== Floating Button ====================
  function createFloatingButton() {
    if (floatingBtn) return;
    floatingBtn = document.createElement('div');
    floatingBtn.id = 'ai-tutor-floating-btn';
    floatingBtn.innerHTML = `
      <div class="ai-tutor-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="#4F46E5" stroke="#fff" stroke-width="1.5"/>
          <text x="12" y="16" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold" font-family="sans-serif">?</text>
        </svg>
      </div>
      <div class="ai-tutor-tooltip">问我编程问题</div>
    `;
    floatingBtn.addEventListener('click', () => {
      const html = captureProblemHTML();
      chrome.storage.local.set({ pendingHint: { problemText: html || window.getSelection()?.toString()?.trim() || '', level: 0, isHTML: true } });
      chrome.runtime.sendMessage({ type: 'openSidePanel' });
    });
    document.body.appendChild(floatingBtn);
  }

  // ==================== Problem Detection ====================
  function isProblemPage() {
    const url = location.href.toLowerCase();
    const knownSites = [
      'leetcode', 'luogu', 'acwing', 'nowcoder', 'codeforces',
      'atcoder', 'hackerrank', 'codewars', 'spoj', 'usaco',
      'programiz', 'geeksforgeeks', 'w3schools', 'runoob',
      'lintcode', 'lightoj', 'cses', 'vijos', '51nod',
      '.edu', 'acm.', 'oj.', 'judge', 'contest', 'problem',
      'coding', 'tutorial', 'learn'
    ];
    for (const kw of knownSites) { if (url.includes(kw)) return true; }
    const title = document.title.toLowerCase();
    for (const kw of ['题解','刷题','算法','编程','代码','题目','problem','solution','code']) {
      if (title.includes(kw)) return true;
    }
    return false;
  }

  function detectProblemContent() {
    const selectors = [
      '#task-statement', '.problem-content', '.question-content', '#problem',
      '.problem-statement', '.markdown-body', '.task-description',
      '.challenge-instructions', '.view-lines', '.monaco-editor'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.length > 50) return el;
    }
    return null;
  }

  function addHintButtons() {
    if (!isProblemPage()) return;
    if (document.querySelector('.ai-tutor-hint-buttons')) return;
    const problemEl = detectProblemContent();
    if (!problemEl) return;

    const btnContainer = document.createElement('div');
    btnContainer.className = 'ai-tutor-hint-buttons';
    btnContainer.innerHTML = `
      <button class="ai-tutor-hint-btn" id="ai-tutor-coach-btn">✨ 灵光一下，开始思考</button>
    `;
    const coachBtn = btnContainer.querySelector('#ai-tutor-coach-btn');
    if (coachBtn) {
      coachBtn.addEventListener('click', () => {
        const html = captureProblemHTML();
        chrome.storage.local.set({ pendingHint: { problemText: html, level: 0, isHTML: true } }, () => {
          chrome.runtime.sendMessage({ type: 'openSidePanel' });
        });
      });
    }
    problemEl.parentElement?.insertBefore(btnContainer, problemEl.nextSibling);
    if (!btnContainer.parentElement) problemEl.appendChild(btnContainer);
  }

  // ==================== HTML Capture ====================
  function captureProblemHTML() {
    try {
      // 直接从 body 取纯文本，再清洗字符
      let text = document.body.innerText || '';
      // 只保留：中文、英文、数字、常见标点、换行、emoji
      text = text.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9\s.,;:!?()\[\]{}<>"'_\-+*/=@#$%^&|\\~`\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2194}\u{21AA}\u{2935}\u{25C0}\u{25B6}\u{23E9}\u{23EA}\u{23EB}\u{23EC}\u{2705}\u{274C}\u{2B55}\u{2753}\u{2757}\u{2795}\u{2796}\u{2797}\u{2716}\u{1F300}-\u{1F9FF}]+/gu, ' ');
      // 压缩多余空白
      text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (text.length > 8000) text = text.slice(0, 8000);
      return text;
    } catch (e) {
      return (document.body?.innerText || '').slice(0, 3000);
    }
  }

  // ==================== Init ====================
  function init() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(() => { createFloatingButton(); addHintButtons(); }, 1500);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => { createFloatingButton(); addHintButtons(); }, 1500);
      });
    }
    const observer = new MutationObserver(() => { addHintButtons(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ==================== Message Handler ====================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'capturePageContent') {
      sendResponse({ content: captureProblemHTML(), isHTML: true });
      return true;
    }
  });

  init();
})();

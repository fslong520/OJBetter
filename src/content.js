/**
 * Content Script - 页面注入
 * 检测页面中的编程题目，添加悬浮按钮方便快速提问
 */

(function () {
  'use strict';

  // ==================== OJ 白名单（默认全量收录国内外常见OJ/赛站） ====================
  const OJ_WHITELIST = [
    // 国内OJ/竞赛站
    'luogu.com.cn',    // 洛谷
    'acwing.com',       // AcWing
    'nowcoder.com',     // 牛客网
    'leetcode.cn',      // 力扣中国
    'poj.org',         // 北大POJ
    'hdu.edu.cn',      // 杭电HDU OJ
    'vjudge.net',      // Virtual Judge
    'jisuanke.com',    // 计蒜客
    'codeforces.cn',   // Codeforces中国
    'atcoder.jp',      // AtCoder
    'usaco.org',       // USACO
    'openjudge.cn',    // OpenJudge
    'zoj.pintia.cn',   // 浙大ZOJ
    'bzoj.org',        // 大视野
    'loj.ac',          // LibreOJ
    'uoj.ac',          // Universal OJ
    'contesthunter.org', // 猎人网
    '51nod.com',       // 51Nod
    'acm.sdut.edu.cn', // SDUTOJ
    'codevs.cn',       // CodeVS
    'icpc.cn',         // ICPC中国
    'ioinformatics.org', // 国际信息学奥林匹克
    // 国外OJ/竞赛站
    'codeforces.com',
    'codechef.com',
    'codewars.com',
    'spoj.com',
    'topcoder.com',
    'hackerrank.com',
    'cses.fi',
    'lightoj.com',
    'e-olymp.com',
    'timus.ru',
    'acmp.ru',
    'coj.uci.cu',
    // 常见编程学习站
    'lintcode.com',
    'programiz.com',
    'geeksforgeeks.org',
    'runoob.com',
    'leetcode.com',    // 力扣国际版
    'exercism.org',
    'codecademy.com'
  ];

  // ==================== Problem Detection ====================
  function isProblemPage() {
    const url = location.href.toLowerCase();
    // 仅白名单内网站生效
    return OJ_WHITELIST.some(site => url.includes(site.toLowerCase()));
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
      setTimeout(() => { addHintButtons(); }, 1500);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => { addHintButtons(); }, 1500);
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

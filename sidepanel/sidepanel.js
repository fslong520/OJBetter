/**
 * Side Panel - 教练多轮对话模式
 */

const state = { problemText: '', chatHistory: [], inChat: false };
const $ = (sel) => document.querySelector(sel);
let _streamPort = null;  // 保留兼容
let _streamId = null;
let _streamCleanup = null;
let _currentAssistantEl = null; // 正在流式写入的 AI 消息元素

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => { checkPendingHint(); bindEvents(); });

chrome.storage.onChanged.addListener((changes) => {
  const v = changes.pendingHint?.newValue;
  if (v && v.problemText) {
    const input = $('#problem-input');
    if (input) input.value = String(v.problemText).replace(/<[^>]+>/g, '').slice(0, 200);
    startCoach(String(v.problemText));
  }
});

function checkPendingHint() {
  chrome.storage.local.get(['pendingHint'], (result) => {
    if (result.pendingHint) {
      const { problemText } = result.pendingHint;
      chrome.storage.local.remove('pendingHint');
      if (problemText) {
        const input = $('#problem-input');
        if (input) input.value = String(problemText).replace(/<[^>]+>/g, '').slice(0, 200);
        startCoach(String(problemText));
      }
    }
  });
}

// ==================== Events ====================
function bindEvents() {
  const sc = $('#start-coach-btn'); if (sc) sc.addEventListener('click', () => {
    captureAndCoach();
  });
  const trans = $('#translate-btn'); if (trans) trans.addEventListener('click', captureAndTranslate);
  const send = $('#chat-send-btn'); if (send) send.addEventListener('click', sendCoachMessage);
  const input = $('#chat-input'); if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCoachMessage(); }
    });
  }
  const nc = $('#new-coach-btn'); if (nc) nc.addEventListener('click', resetToWelcome);
  const hb = $('#history-btn'); if (hb) hb.addEventListener('click', showHistory);
  const pb = $('#plan-btn'); if (pb) pb.addEventListener('click', showPlan);
  const hBack = $('#history-back-btn'); if (hBack) hBack.addEventListener('click', () => switchPanel('chat'));
  const pBack = $('#plan-back-btn'); if (pBack) pBack.addEventListener('click', () => switchPanel('chat'));
  const toggle = $('#thinking-toggle'); if (toggle) toggle.addEventListener('click', () => {
    const a = $('#thinking-area'); if (a) a.classList.toggle('collapsed');
  });
}

// ==================== Coach ====================
async function captureAndCoach() {
  // 先检查用户是否在输入框输入了内容
  const input = $('#problem-input');
  const manualText = input ? String(input.value).trim() : '';
  if (manualText && manualText.length > 20) {
    startCoach(manualText);
    return;
  }
  // 自动从页面捕获
  showLoading();
  try {
    const resp = await sendMessageSafe({ type: 'getCurrentPageContent' });
    hideLoading();
    let raw = resp?.content ? String(resp.content) : '';
    if (typeof resp?.content === 'object' && resp.content !== null) {
      raw = typeof resp.content.content === 'string' ? resp.content.content : JSON.stringify(resp.content);
    }
    if (!raw || raw === '[object Object]') { showError('未获取到页面内容，请在输入框粘贴题目'); return; }
    if (input) input.value = raw.replace(/<[^>]+>/g, '').slice(0, 200);
    startCoach(raw);
  } catch (_) { hideLoading(); showError('捕获失败，请在输入框粘贴题目'); }
}

async function captureAndTranslate() {
  const input = $('#problem-input');
  const manualText = input ? String(input.value).trim() : '';
  if (manualText && manualText.length > 20) {
    streamTranslate(manualText);
    return;
  }
  showLoading();
  try {
    const resp = await sendMessageSafe({ type: 'getCurrentPageContent' });
    hideLoading();
    let raw = resp?.content ? String(resp.content) : '';
    if (typeof resp?.content === 'object' && resp.content !== null) {
      raw = typeof resp.content.content === 'string' ? resp.content.content : JSON.stringify(resp.content);
    }
    if (!raw || raw === '[object Object]') { showError('未获取到页面内容，请在输入框粘贴题目'); return; }
    if (input) input.value = raw.replace(/<[^>]+>/g, '').slice(0, 200);
    streamTranslate(raw);
  } catch (_) { hideLoading(); showError('捕获失败，请在输入框粘贴题目'); }
}

// ==================== Translate ====================
function streamTranslate(problemText) {
  problemText = safeStr(problemText);
  showChatArea();
  const title = $('#chat-title'); if (title) title.textContent = '🌐 翻译中...';
  const msgs = $('#chat-messages'); if (msgs) msgs.innerHTML = '';
  showThinking(true);
  _currentAssistantEl = addChatMessage('assistant', '', true);
  startStream({
    type: 'generateHintStream',
    problemText: problemText.slice(0, 10000),
    hintLevel: -1,
    previousHints: [],
    coachMode: false,
    chatHistory: [],
    isTranslate: true
  }, {
    onDone: (full) => {
      const title = $('#chat-title'); if (title) title.textContent = '🌐 翻译完成';
      const cleaned = (full || '').replace(/<[^>]+>/g, '').trim();
      const input = $('#problem-input');
      if (input && cleaned) input.value = cleaned;
    }
  });
}

function startCoach(problemText) {
  problemText = String(problemText || '');
  if (!problemText) return;
  state.problemText = problemText;
  state.chatHistory = [];
  state.inChat = true;
  showChatArea();
  // 添加题目预览
  const preview = problemText.replace(/<[^>]+>/g, '').slice(0, 200);
  const title = $('#chat-title'); if (title) title.textContent = '📝 ' + (preview || '题目讨论');
  // 立即让 AI 开始第一轮提问
  startStream({
    type: 'generateHintStream',
    problemText: problemText.slice(0, 10000),
    hintLevel: 0,
    previousHints: [],
    coachMode: true,
    chatHistory: []
  }, { onDone: (full) => recordAssistant(full) });
}

function sendCoachMessage() {
  if (!state.inChat) return;
  const input = $('#chat-input');
  const text = input ? String(input.value).trim() : '';
  if (!text) return;
  input.value = '';
  // 添加用户消息
  addChatMessage('user', text);
  state.chatHistory.push({ role: 'user', content: text });
  // 发送给 AI
  startStream({
    type: 'generateHintStream',
    problemText: state.problemText.slice(0, 10000),
    hintLevel: 0,
    previousHints: [],
    coachMode: true,
    chatHistory: state.chatHistory
  }, { onDone: (full) => recordAssistant(full) });
}

function recordAssistant(full) {
  const clean = (full || '').replace(/<[^>]+>/g, '').trim();
  if (clean) {
    state.chatHistory.push({ role: 'assistant', content: clean });
  }
}

// ==================== Stream ====================
function disconnectStream() {
  if (_streamCleanup) { _streamCleanup(); _streamCleanup = null; }
  _streamId = null;
  // 兼容旧端口
  if (_streamPort) { try { _streamPort.disconnect(); } catch(_) {} _streamPort = null; }
}

function startStream(msg, extra) {
  disconnectStream();
  const streamId = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  _streamId = streamId;
  let localThink = '', localContent = '';
  let doneFinalized = false;

  const onChange = (changes, areaName) => {
    if (areaName !== 'local') return;
    const key = 'stream:' + streamId;
    if (!changes[key]) return;
    const v = changes[key].newValue || {};

    // 增量追加
    if (v.thinkDelta) {
      localThink += v.thinkDelta;
      appendThinking(v.thinkDelta);
      const ta = $('#thinking-area'); if (ta) ta.style.display = 'block';
    }
    if (v.contentDelta) {
      localContent += v.contentDelta;
      if (msg.coachMode || msg.isTranslate) {
        streamToAssistantEl(v.contentDelta);
      } else {
        appendHintContent(v.contentDelta);
      }
    }

    if (v.status === 'done' && !doneFinalized) {
      doneFinalized = true;
      cleanup();
      showThinking(false);
      if (msg.coachMode || msg.isTranslate) {
        finalizeAssistantEl();
      } else {
        finalizeHintContent();
      }
      if (extra?.onDone) extra.onDone(v.content || localContent);
    } else if (v.status === 'error' && !doneFinalized) {
      doneFinalized = true;
      cleanup();
      showThinking(false);
      const err = v.error || '未知错误';
      if (msg.coachMode || msg.isTranslate) {
        if (_currentAssistantEl) {
          _currentAssistantEl.querySelector('.chat-bubble').innerHTML = '<span class="error-msg">❌ ' + esc(err) + '</span>';
          _currentAssistantEl = null;
        }
      } else {
        showError(err);
      }
    }
  };

  chrome.storage.onChanged.addListener(onChange);

  const cleanup = () => {
    chrome.storage.onChanged.removeListener(onChange);
    chrome.storage.local.remove('stream:' + streamId).catch(()=>{});
    _streamId = null;
    _streamCleanup = null;
  };
  _streamCleanup = cleanup;

  // 创建占位 AI 消息（含思考中动画）
  if (msg.coachMode || msg.isTranslate) {
    _currentAssistantEl = addChatMessage('assistant', '', true);
    const bubble = _currentAssistantEl.querySelector('.chat-bubble');
    if (bubble) bubble.innerHTML = '<span class="thinking-indicator">小智正在思考<span class="dot-anim">...</span></span>';
  } else {
    showThinking(true);
  }

  // 发送启动消息
  sendMessageSafe({
    type: 'startStream',
    streamId,
    problemText: msg.problemText || '',
    hintLevel: msg.hintLevel || 2,
    previousHints: msg.previousHints || [],
    chatHistory: msg.chatHistory || [],
    coachMode: msg.coachMode || false,
    isTranslate: msg.isTranslate || false
  }).catch((e) => {
    showError('启动失败: ' + e.message);
    cleanup();
  });
}

function streamToAssistantEl(text) {
  if (!_currentAssistantEl) return;
  const bubble = _currentAssistantEl.querySelector('.chat-bubble');
  if (!bubble._raw) bubble._raw = '';
  bubble._raw += String(text);
  bubble.textContent = bubble._raw; // 流式阶段用 textContent 防止 XSS
  scrollChatToBottom();
  // 同步显示思考过程如果有
  const ta = $('#thinking-area'); if (ta) ta.style.display = 'block';
}

function finalizeAssistantEl() {
  if (!_currentAssistantEl) return;
  const bubble = _currentAssistantEl.querySelector('.chat-bubble');
  if (bubble._raw) {
    bubble.innerHTML = renderMarkdown(bubble._raw);
    delete bubble._raw;
  }
  _currentAssistantEl = null;
  scrollChatToBottom();
}

function safeStr(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ==================== Chat UI ====================
function addChatMessage(role, content, isStreaming) {
  const msgs = $('#chat-messages');
  if (!msgs) return null;
  const div = document.createElement('div');
  div.className = 'chat-message chat-message--' + role;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  if (role === 'assistant') {
    bubble.innerHTML = isStreaming ? '' : renderMarkdown(String(content || ''));
  } else {
    bubble.textContent = String(content || '');
  }
  div.appendChild(bubble);
  msgs.appendChild(div);
  scrollChatToBottom();
  return div;
}

function scrollChatToBottom() {
  const msgs = $('#chat-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function showChatArea() {
  const w = $('#welcome-area'), c = $('#chat-area');
  if (w) w.style.display = 'none';
  if (c) c.style.display = 'flex';
}

function showWelcome() {
  const w = $('#welcome-area'), c = $('#chat-area');
  if (w) w.style.display = '';
  if (c) c.style.display = 'none';
}

// ==================== Thinking ====================
function showThinking(show) {
  const area = $('#thinking-area'); const content = $('#thinking-content');
  if (area) { area.style.display = show ? 'block' : 'none'; if (show) area.classList.remove('collapsed'); }
  if (content && show) content.innerHTML = '';
}
function appendThinking(text) {
  const area = $('#thinking-area'); const content = $('#thinking-content');
  if (!area || !content) return;
  if (area.style.display === 'none') area.style.display = 'block';
  content.innerHTML += String(text); content.scrollTop = content.scrollHeight;
}
function appendHintContent(text) {
  const area = $('#hint-content'); if (!area) return;
  if (!area._rawText) area._rawText = '';
  area._rawText += String(text);
  area.innerText = area._rawText;
  area.scrollTop = area.scrollHeight;
}
function finalizeHintContent() {
  const area = $('#hint-content'); if (!area) return;
  const raw = area._rawText || '';
  area.innerHTML = renderMarkdown(raw);
  area._rawText = '';
}
function showError(message) {
  const msgs = $('#chat-messages');
  if (msgs && state.inChat) {
    addChatMessage('assistant', '❌ ' + esc(String(message)));
  } else {
    const el = $('#hint-content'); if (el) el.innerHTML = `<p style="color:#ef4444;">⚠️ ${esc(String(message))}</p>`;
  }
}

function showResultPanel(problemText, level) {
  const preview = $('#hint-problem-preview');
  const badge = $('#hint-level-badge');
  const deeper = $('#deeper-hint-btn');
  if (badge) {
    const labels = {1:'💡 提示一下',2:'📋 画画图',3:'📝 写伪代码',0:'💡 提示一下'};
    badge.textContent = labels[level] || '💡 提示一下';
  }
  if (preview) preview.textContent = problemText.slice(0, 200);
  if (deeper) {
    if (level < 3) { deeper.style.display = ''; deeper.dataset.level = level; }
    else deeper.style.display = 'none';
  }
  // 隐藏欢迎显示结果
  const w = $('#welcome-area'), r = $('#hint-result');
  if (w) w.style.display = 'none';
  if (r) r.style.display = '';
}

function updateDeeperButton(level) {
  const btn = $('#deeper-hint-btn');
  if (btn) { if (level < 3) { btn.style.display = ''; } else btn.style.display = 'none'; }
}

function resetToWelcome() {
  disconnectStream();
  state.chatHistory = [];
  state.inChat = false;
  const msgs = $('#chat-messages'); if (msgs) msgs.innerHTML = '';
  showWelcome();
}

// ==================== Markdown ====================
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function renderMarkdown(text) {
  let p = String(text||'')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  p = p.replace(/```(\S*)\s*\n([\s\S]*?)```/g, (_,lang,code) => {
    const l = (lang||'').toLowerCase();
    return `<pre class="code-block${l?' lang-'+l:''}"><div class="code-header">${l?lang:'代码'}</div><code>${code.trim()}</code></pre>`;
  });
  p = p.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/^### (.+)$/gm, '<h4 class="section-title">$1</h4>')
    .replace(/^## (.+)$/gm, (_,t) => {
      const cls = /解题步骤|解题|步骤/.test(t) ? 'title-steps' : /流程图|流程|图/.test(t) ? 'title-flow' : /知识点|知识|概念/.test(t) ? 'title-knowledge' : /试一试|试试|练习/.test(t) ? 'title-try' : /输入|输出|格式/.test(t) ? 'title-io' : 'section-title';
      return `<h3 class="${cls}">${t}</h3>`;
    })
    .replace(/^# (.+)$/gm, '<h2 class="section-title main-title">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---$/gm, '<hr class="divider">')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  const lines = p.split('\n'); const result = []; let para = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (para.length) { result.push('<p>'+para.join('<br>')+'</p>'); para = []; } continue; }
    if (/^<(h[2-4]|ul|ol|li|pre|hr|blockquote|div)/.test(t)) { if (para.length) { result.push('<p>'+para.join('<br>')+'</p>'); para = []; } result.push(t); }
    else { para.push(t); }
  }
  if (para.length) result.push('<p>'+para.join('<br>')+'</p>');
  return result.join('\n');
}

// ==================== History / Plan ====================
function sendMessageSafe(msg) {
  return new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? { error: '后台未响应' } : r)); }
    catch (e) { resolve({ error: e.message }); }
  });
}

function showLoading() { const o = $('#loading-overlay'); if (o) o.style.display = 'flex'; }
function hideLoading() { const o = $('#loading-overlay'); if (o) o.style.display = 'none'; }

function switchPanel(panel) {
  const hp = $('#hint-panel'), hip = $('#history-panel'), pp = $('#plan-panel');
  if (hp) hp.classList.toggle('active', panel === 'chat' || panel === 'hint');
  if (hip) hip.classList.toggle('active', panel === 'history');
  if (pp) pp.classList.toggle('active', panel === 'plan');
}

async function showHistory() {
  switchPanel('history'); const list = $('#history-list'); if (!list) return;
  try {
    const r = await sendMessageSafe({ type: 'getHistory' });
    if (!r?.history?.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>还没有记录</p></div>'; return; }
    list.innerHTML = r.history.map(h => `<div class="history-item" data-question="${esc(h.question||'')}" data-level="${h.hintLevel||2}"><div class="history-question">${esc(String(h.question||'').slice(0,80))}</div><div class="history-meta"><span class="history-topic">${esc(h.topic||'综合')}</span><span>${new Date(h.timestamp).toLocaleDateString('zh-CN')}</span></div></div>`).join('');
    list.querySelectorAll('.history-item').forEach(item => item.addEventListener('click', () => {
      switchPanel('chat');
      resetToWelcome();
      startCoach(String(item.dataset.question||''));
    }));
  } catch(_) { list.innerHTML = '<div class="empty-state"><p>加载失败</p></div>'; }
}

async function showPlan() {
  switchPanel('plan'); const c = $('#plan-content'); if (!c) return;
  c.innerHTML = '<div class="loading-spinner" style="margin:40px auto;"></div>';
  try { const r = await sendMessageSafe({ type: 'getLearningPlan' }); renderPlan(r?.plan); } catch(_) { c.innerHTML = '<div class="empty-state"><p>失败</p></div>'; }
}

function renderPlan(plan) {
  const c = $('#plan-content'); if (!c) return;
  if (!plan) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>暂无学习计划</p></div>'; return; }
  const steps = Array.isArray(plan) ? plan : (Array.isArray(plan?.steps) ? plan.steps : []);
  const summary = plan?.summary || '';
  c.innerHTML = `
    <div class="plan-card">
      <h4>📚 学习计划</h4>
      ${summary ? `<p class="plan-summary">${esc(summary)}</p>` : ''}
      <ul class="plan-tasks">${steps.map((s,i) => `
        <li>
          <span class="task-day">Day ${i+1}</span>
          <span>${esc(typeof s === 'string' ? s : s?.title || s?.name || '')}</span>
        </li>
      `).join('')}</ul>
    </div>`;
}

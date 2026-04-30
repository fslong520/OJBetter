/**
 * Side Panel - 教练多轮对话模式
 */

const state = { problemText: '', chatHistory: [], inChat: false };
const $ = (sel) => document.querySelector(sel);
let _streamPort = null;  // 保留兼容
let _streamId = null;
let _streamCleanup = null;
let _keepalivePort = null;  // keepalive port，防止 service worker 休眠
let _currentAssistantEl = null; // 正在流式写入的 AI 消息元素

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => { checkFirstOpen(); checkPendingHint(); bindEvents(); });

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
  const sc = $('#start-coach-btn'); if (sc) sc.addEventListener('click', () => { clearError(); captureAndCoach(); });
  const trans = $('#translate-btn'); if (trans) trans.addEventListener('click', () => { clearError(); captureAndTranslate(); });
  const send = $('#chat-send-btn'); if (send) send.onclick = sendCoachMessage;
  const input = $('#chat-input'); if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCoachMessage(); }
    });
  }
  const probInput = $('#problem-input'); if (probInput) {
    probInput.addEventListener('input', clearError);
    probInput.addEventListener('focus', clearError);
  }
  const nc = $('#new-coach-btn'); if (nc) nc.addEventListener('click', resetToWelcome);
  const hb = $('#history-btn'); if (hb) hb.addEventListener('click', showHistory);
  const pb = $('#plan-btn'); if (pb) pb.addEventListener('click', showPlan);
  const sb = $('#settings-btn'); if (sb) sb.addEventListener('click', openSettings);
  const helpBtn = $('#help-btn'); if (helpBtn) helpBtn.addEventListener('click', showHelp);
  const hBack = $('#history-back-btn'); if (hBack) hBack.addEventListener('click', () => switchPanel('chat'));
  const pBack = $('#plan-back-btn'); if (pBack) pBack.addEventListener('click', () => switchPanel('chat'));
  const helpBack = $('#help-back-btn'); if (helpBack) helpBack.addEventListener('click', () => switchPanel('chat'));
  const toggle = $('#thinking-toggle'); if (toggle) toggle.addEventListener('click', () => {
    const a = $('#thinking-area'); if (a) a.classList.toggle('collapsed');
  });
  const exportAll = $('#export-all-btn'); if (exportAll) exportAll.addEventListener('click', () => {
    sendMessageSafe({ type: 'exportHistory' });
  });
  const clearAll = $('#clear-all-btn'); if (clearAll) clearAll.addEventListener('click', async () => {
    if (!confirm('确定要清除所有提问记录吗？此操作不可恢复。')) return;
    const r = await sendMessageSafe({ type: 'clearHistory' });
    if (r?.success) {
      alert('已清除所有提问记录');
      const list = document.getElementById('history-list');
      if (list) list.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>已清除所有记录</p></div>';
      updateStorageInfo();
    }
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
  // 清理 UI
  const msgs = $('#chat-messages'); if (msgs) msgs.innerHTML = '';
  showChatArea();

  const title = $('#chat-title'); if (title) title.textContent = '🌐 翻译中...';
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
      const cleaned = (full || '').replace(/<[^>]+>/g, '').trim();
      const input = $('#problem-input');
      if (input) input.value = '';
      // 如果翻译结果为空，显示错误
      if (!cleaned) {
        if (_currentAssistantEl) {
          _currentAssistantEl.querySelector('.chat-bubble').innerHTML = '<span class="error-msg">❌ 翻译结果为空，请重试或检查 API 配置</span>';
          _currentAssistantEl = null;
        }
        const title = $('#chat-title'); if (title) title.textContent = '🌐 翻译失败';
        return;
      }
      const title = $('#chat-title'); if (title) title.textContent = '🌐 翻译完成';
      // 存入题目便于后续对话，但不自动开始教练
      state.problemText = cleaned;
      state.chatHistory = [];
      state.inChat = true;
      setChatInputEnabled(true);
    }
  });
}

function startCoach(problemText) {
  problemText = String(problemText || '');
  if (!problemText) return;
  // 强制清理所有旧状态
  state.problemText = problemText;
  state.chatHistory = [];
  state.inChat = true;
  const msgs = $('#chat-messages');
  if (msgs) msgs.innerHTML = '';
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
  if (_streamId) return; // 正在流式处理中，禁止发送
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

// ==================== Chat Input State ====================
function setChatInputEnabled(enabled) {
  const input = $('#chat-input');
  const btn = $('#chat-send-btn');
  if (input) {
    input.disabled = !enabled;
    if (enabled) input.focus();
  }
  if (btn) {
    if (enabled) {
      // 恢复为发送按钮
      btn.disabled = false;
      btn.innerHTML = '➤';
      btn.title = '发送';
      btn.classList.remove('stop-active');
      btn.onclick = sendCoachMessage;
    } else {
      // 变为停止按钮
      btn.disabled = false;
      btn.innerHTML = '⏹';
      btn.title = '停止回复';
      btn.classList.add('stop-active');
      btn.onclick = stopStream;
    }
  }
}

function stopStream() {
  if (!_streamId) return;
  console.log('[stream] User stopped');
  // 清理流并标记为已完成
  if (_streamCleanup) _streamCleanup();
  _streamId = null;
  showThinking(false);
  finalizeAssistantEl();
  setChatInputEnabled(true);
}

function startStream(msg, extra) {
  disconnectStream();
  const streamId = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  _streamId = streamId;
  let localThink = '', localContent = '';
  let doneFinalized = false;

  // 禁用输入
  setChatInputEnabled(false);

  const onChange = (changes, areaName) => {
    if (areaName !== 'local') return;
    const key = 'stream:' + streamId;
    if (!changes[key]) return;
    const v = changes[key].newValue || {};

    // 重置超时计时器
    resetTimeout();

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
      // 恢复输入
      setChatInputEnabled(true);
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
        setChatInputEnabled(true); // 出错后恢复输入
      } else {
        showError(err);
        setChatInputEnabled(true); // 出错后恢复输入
      }
    }
  };

  // 超时检测：延长至 30 分钟。翻译模式不设硬性超时，依靠后端完成信号。
  let _timeoutTimer = null;
  const TIMEOUT_MS = 1800000; 
  const resetTimeout = () => {
    clearTimeout(_timeoutTimer);
    if (msg.isTranslate) return; // 翻译模式不主动超时

    _timeoutTimer = setTimeout(() => {
      if (!doneFinalized) {
        doneFinalized = true;
        cleanup();
        showThinking(false);
        if (msg.coachMode || msg.isTranslate) {
          if (_currentAssistantEl) {
            _currentAssistantEl.querySelector('.chat-bubble').innerHTML = '<span class="error-msg">⏱️ 请求超时，请检查网络或 API 配置后重试</span>';
            _currentAssistantEl = null;
          }
          setChatInputEnabled(true);
        } else {
          showError('请求超时，请检查网络或 API 配置后重试');
          setChatInputEnabled(true);
        }
      }
    }, TIMEOUT_MS);
  };
  resetTimeout();

  chrome.storage.onChanged.addListener(onChange);

  const cleanup = () => {
    chrome.storage.onChanged.removeListener(onChange);
    chrome.storage.local.remove('stream:' + streamId).catch(()=>{});
    // 关闭 keepalive 端口
    if (_keepalivePort) { try { _keepalivePort.disconnect(); } catch(_) {} _keepalivePort = null; }
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
  }).then((resp) => {
    if (resp?.error) {
      showError('启动失败: ' + resp.error);
      cleanup();
      setChatInputEnabled(true);
      return;
    }
    // 启动成功后创建 keepalive port，保持 service worker 活跃
    try {
    _keepalivePort = chrome.runtime.connect({ name: 'stream-keepalive:' + streamId });
      _keepalivePort.onDisconnect.addListener(() => {
        _keepalivePort = null;
      });
    } catch (_) {}
  }).catch((e) => {
    showError('启动失败: ' + e.message);
    cleanup();
    setChatInputEnabled(true);
  });
}

function streamToAssistantEl(text) {
  if (!_currentAssistantEl) return;
  const bubble = _currentAssistantEl.querySelector('.chat-bubble');
  if (!bubble) return;
  // Optimized DOM update: Append a new text node instead of rewriting the whole string
  // This prevents layout thrashing and makes scrolling/typing feel instant
  if (!bubble._lastTextNode) {
    bubble._lastTextNode = document.createTextNode('');
    bubble.appendChild(bubble._lastTextNode);
  }
  bubble._lastTextNode.textContent += String(text);
  // Store raw text for final markdown parsing
  if (!bubble._raw) bubble._raw = '';
  bubble._raw += text;
  scrollChatToBottom();
  // Sync thinking display
  const ta = $('#thinking-area'); if (ta) ta.style.display = 'block';
}

function finalizeAssistantEl() {
  if (!_currentAssistantEl) return;
  const bubble = _currentAssistantEl.querySelector('.chat-bubble');
  if (bubble._raw) {
    bubble.dataset.markdown = bubble._raw;
    bubble.innerHTML = renderMarkdown(bubble._raw);
    delete bubble._raw;
    addCopyBtn(bubble);
  }
  _currentAssistantEl = null;
  scrollChatToBottom();
  // AI回答完成后清空聊天输入框
  const input = document.getElementById('chat-input');
  if (input) input.value = '';
}

function addPlanCopyBtn(container, markdownText) {
  if (container.querySelector('.plan-copy-btn')) return;
  const btn = document.createElement('button');
  btn.className = 'plan-copy-btn';
  btn.title = '复制 Markdown';
  btn.textContent = '📋 复制 Markdown';
  btn.style.cssText = 'position:absolute;top:8px;right:8px;padding:4px 8px;font-size:12px;cursor:pointer;background:#4A90D9;color:#fff;border:none;border-radius:4px;z-index:10;';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(markdownText || '').then(() => {
      btn.textContent = '✓ 已复制';
      setTimeout(() => { btn.textContent = '📋 复制 Markdown'; }, 1500);
    }).catch(() => {
      btn.textContent = '✗ 失败';
      setTimeout(() => { btn.textContent = '📋 复制 Markdown'; }, 1500);
    });
  });
  container.style.position = 'relative';
  container.appendChild(btn);
}

function addCopyBtn(bubble) {
  if (bubble.querySelector('.copy-md-btn')) return;
  const btn = document.createElement('button');
  btn.className = 'copy-md-btn';
  btn.title = '复制 Markdown';
  btn.textContent = '📋';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const md = bubble.dataset.markdown || '';
    navigator.clipboard.writeText(md).then(() => {
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = '📋'; }, 1500);
    }).catch(() => {
      btn.textContent = '✗';
      setTimeout(() => { btn.textContent = '📋'; }, 1500);
    });
  });
  bubble.appendChild(btn);
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

  // Append text node for performance
  const node = document.createTextNode(text);
  content.appendChild(node);

  // Truncate old nodes to keep DOM light (visual trick: we only show the tail)
  const maxLen = 150;
  if (content.innerText.length > maxLen) {
    // We keep the text node but hide the overflow or remove old nodes
    // Simplest: remove first child until text length is reasonable
    while (content.childNodes.length > 1 && content.innerText.length > maxLen + 50) {
       if (content.childNodes[0].nodeType === Node.TEXT_NODE || content.childNodes[0].nodeType === Node.COMMENT_NODE) {
           content.removeChild(content.childNodes[0]);
       } else {
           break; 
       }
    }
  }
  content.scrollTop = content.scrollHeight;
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
    addChatMessage('assitant', '❌ ' + esc(String(message)));
    return;
  }
  const hintContent = $('#hint-content');
  if (hintContent) {
    hintContent.innerHTML = `<p style="color:#ef4444;">⚠️ ${esc(String(message))}</p>`;
    setTimeout(() => { if (hintContent) hintContent.innerHTML = ''; }, 3000);
    return;
  }
  const el = $('#error-message');
  if (el) { el.textContent = message; el.style.display = 'block'; setTimeout(() => { if (el) el.style.display = 'none'; }, 3000); }
}

function clearError() {
  const el = $('#error-message');
  if (el) { el.style.display = 'none'; el.textContent = ''; }
  const hintContent = $('#hint-content');
  if (hintContent) hintContent.innerHTML = '';
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
  const input = $('#chat-input');
  if (input) input.value = '';
  const probInput = $('#problem-input');
  if (probInput) probInput.value = '';
  const msgs = $('#chat-messages');
  if (msgs) msgs.innerHTML = '';
  showWelcome();
}

// ==================== Markdown ====================
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function renderMarkdown(text) {
  let raw = String(text||'');
  // 清理流式残留
  raw = raw.replace(/^[\s\n]*\d+\s*l\s*/, '');

  let p = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 1. 保护代码块 (避免内部换行干扰后续 split)
  const codeBlocks = [];
  p = p.replace(/```(\S*)\s*\n([\s\S]*?)```/g, (_, lang, code) => {
    const id = codeBlocks.length;
    const l = (lang||'').toLowerCase();
    // 将代码块保存为 HTML，内部保留换行
    codeBlocks.push(`<pre class="code-block${l?' lang-'+l:''}"><div class="code-header">${l||'代码'}</div><code>${esc(code.trim())}</code></pre>`);
    return `\x00C${id}\x00`;
  });

  // 2. 保护 LaTeX 并做基础符号替换
  const latexBlocks = [];
  const renderLaTeX = (tex) => {
    // 去除首尾的 $ 或 $$
    let clean = tex.replace(/^\\$\\$/, '').trim().replace(/\\$\\$$/, '');
    clean = clean.replace(/^\\$/, '').trim().replace(/\\$$/, '');
    // 基础数学符号转换
    return clean
      .replace(/\\le/g, '≤').replace(/\\ge/g, '≥')
      .replace(/\\neq/g, '≠').replace(/\\to/g, '→')
      .replace(/\\times/g, '×').replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±').replace(/\\approx/g, '≈');
  };
  p = p.replace(/\$\$([\s\S]*?)\$\$|\$([^$]+)\$/g, (match, multi, single) => {
    const id = latexBlocks.length;
    latexBlocks.push(renderLaTeX(multi || single));
    return `\x00L${id}\x00`;
  });

  // 3. 处理文本中的下标 (在保护代码和 LaTeX 之后)
  // 匹配: U_{i,j} or x_i
  p = p.replace(/([a-zA-Z0-9])_\{([a-zA-Z0-9,\s]+)\}/g, '$1<sub>$2</sub>');
  p = p.replace(/([a-zA-Z0-9])_([0-9a-zA-Z]+)/g, '$1<sub>$2</sub>');

  // 4. 基础 Markdown
  p = p.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4 class="section-title">$1</h4>')
    .replace(/^## (.+)$/gm, (_, t) => {
      const cls = /解题步骤|解题|步骤/.test(t) ? 'title-steps' : /流程图|流程|图/.test(t) ? 'title-flow' : /知识点|知识|概念/.test(t) ? 'title-knowledge' : /试一试|试试|练习/.test(t) ? 'title-try' : /输入|输出|格式/.test(t) ? 'title-io' : 'section-title';
      return `<h3 class="${cls}">${t}</h3>`;
    })
    .replace(/^# (.+)$/gm, '<h2 class="section-title main-title">$1</h2>')
    .replace(/^---$/gm, '<hr class="divider">')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // 5. 分行处理段落
  const lines = p.split('\n'); 
  const result = []; 
  let para = [];

  for (const line of lines) {
    // 检查是否是占位符（块级元素）
    if (line.includes('\x00C') || line.includes('\x00L')) {
       if (para.length) result.push('<p>'+para.join('<br>')+'</p>');
       // 直接作为块级元素输出
       // 注意：占位符可能是一整行
       result.push(line);
       para = [];
       continue;
    }

    const t = line.trim();
    if (!t) { 
      if (para.length) { result.push('<p>'+para.join('<br>')+'</p>'); para = []; } 
      continue; 
    }
    // 已经是 HTML 标签的行（h2, ul, li, div, etc）
    if (/^<(h[2-4]|ul|ol|li|pre|hr|blockquote|div|sub|br)/.test(t)) { 
      if (para.length) { result.push('<p>'+para.join('<br>')+'</p>'); para = []; } 
      result.push(t); 
    } else { 
      para.push(t); 
    }
  }
  if (para.length) result.push('<p>'+para.join('<br>')+'</p>');

  return result.join('\n')
    // 6. 还原占位符
    .replace(/\x00C(\d+)\x00/g, (_, i) => codeBlocks[i] || '')
    .replace(/\x00L(\d+)\x00/g, (_, i) => latexBlocks[i] || '');
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

async function updateStorageInfo() {
  const footer = $('#history-footer');
  const info = $('#storage-info');
  if (!footer || !info) return;

  try {
    const bytes = await chrome.storage.local.getBytesInUse();
    const mb = (bytes / 1024 / 1024).toFixed(1);
    const maxMB = 10;
    const pct = Math.round((bytes / 10 / 1024 / 1024) * 100);

    footer.style.display = 'flex';
    if (mb < 0.1) {
      info.textContent = '暂无数据';
    } else if (pct > 80) {
      info.innerHTML = `<span style="color:#ef4444;">⚠️ 已用 ${mb}MB / ${maxMB}MB，建议导出后清除旧数据</span>`;
    } else {
      info.textContent = `已用 ${mb}MB / ${maxMB}MB`;
    }
  } catch (e) {
    footer.style.display = 'none';
  }
}

function switchPanel(panel) {
  const hp = $('#hint-panel'), hip = $('#history-panel'), pp = $('#plan-panel'), hlp = $('#help-panel');
  if (hp) hp.classList.toggle('active', panel === 'chat' || panel === 'hint');
  if (hip) hip.classList.toggle('active', panel === 'history');
  if (pp) pp.classList.toggle('active', panel === 'plan');
  if (hlp) hlp.classList.toggle('active', panel === 'help');
}

async function getHistoryFromStorage() {
  const r = await sendMessageSafe({ type: 'getAllHistory' });
  return r?.records || [];
}

let _historyRecords = []; // 内存中保存当前列表的所有记录，用索引引用

async function showHistory() {
  switchPanel('history'); const list = $('#history-list'); if (!list) return;
  try {
    const r = await sendMessageSafe({ type: 'getHistoryByDay' });
    const days = r?.days || [];
    if (!days.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>还没有记录</p></div>'; return; }

    list.innerHTML = '';

    days.forEach(day => {
      const dayDiv = document.createElement('div');
      dayDiv.className = 'history-day';

      const header = document.createElement('div');
      header.className = 'history-day-header';
      header.innerHTML = `<span class="history-day-date">📅 ${day.date}</span><span class="history-day-export" data-date="${day.date}" title="导出当天 JSON">📥</span>`;
      dayDiv.appendChild(header);

      header.querySelector('.history-day-export').addEventListener('click', (e) => {
        e.stopPropagation();
        sendMessageSafe({ type: 'exportHistory', date: day.date });
      });

      day.items.forEach(h => {
        const q = h.question || h.fullQuestion || '未知题目';
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `<div class="history-question">${esc(String(q).slice(0,80))}</div><div class="history-meta"><span class="history-topic">${esc(h.topic||'综合')}</span><span>${new Date(h.timestamp).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span></div>`;
        // 用闭包直接捕获 h，不依赖 dataset
        item.onclick = () => {
          const record = h;
          if (!record) { showError('记录数据无效'); return; }
          // 切换面板
          const hp = document.getElementById('hint-panel');
          const hip = document.getElementById('history-panel');
          if (hp) hp.classList.add('active');
          if (hip) hip.classList.remove('active');
          const welcome = document.getElementById('welcome-area');
          const chat = document.getElementById('chat-area');
          if (welcome) welcome.style.display = 'none';
          if (chat) chat.style.display = 'flex';
          // 显示加载提示
            const msgs = document.getElementById('chat-messages');
            if (msgs) msgs.innerHTML = '<div class="empty-state"><p>正在加载历史对话...</p></div>';
            loadHistoryConversation(record);
        };
        dayDiv.appendChild(item);
      });

      list.appendChild(dayDiv);
    });

    updateStorageInfo();
  } catch(e) { alert('加载历史列表失败: ' + e.message); list.innerHTML = '<div class="empty-state"><p>加载失败: '+e.message+'</p></div>'; }
}

function loadHistoryConversation(record) {
  if (!record || typeof record !== 'object') {
    showError('历史记录数据无效');
    return;
  }
  try {
    // 直接控制面板显示，不依赖 switchPanel
    const hp = document.getElementById('hint-panel');
    const hip = document.getElementById('history-panel');
    const pp = document.getElementById('plan-panel');
    if (hp) { hp.classList.add('active'); }
    if (hip) { hip.classList.remove('active'); }
    if (pp) { pp.classList.remove('active'); }

    // 显示聊天区域，隐藏欢迎区域
    const welcome = document.getElementById('welcome-area');
    const chat = document.getElementById('chat-area');
    if (welcome) welcome.style.display = 'none';
    if (chat) chat.style.display = 'flex';

    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.innerHTML = '';

    const question = String(record.fullQuestion || record.question || '');
    const preview = question.replace(/<[^>]+>/g, '').slice(0, 200);
    const title = document.getElementById('chat-title');
    if (title) title.textContent = '📝 ' + (preview || '历史对话');

    state.problemText = question;
    state.inChat = true;

    // 只渲染最终答案
    if (record.answer && String(record.answer).trim()) {
      addChatMessage('assistant', String(record.answer), false);
    } else {
      // 如果没有答案，显示提示
      if (msgs) msgs.innerHTML = '<div class="empty-state"><p>该记录暂无内容</p></div>';
    }

    scrollChatToBottom();
  } catch (e) {
    console.error('[loadHistory]', e);
    showError('加载历史对话失败: ' + e.message);
  }
}

let _planStreamId = null;
let _planStreamCleanup = null;

async function showPlan() {
  switchPanel('plan'); const c = $('#plan-content'); if (!c) return;
  c.innerHTML = '<div id="plan-thinking" style="display:none;"><div class="section-title">🤔 小智正在分析学习情况...</div><div id="plan-thinking-content" style="font-size:12px;color:#666;max-height:150px;overflow:auto;"></div></div><div id="plan-stream-content"></div><div class="loading-spinner" style="margin:20px auto;"></div>';

  // 停止之前的流
  if (_planStreamCleanup) { _planStreamCleanup(); _planStreamCleanup = null; }
  _planStreamId = 'plan_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);

  const thinkingEl = document.getElementById('plan-thinking');
  const thinkingContent = document.getElementById('plan-thinking-content');
  const streamContent = document.getElementById('plan-stream-content');
  let localThink = '', localContent = '', doneFinalized = false;

  const onChange = (changes, areaName) => {
    if (areaName !== 'local') return;
    const key = 'plan:' + _planStreamId;
    if (!changes[key]) return;
    const v = changes[key].newValue || {};

    if (v.thinkDelta && thinkingEl && thinkingContent) {
      localThink += v.thinkDelta;
      thinkingEl.style.display = 'block';
      thinkingContent.textContent = localThink.slice(-500);
    }
    if (v.contentDelta && streamContent) {
      localContent += v.contentDelta;
      if (thinkingEl) thinkingEl.style.display = 'none';
      // 隐藏加载动画
      const spinner = c.querySelector('.loading-spinner');
      if (spinner) spinner.style.display = 'none';
      streamContent.innerHTML = renderMarkdown(localContent);
      // 添加复制按钮
      if (!streamContent.querySelector('.plan-copy-btn')) {
        addPlanCopyBtn(streamContent, localContent);
      }
    }
    if (v.status === 'done' && !doneFinalized) {
      doneFinalized = true;
      const spinner = c.querySelector('.loading-spinner');
      if (spinner) spinner.style.display = 'none';
      // 最终渲染+复制按钮
      streamContent.innerHTML = renderMarkdown(localContent);
      if (!streamContent.querySelector('.plan-copy-btn')) {
        addPlanCopyBtn(streamContent, localContent);
      }
      cleanup();
    } else if (v.status === 'error' && !doneFinalized) {
      doneFinalized = true;
      const spinner = c.querySelector('.loading-spinner');
      if (spinner) spinner.style.display = 'none';
      cleanup();
      if (streamContent) streamContent.innerHTML = '<div class="empty-state"><p>❌ ' + esc(v.error || '生成失败') + '</p></div>';
    }
  };

  const cleanup = () => {
    chrome.storage.onChanged.removeListener(onChange);
    chrome.storage.local.remove('plan:' + _planStreamId).catch(()=>{});
    _planStreamId = null;
    _planStreamCleanup = null;
  };
  _planStreamCleanup = cleanup;

  chrome.storage.onChanged.addListener(onChange);

  try {
    const r = await sendMessageSafe({
      type: 'startPlanStream',
      streamId: _planStreamId,
      chatHistory: state.chatHistory,
      problemText: state.problemText
    });
    if (!r || r.error) {
      cleanup();
      if (c) c.innerHTML = '<div class="empty-state"><p>❌ 启动失败</p></div>';
    }
  } catch(e) {
    cleanup();
    if (c) c.innerHTML = '<div class="empty-state"><p>❌ ' + e.message + '</p></div>';
  }
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

// ==================== Help & Settings ====================
function openSettings() {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
}

function showHelp() {
  switchPanel('help');
}

function checkFirstOpen() {
  chrome.storage.local.get(['isFirstOpen', 'lastOpenedByIcon'], (result) => {
    if (result.isFirstOpen || result.lastOpenedByIcon) {
      chrome.storage.local.remove(['isFirstOpen', 'lastOpenedByIcon']);
      showHelp();
    }
  });
}

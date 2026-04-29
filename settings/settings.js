/**
 * Settings Page - 动态加载免费模型列表
 */

const ZEN_API = 'https://opencode.ai/zen/v1';
const FALLBACK_MODELS = [
  { id: 'big-pickle', name: 'Big Pickle' },
  { id: 'nemotron-3-super-free', name: 'Nemotron 3 Super (NVIDIA)' },
  { id: 'hy3-preview-free', name: 'Hy3 Preview' },
  { id: 'minimax-m2.5-free', name: 'MiniMax M2.5' }
];

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindEvents();
  fetchModels();
});

async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getSettings' });
    const s = response?.settings || {};

    const mode = s.modelMode || 'free';
    document.querySelector(`input[name="model-mode"][value="${mode}"]`).checked = true;
    toggleMode(mode);

    document.getElementById('free-api-key').value = s.zenApiKey || '';
    document.getElementById('custom-base-url').value = s.customBaseURL || '';
    document.getElementById('custom-model').value = s.customModel || '';
    document.getElementById('custom-api-key').value = s.customApiKey || '';
    document.getElementById('default-hint-level').value = s.defaultHintLevel || 2;

    // 暂时用缓存或默认值填充，fetchModels 会异步更新
    const cachedModels = s.cachedModels || [];
    if (cachedModels.length > 0) {
      populateModelSelect(cachedModels, s.freeModel);
    }
  } catch (e) { /* ignore */ }
}

async function fetchModels() {
  const statusEl = document.getElementById('models-status');
  statusEl.textContent = '正在从 Zen 获取并验证模型...';

  try {
    const resp = await fetch(`${ZEN_API}/models`);
    const data = await resp.json();
    const allModels = (data.data || [])
      .filter(m => m.id)
      .map(m => ({ id: m.id, name: m.id }));

    if (allModels.length === 0) throw new Error('empty list');

    // 并发快速验证每个模型是否可用
    statusEl.textContent = `正在验证 ${allModels.length} 个模型...`;
    const apiKey = document.getElementById('free-api-key').value.trim();

    const results = await Promise.allSettled(
      allModels.map(async (m) => {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        const r = await fetch(`${ZEN_API}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: m.id,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 20
          })
        });
        if (!r.ok) return null;
        const d = await r.json();
        const msg = d?.choices?.[0]?.message || {};
        // 有 content 或 reasoning 就算可用
        if (msg.content || msg.reasoning) return m;
        return null;
      })
    );

    const working = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    if (working.length === 0) {
      populateModelSelect(FALLBACK_MODELS, 'big-pickle');
      statusEl.textContent = '⚠️ 无可用模型，使用本地缓存';
      statusEl.style.color = '#f59e0b';
    } else {
      populateModelSelect(working, 'big-pickle');
      statusEl.textContent = `✅ ${working.length} 个模型可用（已自动筛选）`;
      statusEl.style.color = '#10b981';

      // 缓存
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'getSettings' });
        await chrome.runtime.sendMessage({
          type: 'saveSettings',
          settings: { ...(resp?.settings || {}), cachedModels: working }
        });
      } catch (_) {}
    }
  } catch (e) {
    statusEl.textContent = '⚠️ 无法连接 Zen，使用本地缓存';
    statusEl.style.color = '#f59e0b';
    try {
      const r = await chrome.runtime.sendMessage({ type: 'getSettings' });
      const s = r?.settings || {};
      populateModelSelect(s.cachedModels?.length ? s.cachedModels : FALLBACK_MODELS, s.freeModel || 'big-pickle');
    } catch (_) {
      populateModelSelect(FALLBACK_MODELS, 'big-pickle');
    }
  }
}

function populateModelSelect(models, selectedId) {
  const select = document.getElementById('free-model-select');
  select.innerHTML = models.map(m =>
    `<option value="${escAttr(m.id)}" ${m.id === selectedId ? 'selected' : ''}>${escAttr(m.name || m.id)}</option>`
  ).join('');

  if (models.length === 0) {
    select.innerHTML = '<option value="">无可用模型</option>';
  }
}

function toggleMode(mode) {
  document.getElementById('free-section').style.display = mode === 'free' ? 'block' : 'none';
  document.getElementById('custom-section').style.display = mode === 'custom' ? 'block' : 'none';
}

function bindEvents() {
  document.querySelectorAll('input[name="model-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => toggleMode(e.target.value));
  });

  document.getElementById('save-btn').addEventListener('click', saveSettings);
  document.getElementById('refresh-models-btn').addEventListener('click', fetchModels);
  document.getElementById('test-model-btn').addEventListener('click', testModel);

  document.getElementById('clear-history-btn').addEventListener('click', async () => {
    if (confirm('确定要清除所有提问记录吗？此操作不可撤销。')) {
      await chrome.storage.local.remove('question_history');
      setStatus('提问记录已清除', 'success');
    }
  });
}

async function testModel() {
  const statusEl = document.getElementById('test-status');
  const model = document.getElementById('free-model-select').value;
  const apiKey = document.getElementById('free-api-key').value.trim();

  if (!model) {
    statusEl.textContent = '⚠️ 请先选择一个模型';
    statusEl.style.color = '#f59e0b';
    return;
  }

  statusEl.textContent = '测试中...';
  statusEl.style.color = '';

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const resp = await fetch(`${ZEN_API}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 10
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      const reply = data?.choices?.[0]?.message?.content || '(空响应)';
      statusEl.textContent = `✅ 可用！模型回复: "${reply.slice(0, 30)}"`;
      statusEl.style.color = '#10b981';
    } else {
      const err = await resp.json().catch(() => ({}));
      statusEl.textContent = `❌ HTTP ${resp.status}: ${err.error?.message || '请求失败'}`;
      statusEl.style.color = '#ef4444';
    }
  } catch (e) {
    statusEl.textContent = `❌ 网络错误: ${e.message}`;
    statusEl.style.color = '#ef4444';
  }
}

async function saveSettings() {
  const mode = document.querySelector('input[name="model-mode"]:checked').value;

  // 保留已有的缓存模型
  let cachedModels = FALLBACK_MODELS;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'getSettings' });
    if (resp?.settings?.cachedModels) cachedModels = resp.settings.cachedModels;
  } catch (_) {}

  const settings = {
    modelMode: mode,
    freeModel: document.getElementById('free-model-select').value,
    zenApiKey: document.getElementById('free-api-key').value.trim(),
    customBaseURL: document.getElementById('custom-base-url').value.trim(),
    customModel: document.getElementById('custom-model').value.trim(),
    customApiKey: document.getElementById('custom-api-key').value.trim(),
    defaultHintLevel: parseInt(document.getElementById('default-hint-level').value),
    cachedModels
  };

  try {
    await chrome.runtime.sendMessage({ type: 'saveSettings', settings });
    await chrome.storage.local.set({ tutor_settings: settings });
    setStatus('设置已保存 ✓', 'success');
  } catch (e) {
    setStatus('保存失败: ' + e.message, 'error');
  }
}

function setStatus(message, type) {
  const el = document.getElementById('save-status');
  el.textContent = message;
  el.className = 'save-status';
  if (type) el.classList.add(type);
  setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 3000);
}

function escAttr(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

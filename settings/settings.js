/**
 * Settings Page - 多标签式设置 + AI 高级参数配置
 */

const ZEN_API = 'https://opencode.ai/zen/v1';
const FALLBACK_MODELS = [
  { id: 'big-pickle', name: 'Big Pickle' },
  { id: 'nemotron-3-super-free', name: 'Nemotron 3 Super (NVIDIA)' },
  { id: 'hy3-preview-free', name: 'Hy3 Preview' },
  { id: 'minimax-m2.5-free', name: 'MiniMax M2.5' }
];

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  await loadSettings();
  bindEvents();
  fetchModels();
  updateStorageInfo();
});

// ==================== 标签切换 ====================
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      
      // 更新按钮状态
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // 更新内容显示
      tabPanes.forEach(pane => {
        pane.classList.toggle('active', pane.id === 'tab-' + target);
      });
    });
  });
}

// ==================== 加载设置 ====================
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getSettings' });
    const s = response?.settings || {};

    // 模型模式
    const mode = s.modelMode || 'free';
    const modeRadio = document.querySelector(`input[name="model-mode"][value="${mode}"]`);
    if (modeRadio) modeRadio.checked = true;
    toggleMode(mode);

    // 免费模型
    document.getElementById('free-api-key').value = s.zenApiKey || '';
    
    // 自定义模型
    document.getElementById('custom-base-url').value = s.customBaseURL || '';
    document.getElementById('custom-model').value = s.customModel || '';
    document.getElementById('custom-api-key').value = s.customApiKey || '';

    // AI 参数
    document.getElementById('enable-thinking').checked = s.enableThinking !== false; // 默认开启
    document.getElementById('temperature').value = s.temperature || 0.3;
    document.getElementById('temp-value').textContent = s.temperature || 0.3;
    document.getElementById('max-tokens').value = s.maxTokens || 32768;
    document.getElementById('top-p').value = s.topP || 1.0;
    document.getElementById('top-p-value').textContent = s.topP || 1.0;

    // 教练设置
    document.getElementById('default-hint-level').value = s.defaultHintLevel || 2;
    document.getElementById('coach-style-select').value = s.coachStyle || 'default';
    document.getElementById('auto-detect-code').checked = s.autoDetectCode !== false; // 默认开启

    // 暂时用缓存或默认值填充，fetchModels 会异步更新
    const cachedModels = s.cachedModels || [];
    if (cachedModels.length > 0) {
      populateModelSelect(cachedModels, s.freeModel);
    }

    // 滑块实时显示
    bindSliderEvents();
  } catch (e) { /* ignore */ }
}

// ==================== 滑块事件 ====================
function bindSliderEvents() {
  const tempSlider = document.getElementById('temperature');
  const tempValue = document.getElementById('temp-value');
  tempSlider.addEventListener('input', () => {
    tempValue.textContent = tempSlider.value;
  });

  const topPSlider = document.getElementById('top-p');
  const topPValue = document.getElementById('top-p-value');
  topPSlider.addEventListener('input', () => {
    topPValue.textContent = topPSlider.value;
  });
}

// ==================== 模型列表 ====================
async function fetchModels() {
  const statusEl = document.getElementById('models-status');
  statusEl.textContent = '正在获取模型列表...';

  try {
    const resp = await fetch(`${ZEN_API}/models`);
    const data = await resp.json();
    const allModels = (data.data || [])
      .filter(m => m.id && (m.id.includes('free') || m.id === 'big-pickle'))
      .map(m => ({ id: m.id, name: m.id }));

    if (allModels.length === 0) throw new Error('empty list');

    statusEl.textContent = `✅ 获取到 ${allModels.length} 个可用模型`;
    statusEl.style.color = '#10b981';
    populateModelSelect(allModels, allModels[0]?.id || 'big-pickle');

    // 异步缓存（不阻塞）
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'getSettings' });
      await chrome.runtime.sendMessage({
        type: 'saveSettings',
        settings: { ...(resp?.settings || {}), cachedModels: allModels }
      });
    } catch (_) {}

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

// ==================== 模式切换 ====================
function toggleMode(mode) {
  document.getElementById('free-section').style.display = mode === 'free' ? 'block' : 'none';
  document.getElementById('custom-section').style.display = mode === 'custom' ? 'block' : 'none';
}

// ==================== 事件绑定 ====================
function bindEvents() {
  // 模型模式切换
  document.querySelectorAll('input[name="model-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => toggleMode(e.target.value));
  });

  // 保存按钮
  document.getElementById('save-btn').addEventListener('click', saveSettings);

  // 刷新模型列表
  document.getElementById('refresh-models-btn').addEventListener('click', fetchModels);

  // 测试模型
  document.getElementById('test-model-btn').addEventListener('click', testModel);
  document.getElementById('test-custom-btn').addEventListener('click', testCustomModel);

  // 清除历史
  document.getElementById('clear-history-btn').addEventListener('click', async () => {
    if (confirm('确定要清除所有提问记录吗？此操作不可撤销。')) {
      await chrome.storage.local.remove('question_history');
      setStatus('提问记录已清除', 'success');
      updateStorageInfo();
    }
  });

  // 刷新存储信息
  document.getElementById('refresh-storage-btn').addEventListener('click', updateStorageInfo);
}

// ==================== 测试模型 ====================
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

async function testCustomModel() {
  const statusEl = document.getElementById('test-custom-status');
  const baseURL = document.getElementById('custom-base-url').value.trim();
  const model = document.getElementById('custom-model').value.trim();
  const apiKey = document.getElementById('custom-api-key').value.trim();

  if (!baseURL || !model) {
    statusEl.textContent = '⚠️ 请填写 API 地址和模型名称';
    statusEl.style.color = '#f59e0b';
    return;
  }

  statusEl.textContent = '测试中...';
  statusEl.style.color = '';

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const resp = await fetch(`${baseURL}/chat/completions`, {
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

// ==================== 保存设置 ====================
async function saveSettings() {
  const mode = document.querySelector('input[name="model-mode"]:checked')?.value || 'free';

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
    // AI 参数
    enableThinking: document.getElementById('enable-thinking').checked,
    temperature: parseFloat(document.getElementById('temperature').value),
    maxTokens: parseInt(document.getElementById('max-tokens').value),
    topP: parseFloat(document.getElementById('top-p').value),
    // 教练设置
    defaultHintLevel: parseInt(document.getElementById('default-hint-level').value),
    coachStyle: document.getElementById('coach-style-select').value || 'default',
    autoDetectCode: document.getElementById('auto-detect-code').checked,
    // 保留缓存
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

// ==================== 存储信息 ====================
async function updateStorageInfo() {
  const infoEl = document.getElementById('storage-info');
  try {
    const data = await chrome.storage.local.get(null);
    const keys = Object.keys(data);
    let totalSize = 0;
    keys.forEach(k => {
      totalSize += JSON.stringify(data[k]).length;
    });
    
    const historyCount = (data.question_history || []).length;
    const settings = data.tutor_settings || {};
    
    infoEl.innerHTML = `
      <p>📊 历史记录：${historyCount} 条</p>
      <p>💾 存储用量：约 ${formatBytes(totalSize)}</p>
      <p>🔧 当前模型：${settings.modelMode === 'custom' ? settings.customModel || '未设置' : settings.freeModel || '未选择'}</p>
      <p>🎓 教练风格：${getStyleName(settings.coachStyle)}</p>
    `;
  } catch (e) {
    infoEl.innerHTML = '<p>加载存储信息失败</p>';
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getStyleName(key) {
  const map = {
    'default': '专业温和型',
    'encouraging': '热情鼓励型',
    'humorous': '幽默风趣型',
    'sarcastic': '毒舌严师型'
  };
  return map[key] || '未知';
}

// ==================== 工具函数 ====================
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

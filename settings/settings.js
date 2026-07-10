/**
 * Settings Page - 多标签式设置 + AI 高级参数配置
 */

const ZEN_API = 'https://opencode.ai/zen/v1';

/**
 * 兜底模型（仅 /models 接口完全不可用时用）。
 * 不要在这里写死 API 不存在的模型——opencode 模型会变，以服务器返回为准。
 * 动态加载优先：/models → 逐一实测 → 缓存。此处仅留一个已知可用的兜底。
 */
const FALLBACK_MODELS = [
  { id: 'big-pickle', name: 'Big Pickle' }
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
    document.getElementById('temperature').value = s.temperature ?? 0.1;
    document.getElementById('temp-value').textContent = s.temperature ?? 0.1;
    document.getElementById('max-tokens').value = s.maxTokens || 32768;
    document.getElementById('top-p').value = s.topP || 1.0;
    document.getElementById('top-p-value').textContent = s.topP || 1.0;

    // 教练设置
    document.getElementById('default-hint-level').value = s.defaultHintLevel || 2;
    document.getElementById('coach-style-select').value = s.coachStyle || 'default';
    renderCoachStylePreview(s.coachStyle || 'default');
    document.getElementById('auto-detect-code').checked = s.autoDetectCode !== false; // 默认开启

    // 语音设置
    document.getElementById('tts-enabled').checked = !!s.ttsEnabled;
    document.getElementById('tts-rate').value = s.ttsRate ?? 1.2;
    document.getElementById('tts-rate-value').textContent = s.ttsRate ?? 1.2;
    // 语音列表在刷新时填充，但先尝试加载已保存的音色
    populateVoiceList(s.ttsVoice || '');

    // 先用缓存/默认模型占位，fetchModels 会立即用实测列表填充
    const models = s.cachedModels?.length ? s.cachedModels : FALLBACK_MODELS;
    populateModelSelect(models, s.freeModel || 'big-pickle');

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

  const ttsRateSlider = document.getElementById('tts-rate');
  const ttsRateValue = document.getElementById('tts-rate-value');
  if (ttsRateSlider) {
    ttsRateSlider.addEventListener('input', () => {
      ttsRateValue.textContent = ttsRateSlider.value;
    });
  }
}

// ==================== 模型列表 ====================
/**
 * 从 Zen API 拉取免费模型列表，逐个实测验证可用性，
 * 只有能正常返回的模型才展示给用户。
 * 
 * 为什么要实测：
 * /models 接口返回的模型中，不少带 "free" 标签的实际上已失效或不可用，
 * 如果全部列出来，用户选到不能用的模型会困惑。
 * 
 * 实测方式：对每个模型发一条最简单的 chat completion 请求（max_tokens=1），
 * 成功的留下，失败的剔除。
 */
async function fetchModels() {
  const statusEl = document.getElementById('models-status');
  const savedModel = document.getElementById('free-model-select').value || 'big-pickle';

  statusEl.textContent = '正在获取模型列表...';
  statusEl.style.color = '';

  try {
    // 1. 拉取模型列表
    const resp = await fetch(`${ZEN_API}/models`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    let rawModels = (data.data || []).map(m => ({ id: m.id, name: m.id }));
      if (!rawModels.find(m => m.id === 'big-pickle')) {
        rawModels.push({ id: 'big-pickle', name: 'Big Pickle' });
      }

    if (rawModels.length === 0) throw new Error('empty list');

    // 2. 逐个实测
    statusEl.textContent = `正在验证 ${rawModels.length} 个模型的可用性...`;
    const results = await testModels(rawModels);

    const working = results.filter(r => r.ok).map(r => r.model);
    const failed  = results.filter(r => !r.ok).map(r => r.model.id);

    if (working.length === 0) throw new Error('all models failed');

    // Always include big-pickle as known-good default
    if (!working.find(m => m.id === 'big-pickle')) {
      working.unshift({ id: 'big-pickle', name: 'Big Pickle' });
    }

    // 3. 只展示能用的
    populateModelSelect(working, working.some(m => m.id === savedModel) ? savedModel : working[0].id);

    const failHint = failed.length > 0 ? `，${failed.length} 个不可用已剔除` : '';
    statusEl.textContent = `✅ ${working.length} 个可用模型${failHint}`;
    statusEl.style.color = '#10b981';

    // 异步缓存
    try {
      const r = await chrome.runtime.sendMessage({ type: 'getSettings' });
      await chrome.runtime.sendMessage({
        type: 'saveSettings',
        settings: { ...(r?.settings || {}), cachedModels: working }
      });
    } catch (_) {}

  } catch (e) {
    statusEl.textContent = '⚠️ 无法获取可用模型，使用本地缓存';
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

/**
 * 并发测试一批模型，发一条最简单的 chat completion 验证是否可用。
 * 返回每个模型的测试结果。
 */
async function testModels(models) {
  const testPromises = models.map(model =>
    testSingleModel(model).then(ok => ({ model, ok })).catch(() => ({ model, ok: false }))
  );
  // 全部并发，谁先完谁先报
  return Promise.allSettled(testPromises).then(results =>
    results.map(r => r.status === 'fulfilled' ? r.value : { model: null, ok: false })
  );
}

/**
 * 测试单个模型：发一条 max_tokens=1 的请求，只要能正常返回就算通过。
 */
async function testSingleModel(model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10 秒超时

  try {
    const resp = await fetch(`${ZEN_API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      }),
      signal: controller.signal
    });

    if (!resp.ok) return false;

    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content;
    return reply !== undefined && reply !== null;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
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

  // 刷新语音列表
  const refreshVoicesBtn = document.getElementById('refresh-voices-btn');
  if (refreshVoicesBtn) refreshVoicesBtn.addEventListener('click', populateVoiceList);

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

  // 教练风格预览
  document.getElementById('coach-style-select').addEventListener('change', (e) => {
    renderCoachStylePreview(e.target.value);
  });
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

  // Preserve existing cached models — don't overwrite with FALLBACK_MODELS
  let existingCached = [];
  try {
    const r = await chrome.runtime.sendMessage({ type: 'getSettings' });
    existingCached = r?.settings?.cachedModels || [];
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
    // 语音设置
    ttsEnabled: document.getElementById('tts-enabled').checked,
    ttsRate: parseFloat(document.getElementById('tts-rate').value),
    ttsVoice: document.getElementById('tts-voice').value || '',
    cachedModels: existingCached.length > 0 ? existingCached : FALLBACK_MODELS
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

const COACH_STYLES = {
  default:    { name: '老周', emoji: '🧭', tagline: '沉稳靠谱的学长', desc: '话不多但每句在点。用"说白了、其实、你看"把复杂讲简单，温和直接不绕弯。' },
  encouraging: { name: '小满', emoji: '🌟', tagline: '炸裂热情的元气好友', desc: '全程 high energy，每轮先具体夸你，把 bug 当关卡。感叹号+emoji 拉满动力。' },
  humorous:   { name: '老梗', emoji: '😎', tagline: '段子手型教练', desc: '比喻狂魔+自黑+玩梗，把算法讲成脱口秀。靠语言有趣，几乎不用 emoji。' },
  direct:     { name: '阿锐', emoji: '⚡', tagline: '竞赛圈技术大佬', desc: '话极少极准，带冷幽默。做对"对。下一步。"出错直接点破。不寒暄不废话。' }
};

function getStyleName(key) {
  return COACH_STYLES[key]?.name || '老周';
}

function renderCoachStylePreview(key) {
  const el = document.getElementById('coach-style-preview');
  if (!el) return;
  const style = COACH_STYLES[key] || COACH_STYLES.default;
  el.innerHTML = `
    <div class="coach-preview-card">
      <div class="coach-preview-header">
        <span class="coach-preview-emoji">${style.emoji}</span>
        <span class="coach-preview-name">${style.name}</span>
        <span class="coach-preview-tagline">${style.tagline}</span>
      </div>
      <p class="coach-preview-desc">${style.desc}</p>
    </div>
  `;
}

// ==================== 语音列表 ====================
function populateVoiceList(selectedVoice) {
  const select = document.getElementById('tts-voice');
  if (!select) return;
  const voices = speechSynthesis.getVoices();
  // 保留默认选项
  select.innerHTML = '<option value="">系统默认</option>';
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = v.name + ' (' + v.lang + ')';
    if (v.voiceURI === selectedVoice) opt.selected = true;
    select.appendChild(opt);
  });
  // 如果 speechSynthesis 还没加载完，监听 voiceschanged
  if (voices.length === 0) {
    speechSynthesis.onvoiceschanged = () => {
      populateVoiceList(selectedVoice || document.getElementById('tts-voice')?.value || '');
    };
  }
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

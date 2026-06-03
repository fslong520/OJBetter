/**
 * PDF Export Module - 学习报告导出
 * 依赖: jspdf (src/lib/jspdf.es.min.js)
 */
// UMD 版 jspdf 通过 <script> 加载，挂载在 window.jspdf.jsPDF
const { jsPDF } = window.jspdf;

/**
 * 从题目文本中提取标题（首行非空内容）
 * @param {string} text
 * @returns {string}
 */
function extractTitle(text) {
  if (!text) return '未知题目';
  const clean = String(text).replace(/<[^>]+>/g, '').trim();
  const lines = clean.split('\n').filter(l => l.trim());
  const title = lines[0] || '未知题目';
  return title.replace(/[\\/:*?"<>|]/g, '').slice(0, 40).trim() || '未知题目';
}

/**
 * 构建完整的报告 HTML 字符串（内联 CSS，无需外部资源）
 * @param {string} problemText
 * @param {Array} chatHistory
 * @param {string} dateStr 如 "2026年06月03日"
 * @returns {string}
 */
function buildReportHTML(problemText, chatHistory, dateStr) {
  const cleanProblem = String(problemText || '').replace(/<[^>]+>/g, '').trim();
  const problemTitle = extractTitle(problemText);

  // —— 消息气泡 ——
  const messagesHTML = chatHistory.map((msg) => {
    const role = msg.role === 'user' ? '学生' : '小智';
    const roleClass = msg.role === 'user' ? 'user' : 'assistant';
    const content = String(msg.content || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    return `
      <div class="message message-${roleClass}">
        <div class="message-role">${role}</div>
        <div class="message-bubble">${content}</div>
      </div>`;
  }).join('');

  // —— 统计 ——
  const totalMessages = chatHistory.length;
  const userMessages = chatHistory.filter(m => m.role === 'user').length;
  const assistantMessages = chatHistory.filter(m => m.role === 'assistant').length;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', sans-serif;
    color: #2C2C2C;
    font-size: 12px;
    line-height: 1.6;
    background: #F8F7F4;
  }

  /* ===== 封面 ===== */
  .cover {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 297mm;
    text-align: center;
    page-break-after: always;
    background: linear-gradient(135deg, #F0EEF7 0%, #F8F7F4 100%);
  }
  .cover .logo     { font-size: 64px; margin-bottom: 16px; }
  .cover h1        { font-size: 28px; color: #6B6BCB; margin-bottom: 8px; font-weight: 700; letter-spacing: 2px; }
  .cover .subtitle { font-size: 14px; color: #8A8A8A; margin-bottom: 40px; }
  .cover .date     { font-size: 13px; color: #B0B0B0; margin-bottom: 24px; }
  .cover .divider  { width: 60px; height: 2px; background: #6B6BCB; margin: 0 auto 32px; }
  .cover .problem-preview {
    max-width: 80%;
    font-size: 13px;
    color: #555;
    line-height: 1.8;
    padding: 20px 24px;
    background: rgba(255,255,255,0.8);
    border-radius: 8px;
    border: 1px solid #E6E2DC;
    text-align: left;
    word-break: break-word;
  }

  /* ===== 对话页 ===== */
  .content {
    padding: 24px 28px;
    min-height: 277mm;
  }
  .page-title {
    font-size: 18px;
    color: #6B6BCB;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 2px solid #6B6BCB;
    font-weight: 600;
  }

  .message {
    margin-bottom: 14px;
    page-break-inside: avoid;
  }
  .message-role {
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 4px;
    letter-spacing: 0.5px;
  }
  .message-user .message-role      { color: #6B6BCB; text-align: right; }
  .message-assistant .message-role { color: #C49B6B; }

  .message-bubble {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.7;
    word-break: break-word;
  }
  .message-user .message-bubble {
    background: #6B6BCB;
    color: #fff;
    margin-left: 40px;
  }
  .message-assistant .message-bubble {
    background: #F0EDEA;
    color: #2C2C2C;
    margin-right: 40px;
    border: 1px solid #E6E2DC;
  }

  /* ===== 统计页 ===== */
  .stats {
    page-break-before: always;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 277mm;
    padding: 20mm;
    text-align: center;
    background: #F8F7F4;
  }
  .stats h2 {
    font-size: 22px;
    color: #6B6BCB;
    margin-bottom: 32px;
    font-weight: 700;
  }
  .stats-grid {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .stat-card {
    background: #F0EEF7;
    border-radius: 12px;
    padding: 24px 28px;
    min-width: 130px;
    border: 1px solid #E6E2DC;
  }
  .stat-card .number { font-size: 32px; font-weight: 700; color: #6B6BCB; }
  .stat-card .label  { font-size: 12px; color: #8A8A8A; margin-top: 6px; }
  .stats-footer {
    margin-top: 48px;
    font-size: 11px;
    color: #B0B0B0;
    letter-spacing: 1px;
  }
</style>
</head>
<body>
  <!-- ===== 封面 ===== -->
  <div class="cover">
    <div class="logo">🦉</div>
    <h1>OJBetter 学习报告</h1>
    <div class="subtitle">渐进式 AI 编程助教 · 独立思考从这里开始</div>
    <div class="divider"></div>
    <div class="date">📅 ${dateStr}</div>
    <div class="problem-preview">${cleanProblem.slice(0, 400).replace(/\n/g, '<br>')}</div>
  </div>

  <!-- ===== 对话记录 ===== -->
  <div class="content">
    <h2 class="page-title">💬 对话记录</h2>
    ${messagesHTML || '<p style="color:#B0B0B0;text-align:center;padding:60px 0;">暂无对话记录</p>'}
  </div>

  <!-- ===== 统计 ===== -->
  <div class="stats">
    <h2>📊 学习统计</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="number">${totalMessages}</div>
        <div class="label">总消息数</div>
      </div>
      <div class="stat-card">
        <div class="number">${userMessages}</div>
        <div class="label">学生提问</div>
      </div>
      <div class="stat-card">
        <div class="number">${assistantMessages}</div>
        <div class="label">小智回复</div>
      </div>
    </div>
    <div class="stats-footer">
      由 🦉 OJBetter 自动生成
    </div>
  </div>
</body>
</html>`;
}

/**
 * 导出学习报告 PDF
 * @param {string}   problemText  题目文本
 * @param {Array}    chatHistory  对话历史 [{role:'user'|'assistant', content:string}, ...]
 * @returns {Promise<void>}
 */
export async function exportLearningReport(problemText, chatHistory) {
  if (!problemText && (!chatHistory || chatHistory.length === 0)) {
    throw new Error('无内容可导出。请先开始一次对话。');
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日`;
  const fileDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const problemTitle = extractTitle(problemText);

  const htmlContent = buildReportHTML(problemText, chatHistory || [], dateStr);

  const doc = new jsPDF('p', 'mm', 'a4');

  // 利用浏览器的 HTML 渲染引擎处理中文排版
  await doc.html(htmlContent, {
    x: 0,
    y: 0,
    width: 210,       // A4 宽度
    windowWidth: 800, // 模拟浏览器窗口宽度
    autoPaging: 'text'
  });

  // 写入文件名
  const safeTitle = problemTitle.replace(/[\\/:*?"<>|]/g, '_').trim() || '未知题目';
  const filename = `学习报告_${safeTitle}_${fileDateStr}.pdf`;
  doc.save(filename);
}

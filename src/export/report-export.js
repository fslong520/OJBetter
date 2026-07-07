/**
 * 学习报告导出 — Markdown 格式
 * 不再使用 jsPDF/html2canvas，直接生成 .md 文件下载
 */
import { hintGenerator } from '../ai/providers.js';

function extractTitle(text) {
  if (!text) return '未知题目';
  const clean = String(text).replace(/<[^>]+>/g, '').trim();
  const lines = clean.split('\n').filter(l => l.trim());
  const title = lines[0] || '未知题目';
  return title.replace(/[\\/:*?"<>|]/g, '').slice(0, 40).trim() || '未知题目';
}

function formatDate(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 构建 Markdown 学习报告
 */
function buildReportMD(problemText, chatHistory, aiAnalysis) {
  const lines = [];
  const cleanProblem = String(problemText || '').replace(/<[^>]+>/g, '').trim();

  lines.push('# OJBetter 学习报告');
  lines.push('');
  lines.push(`> 生成时间：${formatDate(new Date())}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 题目
  lines.push('## 题目内容');
  lines.push('');
  if (cleanProblem) {
    lines.push(cleanProblem);
  } else {
    lines.push('*无题目内容*');
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // AI 学习分析
  if (aiAnalysis) {
    lines.push('## AI 学习分析');
    lines.push('');
    lines.push(aiAnalysis);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // 对话记录
  lines.push('## 对话记录');
  lines.push('');

  if (!chatHistory || chatHistory.length === 0) {
    lines.push('*暂无对话记录*');
  } else {
    for (const msg of chatHistory) {
      const role = msg.role === 'user' ? '**学生**' : '**小智**';
      const content = msg.content || '';
      if (msg.role === 'user') {
        lines.push(`> ${role}`);
        lines.push('>');
        lines.push(`> ${content.replace(/\n/g, '\n> ')}`);
        lines.push('');
      } else {
        lines.push(`${role}`);
        lines.push('');
        // AI 回复通常含 Markdown（代码块、标题等），直接原样输出
        lines.push(content);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
  }

  // 统计
  const total = chatHistory.length;
  const userCount = chatHistory.filter(m => m.role === 'user').length;
  const assistantCount = chatHistory.filter(m => m.role === 'assistant').length;

  lines.push('## 学习统计');
  lines.push('');
  lines.push(`- 总消息数：${total}`);
  lines.push(`- 学生提问：${userCount}`);
  lines.push(`- 小智回复：${assistantCount}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*由 OJBetter 自动生成*');

  return lines.join('\n');
}

/**
 * 导出学习报告（Markdown 格式）
 */
export async function exportLearningReport(problemText, chatHistory) {
  if (!problemText && (!chatHistory || chatHistory.length === 0)) {
    throw new Error('无内容可导出。请先开始一次对话。');
  }

  const now = new Date();
  const problemTitle = extractTitle(problemText);
  const safeTitle = problemTitle.replace(/[\\/:*?"<>|]/g, '_').trim() || '未知题目';
  const dateStr = formatDate(now);
  const filename = `学习报告_${safeTitle}_${dateStr}.md`;

  // AI 学习分析
  let aiAnalysis = null;
  try {
    aiAnalysis = await hintGenerator.analyzeReport(problemText, chatHistory || []);
  } catch (e) {
    aiAnalysis = `> ⚠️ AI 分析暂时不可用：${e.message}\n\n`;
  }

  const markdown = buildReportMD(problemText, chatHistory || [], aiAnalysis);

  // 下载 .md 文件
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

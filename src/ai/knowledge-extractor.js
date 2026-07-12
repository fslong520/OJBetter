/**
 * 知识点提取器
 * 非流式 AI 调用：从辅导对话中提取结构化知识数据
 */

import { getSettings } from '../storage/settings.js';
import { ZEN_BASE_URL } from '../config/models.js';

async function _getConfig() {
  const settings = await getSettings();
  const baseConfig = {
    temperature: 0.1,
    maxTokens: 500,
    topP: 1.0,
  };

  if (settings.modelMode === 'custom') {
    return {
      ...baseConfig,
      baseURL: settings.customBaseURL || 'https://api.example.com/v1',
      model: settings.customModel || 'gpt-4o-mini',
      apiKey: settings.customApiKey || ''
    };
  }
  return {
    ...baseConfig,
    baseURL: ZEN_BASE_URL,
    model: settings.freeModel || 'big-pickle',
    apiKey: settings.zenApiKey || ''
  };
}

/** Build a compact conversation log from chatHistory (last ~6 rounds) */
function _buildConversationLog(chatHistory) {
  if (!Array.isArray(chatHistory) || chatHistory.length === 0) return '（无对话记录）';

  // Take last 12 messages (≈6 rounds) to keep prompt compact
  const recent = chatHistory.slice(-12);
  return recent.map(m => {
    const role = m.role === 'user' ? '学生' : '教练';
    return `${role}: ${String(m.content || '').slice(0, 800)}`;
  }).join('\n\n---\n\n');
}

/** Attempt to parse JSON from AI response, with fallbacks */
function _parseJSON(text) {
  if (!text) return null;

  // Direct parse
  try {
    return JSON.parse(text);
  } catch (_) {}

  // Extract from markdown code block
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (blockMatch) {
    try {
      return JSON.parse(blockMatch[1].trim());
    } catch (_) {}
  }

  // Try to find a JSON-like object in the text
  const objMatch = text.match(/\{[\s\S]*"knowledgePoints"[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch (_) {}
  }

  return null;
}

function _defaultResult() {
  return {
    knowledgePoints: [],
    difficulty: 0,
    tags: [],
    masteryEstimate: 0.5,
    codeSnippets: [],
    codeQuality: '',
    commonMistakes: []
  };
}

/**
 * 从辅导对话中提取结构化知识
 * @param {string} problemText - 题目描述
 * @param {Array<{role:string, content:string}>} chatHistory - 对话历史
 * @param {number} hintLevel - 提示深度 (1/2/3)
 * @returns {Promise<{knowledgePoints: string[], difficulty: number, tags: string[], masteryEstimate: number}>}
 */
async function extractKnowledgeFromSession(problemText, chatHistory, hintLevel) {
  try {
    const config = await _getConfig();
    const cleanText = String(problemText || '')
      .replace(/<[^>]+>/g, '').trim().slice(0, 3000);

    const conversation = _buildConversationLog(chatHistory);

    const systemPrompt = `你是一位信奥教学分析师。分析以下编程题目和学生与AI教练的对话记录，提取结构化学习数据。`;

    const userPrompt = `## 题目
${cleanText || '（未提供）'}

## 对话记录（最后几轮）
${conversation}

## 提示深度
hintLevel = ${hintLevel}（1=仅思路, 2=流程图, 3=伪代码）

 请返回严格的 JSON 格式，不要包含其他文字：
{
  "knowledgePoints": ["知识点1", "知识点2"],
  "difficulty": 1200,
  "tags": ["标签1", "标签2"],
  "masteryEstimate": 0.6,
  "codeSnippets": [{"language": "cpp", "summary": "二维数组实现背包，但忘记初始化dp[0]", "lineCount": 28, "keyIssues": ["未初始化"]}],
  "codeQuality": "代码结构清晰，变量命名规范",
  "commonMistakes": ["初始化遗漏"]
}

说明：
- knowledgePoints: 1-4个，中文，该题涉及的核心知识点
- difficulty: CF Rating 800-3500（参考：800=入门, 1200=普及, 1600=提高, 2000+=省选）
- tags: 1-3个，英文或中文算法标签
- masteryEstimate: 0-1，基于 hintLevel 和对话质量估计掌握度
  hintLevel=1 → 0.7-0.9, hintLevel=2 → 0.4-0.7, hintLevel=3 → 0.1-0.4

## 代码分析（如对话中有学生提交的代码）
如对话中学生提交了代码，请额外分析：
- codeSnippets: 数组，每项含 language(编程语言)/summary(代码作用一句话)/lineCount(行数)/keyIssues(关键问题列表)
- codeQuality: 字符串，代码质量一句话评价（如"变量命名规范，但缺少边界检查"）
- commonMistakes: 字符串数组，常见错误列表（如["数组越界","未初始化"]）

如对话中无代码，codeSnippets 返回空数组 []，codeQuality 返回空字符串 ""，commonMistakes 返回空数组 []。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const url = `${config.baseURL}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OJBetter/1.1.3 (Chrome Extension)'
    };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const body = {
      model: config.model,
      messages,
      stream: false,
      temperature: config.temperature,
      max_tokens: config.maxTokens
    };
    if (config.topP !== undefined && config.topP < 1.0) body.top_p = config.topP;

    const response = await fetch(url, {
      method: 'POST', headers, body: JSON.stringify(body)
    });

    if (!response.ok) {
      return _defaultResult();
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = _parseJSON(content);

    if (parsed) {
      return {
        knowledgePoints: Array.isArray(parsed.knowledgePoints) ? parsed.knowledgePoints : [],
        difficulty: typeof parsed.difficulty === 'number' ? parsed.difficulty : 0,
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        masteryEstimate: typeof parsed.masteryEstimate === 'number' ? parsed.masteryEstimate : 0.5,
        codeSnippets: Array.isArray(parsed.codeSnippets) ? parsed.codeSnippets : [],
        codeQuality: typeof parsed.codeQuality === 'string' ? parsed.codeQuality : '',
        commonMistakes: Array.isArray(parsed.commonMistakes) ? parsed.commonMistakes : []
      };
    }

    return _defaultResult();
  } catch (_) {
    return _defaultResult();
  }
}

export { extractKnowledgeFromSession };

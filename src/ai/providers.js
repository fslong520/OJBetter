/**
 * AI 提示生成器 - 渐进式提示 + 流式输出 + 翻译
 */
import { ZEN_BASE_URL } from '../config/models.js';
import { getSettings } from '../storage/settings.js';
import { buildCoachPrompt, DEFAULT_PERSONA_KEY } from '../coach/personas.js';

// ==================== 通用提示 ====================
const KATEX_NOTE = `\n\n【⚠️渲染提示】题目内容中可能包含因 LaTeX/KaTeX 渲染导致的文本重复现象（例如同一个公式或文字出现了两次）。请自动识别并忽略这类重复内容，将其合并为一份进行理解，不要将其误认为是题目有两个不同的条件。`;

// 通用后备提示词（避免异步加载问题）
const COACH_PROMPT = buildCoachPrompt(DEFAULT_PERSONA_KEY) + KATEX_NOTE;

const HINT_PROMPTS = {
  1: `你是"小智"，一位耐心亲切的信奥赛教练（面向8-16岁学生）。

用户会发送一段包含编程题目的 HTML 源码。请从中提取题目信息，然后按以下格式输出 Markdown：

## 题目类型
一句话指出这道题属于什么类型

## 生活中的类比
用一个孩子能理解的生活例子解释题目在问什么

## 思考一下
提一个引导性问题，帮学生自己想出下一步

**严禁：** 给出任何代码、伪代码、流程图、具体算法步骤。200字内。` + KATEX_NOTE,

  2: `你是"小智"，一位耐心亲切的信奥赛教练（面向8-16岁学生）。

用户会发送一段包含编程题目的 HTML 源码。请从中提取题目信息，然后按以下格式输出 Markdown：

## 解题步骤
用简短的语言描述解决思路，分条列出关键步骤

## 流程图
用 ASCII 字符画一个简单流程图，放在 \`\`\` 代码块中

## 相关知识点
只列出涉及的算法/数据结构名称，不展开

## 试一试
提一个引导性问题

**严禁：** 给出任何代码、伪代码。400字内。` + KATEX_NOTE,

  3: `你是"小智"，一位耐心亲切的信奥赛教练（面向8-16岁学生）。

用户会发送一段包含编程题目的 HTML 源码。请从中提取题目信息，然后按以下格式输出 Markdown：

## 思路分解
按步骤详细拆解解题思路（分步骤列出，每步编号）

## 伪代码
用中文伪代码描述算法流程，放在 \`\`\` 代码块中

## 易错点
列出 2-3 个常见的边界条件或容易出错的地方

## 动手试试
鼓励学生自己写代码，给一个测试用例验证

**严禁：** 给出任何编程语言的实际代码。500字内。` + KATEX_NOTE,

  '-1': `你是一个 HTML 转 Markdown 转换器。用户会发送一段包含编程题目的 HTML。

请提取题目文字并输出为结构清晰的 Markdown，保留：
- 题目描述、输入输出格式、示例输入输出
- 约束条件
- 所有数学公式转成 LaTeX 格式（如 $A \\neq B$）
- 代码块用 \`\`\` 包裹

要求：只输出 Markdown，不要解释。`
};

class HintGenerator {
  async getConfig() {
    const settings = await getSettings();
    if (settings.modelMode === 'custom') {
      return {
        baseURL: settings.customBaseURL || 'https://api.example.com/v1',
        model: settings.customModel || 'gpt-4o-mini',
        apiKey: settings.customApiKey || ''
      };
    }
    return {
      baseURL: ZEN_BASE_URL,
      model: settings.freeModel || 'big-pickle',
      apiKey: settings.zenApiKey || ''
    };
  }

  // ==================== 教练多轮对话 ====================
  async coachChat(problemText, chatHistory, onThinking, onContent, onDone, onError) {
    try {
      const config = await this.getConfig();
      const settings = await getSettings();
      const personaKey = settings.coachStyle || DEFAULT_PERSONA_KEY;
      const prompt = buildCoachPrompt(personaKey) + KATEX_NOTE;
      // 清理 HTML，只保留纯文本，避免干扰 AI 上下文
      const cleanText = String(problemText).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: `## 题目\n${cleanText.slice(0, 4000)}` }
      ];
      for (const msg of (chatHistory || [])) {
        messages.push({ role: msg.role, content: String(msg.content).slice(0, 4000) });
      }
      await this._streamRequest(config, messages, onThinking, onContent, onDone, onError, 0.3, 32768);
    } catch (e) { onError(e); }
  }

  // ==================== 流式提示 ====================
  async generateHintStream(problemText, hintLevel, previousHints, onThinking, onContent, onDone, onError) {
    try {
      const config = await this.getConfig();
      const systemPrompt = HINT_PROMPTS[hintLevel] || HINT_PROMPTS[hintLevel === -1 ? '-1' : 2];
      // 清理 HTML，只保留纯文本
      const cleanText = String(problemText).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const messages = [{ role: 'system', content: systemPrompt }];

      if (previousHints.length > 0) {
        messages.push({ role: 'user', content: `题目：${cleanText.slice(0, 6000)}` });
        for (const hint of previousHints) {
          messages.push({ role: 'assistant', content: `[上一轮提示]\n${hint}` });
        }
        messages.push({ role: 'user', content: '还是不太明白，请给我更深一层的提示。' });
      } else {
        messages.push({ role: 'user', content: `题目：${cleanText.slice(0, 6000)}` });
      }

      await this._streamRequest(config, messages, onThinking, onContent, onDone, onError, 0.3, 32768);
    } catch (e) { onError(e); }
  }

  // ==================== 流式翻译 ====================
  async translateStream(problemText, onThinking, onContent, onDone, onError) {
    try {
      const config = await this.getConfig();
      const systemPrompt = `你是一个翻译引擎。用户会发送一段包含编程题目的文本。
请按以下规则处理：
1. 提取其中的题目文字（标题、描述、输入输出格式、样例等）
2. 将题目文字翻译成简体中文，输出为干净的 Markdown 格式
3. 保持编程术语准确（array→数组, loop→循环, input→输入, output→输出）
4. 保持所有约束条件、输入输出格式、样例数据不变
 5. 如果已经是中文则原样返回
 6. ⚠️严格只输出翻译后的题目内容！不要添加任何解释、分析、解题思路、标注（如📋🔍等）、点评或额外说明。即使题目简单，只翻译不废话。
7. ⚠️注意：文本中可能因 LaTeX/KaTeX 渲染导致重复（如公式出现两次），请在输出时去重
8. ⚠️注意：所有【输入格式、输出格式、输入样例、输出样例】的内容必须用 \`\`\` 代码块包裹

输出格式示例：
# 题目名称
## 题目描述
...
## 输入格式
\`\`\`
...
\`\`\`
## 输出格式
\`\`\`
...
\`\`\`
## 样例

### 样例输入
\`\`\`
...
\`\`\`
### 样例输出
\`\`\`
...
\`\`\``;

      const cleanHTML = (text) => typeof text === 'string' ? text.replace(/<[^>]+>/g, '') : text;

      // 翻译模式也传入清洗后的纯文本，节省 token
      const cleanInput = cleanHTML(String(problemText)).replace(/\s+/g, ' ').trim().slice(0, 8000);
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: cleanInput }
      ];

      // 包装回调，过滤HTML残留 + 检测取消
      let cancelled = false;
      const wrappedOnContent = (text) => { if (!cancelled) onContent(cleanHTML(text)); };
      const wrappedOnDone = (full) => { if (!cancelled) onDone(cleanHTML(full)); };
      const wrappedOnError = (e) => { if (!cancelled) onError(e); };

      await this._streamRequest(config, messages, onThinking, wrappedOnContent, wrappedOnDone, wrappedOnError, 0.1, 32768, () => cancelled);
    } catch (e) { onError(e); }
  }

  async _streamRequest(config, messages, onThinking, onContent, onDone, onError, temperature = 0.3, maxTokens = 32768, getCancelled) {
    const url = `${config.baseURL}/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 1800000); // 30 分钟，兼容长思考模型
    try {
      const response = await fetch(url, {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ model: config.model, messages, temperature, max_tokens: maxTokens, stream: true })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
      }

      // 检测非SSE响应（如验证码页面）
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream') && !contentType.includes('application/json')) {
        const text = await response.text().catch(() => '');
        if (text.includes('captcha') || text.includes('验证码') || text.includes('<html')) {
          throw new Error('API 服务触发了人机验证，请稍后重试或使用自定义API');
        }
        throw new Error('API 返回了非预期响应格式');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = '', buf = '';

      // 读取超时：如果 1800 秒（30分钟）没有收到任何数据，终止流
      // 带思考的模型（如 o1）思考时间可能很长，给予充足时间
      let readTimeout = null;
      const resetReadTimeout = () => {
        clearTimeout(readTimeout);
        readTimeout = setTimeout(() => {
          controller.abort();
        }, 1800000);
      };
      resetReadTimeout();

      while (true) {
        if (getCancelled && getCancelled()) break;
        const { done, value } = await reader.read(); if (done) break;
        resetReadTimeout();
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim(); if (d === '[DONE]') continue;
          try {
            const j = JSON.parse(d); const delta = j.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.reasoning_content || delta.reasoning) onThinking(delta.reasoning_content || delta.reasoning);
            if (delta.content) { full += delta.content; onContent(delta.content); }
          } catch (_) {}
        }
      }
      clearTimeout(readTimeout);
      onDone(full);
    } catch (e) {
      if (e.name === 'AbortError') onError(new Error('请求超时，请重试'));
      else if (e.message?.includes('CORS') || e.message?.includes('address space') || e.message?.includes('blocked')) {
        onError(new Error('网络策略拦截，请打开设置切换到自定义API'));
      }
      else onError(e);
    } finally {
      clearTimeout(fetchTimeout);
    }
  }
}

const hintGenerator = new HintGenerator();
export { hintGenerator, HintGenerator, HINT_PROMPTS, COACH_PROMPT };

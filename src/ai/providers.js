/**
 * AI 提示生成器 - 渐进式提示 + 流式输出 + 翻译
 */
import { ZEN_BASE_URL } from '../config/models.js';
import { getSettings } from '../storage/settings.js';

const HINT_PROMPTS = {
  1: `你是"小智"，一位耐心亲切的信奥赛教练（面向8-16岁学生）。

用户会发送一段包含编程题目的 HTML 源码。请从中提取题目信息，然后按以下格式输出 Markdown：

## 题目类型
一句话指出这道题属于什么类型

## 生活中的类比
用一个孩子能理解的生活例子解释题目在问什么

## 思考一下
提一个引导性问题，帮学生自己想出下一步

**严禁：** 给出任何代码、伪代码、流程图、具体算法步骤。200字内。`,

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

**严禁：** 给出任何代码、伪代码。400字内。`,

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

**严禁：** 给出任何编程语言的实际代码。500字内。`,

  '-1': `你是一个 HTML 转 Markdown 转换器。用户会发送一段包含编程题目的 HTML。

请提取题目文字并输出为结构清晰的 Markdown，保留：
- 题目描述、输入输出格式、示例输入输出
- 约束条件
- 所有数学公式转成 LaTeX 格式（如 $A \\neq B$）
- 代码块用 \`\`\` 包裹

要求：只输出 Markdown，不要解释。`
};

const COACH_PROMPT = `你是"小智"，一位耐心亲切的信奥赛教练。你给学生提示时非常克制，每次只给一点点方向。

【阶段0 - 理解题意】
首次对话 → 只问一句："先说说看，这道题在问什么？"
→ 学生描述后判断理解是否正确（80%以上通过）。
→ 不够准 → 只指出一个关键词引导重想："题目里提到了[关键词]，你再看看它是什么意思？"
→ 基本正确 → 简单肯定（"对"），进入阶段1。

【阶段1 - 灵光乍现】🔍
→ 给简短的方向提示（一句话，20字以内），如：
  "想想条件判断的关系" / "试试模拟每一步" / "先找找规律"
→ 只问："你有想法了吗？"
→ 标注 🔍

【阶段2 - 画出思路】📋
→ 学生描述了算法步骤且基本正确后 → 给出ASCII流程图（放在\`\`\`代码块中），标注关键步骤。
→ 标注 📋
→ 学生贴代码但逻辑错误 → 不进入阶段3，用一句话指出方向继续在阶段2引导。

【阶段3 - 落笔成文】📝
→ 学生代码逻辑正确后 → 给出伪代码（\`\`\`代码块）和 1-2 个易错点。
→ 标注 📝

规则：
- 提示越简短越好，每轮只给一点点方向，把思考空间留给学生。
- 禁止给实际编程语言代码。伪代码用中文描述。
- 只回答和当前题目相关的问题。无关问题回："先搞定这道题~你刚才说到哪儿了？"
- 每次回复不超过 200 字。`;

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
      const messages = [
        { role: 'system', content: COACH_PROMPT },
        { role: 'user', content: `## 当前题目\n${String(problemText).slice(0, 8000)}` }
      ];
      for (const msg of (chatHistory || [])) {
        messages.push({ role: msg.role, content: String(msg.content).slice(0, 4000) });
      }
      await this._streamRequest(config, messages, onThinking, onContent, onDone, onError, 0.7, 2048);
    } catch (e) { onError(e); }
  }

  // ==================== 流式提示 ====================
  async generateHintStream(problemText, hintLevel, previousHints, onThinking, onContent, onDone, onError) {
    try {
      const config = await this.getConfig();
      const systemPrompt = HINT_PROMPTS[hintLevel] || HINT_PROMPTS[hintLevel === -1 ? '-1' : 2];
      const messages = [{ role: 'system', content: systemPrompt }];

      if (previousHints.length > 0) {
        messages.push({ role: 'user', content: `题目HTML：${String(problemText).slice(0, 10000)}` });
        for (const hint of previousHints) {
          messages.push({ role: 'assistant', content: `[上一轮提示]\n${hint}` });
        }
        messages.push({ role: 'user', content: '还是不太明白，请给我更深一层的提示。' });
      } else {
        messages.push({ role: 'user', content: `题目HTML：${String(problemText).slice(0, 10000)}` });
      }

      await this._streamRequest(config, messages, onThinking, onContent, onDone, onError);
    } catch (e) { onError(e); }
  }

  // ==================== 流式翻译 ====================
  async translateStream(problemText, onThinking, onContent, onDone, onError) {
    try {
      const config = await this.getConfig();
      const systemPrompt = `你是一个翻译引擎。用户会发送一段包含编程题目的 HTML 源码。
请按以下规则处理：
1. 提取其中的题目文字（标题、描述、输入输出格式、样例等）
2. 完全移除所有HTML标签（<span>、<div>、<p>、<var>、<math>等），只保留纯文本
3. 将题目文字翻译成简体中文，输出为干净的 Markdown 格式
4. 保持编程术语准确（array→数组, loop→循环, input→输入, output→输出）
5. 保持所有约束条件、输入输出格式、样例数据不变
6. 如果已经是中文则原样返回
7. 只输出翻译后的题目内容，不要任何解释或额外说明

输出格式示例：
# 题目名称
## 题目描述
...
## 输入格式
...
## 输出格式
...
## 样例
...`;

      const cleanHTML = (text) => typeof text === 'string' ? text.replace(/<[^>]+>/g, '') : text;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: String(problemText).slice(0, 10000) }
      ];

      // 包装回调，过滤HTML残留 + 检测取消
      let cancelled = false;
      const wrappedOnContent = (text) => { if (!cancelled) onContent(cleanHTML(text)); };
      const wrappedOnDone = (full) => { if (!cancelled) onDone(cleanHTML(full)); };
      const wrappedOnError = (e) => { if (!cancelled) onError(e); };

      await this._streamRequest(config, messages, onThinking, wrappedOnContent, wrappedOnDone, wrappedOnError, 0.1, 2048, () => cancelled);
    } catch (e) { onError(e); }
  }

  async _streamRequest(config, messages, onThinking, onContent, onDone, onError, temperature = 0.7, maxTokens = 4096, getCancelled) {
    const url = `${config.baseURL}/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);
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

      while (true) {
        if (getCancelled && getCancelled()) break;
        const { done, value } = await reader.read(); if (done) break;
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
      onDone(full);
    } catch (e) {
      if (e.name === 'AbortError') onError(new Error('请求超时（5分钟），请重试'));
      else onError(e);
    } finally {
      clearTimeout(timeout);
    }
  }
}

const hintGenerator = new HintGenerator();
export { hintGenerator, HintGenerator, HINT_PROMPTS, COACH_PROMPT };

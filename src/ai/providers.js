/**
 * AI 提示生成器 - 渐进式提示 + 流式输出 + 翻译
 */
import { ZEN_BASE_URL } from '../config/models.js';
import { getSettings } from '../storage/settings.js';
import { buildCoachPrompt, DEFAULT_PERSONA_KEY, getPersona, getHardenedPersona, getStageStrategy } from '../coach/personas.js';
import { streamChatCompletion } from '../lib/stream-fetcher.js';

// ==================== 通用提示 ====================
const KATEX_NOTE = `\n\n【⚠️渲染提示】题目内容中可能包含因 LaTeX/KaTeX 渲染导致的文本重复现象（例如同一个公式或文字出现了两次）。请自动识别并忽略这类重复内容，将其合并为一份进行理解，不要将其误认为是题目有两个不同的条件。`;

// ==================== 代码检测：判断学生是否提交了代码 ====================
function isCodeSubmission(text) {
  if (!text || typeof text !== 'string') return false;
  const codePatterns = [
    /#include\s*<\w+>/,     // C++ include
    /int\s+main\s*\(/,      // C++ main 函数
    /cout\s*<</,             // C++ 输出
    /cin\s*>>/,              // C++ 输入
    /scanf\s*\(/,            // C 输入
    /printf\s*\(/,           // C 输出
    /def\s+\w+\s*\(/,       // Python 函数
    /import\s+\w+/,          // Python import
    /function\s+\w+\s*\(/,  // JS 函数
    /console\.log\s*\(/,     // JS 输出
    /{[\s\S]*}/,            // 代码块（含大括号）
    /^\s*[\w]+\s+[\w]+\s*[;=]/m  // 变量定义（简单判断）
  ];
  return codePatterns.some(re => re.test(text));
}

// ==================== 调试模式专用提示词 ====================
const DEBUG_COACH_PROMPT = `你是"小智"，一位耐心温和的信奥赛教练，专门帮学生调试代码。

你的核心任务不是替学生找到 bug，而是教他们【自己找到 bug 的方法】。

## 你必须做到的（每轮至少落实一条）：
1. **指具体代码行**：不只说"看看条件判断"，要说"看看第 8 行的 if(a>b)，如果输入 5 3 2，它会进入哪个分支？"
2. **引导加输出语句**：不只说"检查一下变量的值"，要说"在第 12 行后面加一句 cout << a << endl;，看看程序运行到这时 a 的值是多少？"
3. **给具体样例**：不只说"试试边界情况"，要说"试试输入 1 1 1——三个数相等，你的代码会输出什么？"
4. **对比预期和实际**："你觉得输入 5 3 2 应该输出什么？你实际输出了什么？差在哪？"
5. **鼓励具体化**：每次学生修改后，肯定其进步："这里改对了！""比刚才好多了！"
6. **禁止问题意**：绝不许问"先说说看这道题在问什么？"
7. **禁止给完整代码**：绝不给出修改后的完整函数，只给方向性提示。
8. **只答代码相关问题**：不聊无关话题。

## 你说话的节奏（重要）：
第一句 → 结合代码具体表现夸奖（"看得出来你认真写了！"）
第二句 → 指出第 X 行，引导添加 cout/print 或给具体样例
第三句 → 问一个具体问题，让学生验证
不要超过三句。

## 好 vs 不好的示例：
✅ 好（给完整测试数据+预期）：
  "代码框架是对的。先用这个数据测试一下：
  ┌─ 测试数据 ──────────────
  │ 5 10
  │ 3 5 0
  │ 2 3 1
  │ 4 6 1
  └───────────────────────
  然后在第 15 行的循环里加一句 cout << j << ' ' << dp[j] << endl;，运行后看看 dp 数组的值和你手算的一致吗？"

✅ 好（指向变量+建议cout位置）：
  "思路没问题。在第 12 行后面加一句 cout << w[i] << ' ' << v[i] << endl;，然后输入：
  ┌─ 测试数据 ──────────────
  │ 3 8
  │ 2 3 0
  │ 1 2 0
  │ 3 4 0
  └───────────────────────
  看看每个物品的重量和价值是不是正确读入了？"

❌ 不好："看看你的条件判断。"
❌ 不好："检查一下变量。"
❌ 不好："试试边界情况。"
❌ 不好："在第 8 行的 if 后面加一句 cout << a << endl;，然后输入 1 2 3 看看。"（缺少完整测试数据，孩子不知道要输入什么）

${KATEX_NOTE}`;

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

## 引导写代码
给出一个引导性问题，引导学生开始写代码（如："你打算怎么处理输入？"）

## 易错点
列出 2-3 个常见的边界条件或容易出错的地方

## 调试建议
给学生一些自主测试的建议（如：如何设计测试用例验证）

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
    // 基础配置（AI 参数）
    const baseConfig = {
      enableThinking: settings.enableThinking !== false, // 默认开启
      temperature: settings.temperature ?? 0.1,
      maxTokens: settings.maxTokens || 32768,
      topP: settings.topP || 1.0,
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

  // ==================== 教练多轮对话 ====================
  async coachChat(problemText, chatHistory, attachments = [], onThinking, onContent, onDone, onError, stage) {
    try {
      const config = await this.getConfig();
      const settings = await getSettings();
      
      // 检测学生最新消息是否含代码，决定使用哪种提示词
      const latestStudentMsg = [...(chatHistory || [])].reverse().find(m => m.role === 'user');
      const hasCode = latestStudentMsg ? isCodeSubmission(latestStudentMsg.content) : false;
      
      const personaKey = settings.coachStyle || DEFAULT_PERSONA_KEY;
      let systemPrompt;
      if (hasCode) {
        // 提交代码：调试专用提示词，但前置 persona 确保风格一致
        systemPrompt = getPersona(personaKey) + '\n\n调试核心规则：\n' + DEBUG_COACH_PROMPT;
      } else {
        if (stage !== undefined) {
          // 阶段模式：策略 + 风格（persona 置后保 recency effect）
          systemPrompt = getStageStrategy(stage) + '\n\n' + getHardenedPersona(personaKey) + '\n\n' + KATEX_NOTE;
        } else {
          // 传统模式：全量策略
          systemPrompt = buildCoachPrompt(personaKey) + KATEX_NOTE;
        }
      }
      
      // 解码 HTML 实体，再清理标签
      const decodeEntities = (text) => {
        const el = typeof document !== 'undefined' ? document.createElement('textarea') : null;
        if (el) {
          el.innerHTML = text;
          return el.value;
        }
        // Fallback for non-browser environments
        return text
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
      };
      const cleanText = decodeEntities(String(problemText)).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const messages = [
        { role: 'system', content: systemPrompt }
      ];
      
      // 若有题目，先放题目（仅首次或未提交代码时）
      if (!hasCode && cleanText) {
        messages.push({ role: 'user', content: `## 题目\n${cleanText.slice(0, 4000)}` });
      }
      
      // 加入历史对话
      for (const msg of (chatHistory || [])) {
        const content = Array.isArray(msg.content) ? msg.content : String(msg.content).slice(0, 4000);
        messages.push({ role: msg.role, content });
      }
      
      // 处理附件：将最后一条 user 消息转为 content array
      if (attachments && attachments.length > 0) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            const originalContent = messages[i].content;
            const textContent = typeof originalContent === 'string' ? originalContent : '';
            messages[i].content = [
              { type: 'text', text: textContent },
              ...attachments.map(att => ({
                type: 'image_url',
                image_url: { url: att.data }
              }))
            ];
            break;
          }
        }
      }
      
      await this._streamRequest(config, messages, onThinking, onContent, onDone, onError);
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

      await this._streamRequest(config, messages, onThinking, onContent, onDone, onError);
    } catch (e) { onError(e); }
  }

  // ==================== 流式翻译 ====================
  async translateStream(problemText, attachments = [], onThinking, onContent, onDone, onError) {
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
      let userContent = cleanInput;
      if (attachments && attachments.length > 0) {
        userContent = [
          { type: 'text', text: cleanInput },
          ...attachments.map(att => ({
            type: 'image_url',
            image_url: { url: att.data }
          }))
        ];
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ];

      // 包装回调，过滤HTML残留 + 检测取消
      let cancelled = false;
      const wrappedOnContent = (text) => { if (!cancelled) onContent(cleanHTML(text)); };
      const wrappedOnDone = (full) => { if (!cancelled) onDone(cleanHTML(full)); };
      const wrappedOnError = (e) => { if (!cancelled) onError(e); };

      await this._streamRequest(config, messages, onThinking, wrappedOnContent, wrappedOnDone, wrappedOnError, () => cancelled);
    } catch (e) { onError(e); }
  }

  async _streamRequest(config, messages, onThinking, onContent, onDone, onError, getCancelled) {
    await streamChatCompletion(config, messages, { onThinking, onContent, onDone, onError, getCancelled });
  }

  // ==================== 学习报告分析（非流式） ====================
  async analyzeReport(problemText, chatHistory) {
    const config = await this.getConfig();
    const cleanText = String(problemText || '')
      .replace(/<[^>]+>/g, '').trim().slice(0, 4000);
    const systemPrompt = `你是一位信奥赛教学分析师。分析以下 OJ 题目和学生与 AI 教练的对话记录，生成一份结构化的学习分析报告。要求：

## 涉及知识点
列出这道题涉及的核心算法和数据结构

## 学习情况分析
- 学生的理解程度：优秀/良好/一般/薄弱
- 学生表现出的优势和不足
- 关键的学习突破点（如果有）

## 薄弱环节
- 学生容易出错或理解不充分的地方

## 练习建议
- 针对薄弱环节推荐 2-3 个练习方向

请用中文回答，保持客观专业，语气鼓励但不夸大。不要编造不存在的信息。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `## 题目\n${cleanText || '（未提供）'}` }
    ];

    if (chatHistory && chatHistory.length > 0) {
      const convText = chatHistory.map(m =>
        `${m.role === 'user' ? '学生' : '教练'}: ${String(m.content || '').slice(0, 1000)}`
      ).join('\n\n---\n\n');
      messages.push({ role: 'user', content: `## 对话记录\n${convText}` });
    }

    // 直接非流式 fetch，避免 SSE/流式解析的兼容问题
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
      temperature: 0.1,
      max_tokens: config.maxTokens || 32768
    };
    if (config.topP !== undefined && config.topP < 1.0) body.top_p = config.topP;

    try {
      const response = await fetch(url, {
        method: 'POST', headers, body: JSON.stringify(body)
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (e) {
      console.error('[OJBetter Analyze Error]', e);
      throw e;
    }
  }
}

const hintGenerator = new HintGenerator();
export { hintGenerator, HintGenerator, HINT_PROMPTS };

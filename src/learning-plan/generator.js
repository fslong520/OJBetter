/**
 * 学习计划生成器 - 流式输出，专注明天做什么 + 题单
 */
import { getAllHistory, extractTopic } from '../storage/history.js';
import { getSettings } from '../storage/settings.js';
import { ZEN_BASE_URL } from '../config/models.js';
import { buildCoachPrompt, DEFAULT_PERSONA_KEY } from '../coach/personas.js';

class LearningPlanGenerator {
  async analyzeHistory() {
    const history = await getAllHistory();
    if (history.length === 0) return null;
    const topicCount = {};
    const topicHintLevels = {};
    history.forEach(entry => {
      const topic = entry.topic || extractTopic(entry.question || '');
      topicCount[topic] = (topicCount[topic] || 0) + 1;
      if (!topicHintLevels[topic]) topicHintLevels[topic] = [];
      topicHintLevels[topic].push(entry.hintLevel || 2);
    });
    const weakTopics = [];
    for (const [topic, levels] of Object.entries(topicHintLevels)) {
      const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;
      weakTopics.push({
        topic,
        count: topicCount[topic],
        avgHintLevel: Math.round(avgLevel * 10) / 10,
        weakness: avgLevel > 2.5 ? 'high' : avgLevel > 2 ? 'medium' : 'low'
      });
    }
    weakTopics.sort((a, b) => b.avgHintLevel - a.avgHintLevel);
    return {
      totalQuestions: history.length,
      weakTopics,
      mostAskedTopics: Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t)
    };
  }

  /**
   * 流式生成明天的学习计划
   * @param {Array} currentChatHistory 当前对话
   * @param {string} currentProblemText 当前题目
   * @param {Function} onThinking 思考回调
   * @param {Function} onContent 内容回调
   * @param {Function} onDone 完成回调
   * @param {Function} onError 错误回调
   */
  async streamPlan(currentChatHistory, currentProblemText, onThinking, onContent, onDone, onError) {
    const analysis = await this.analyzeHistory();

    // 获取最近的10条有对话记录的题目
    const allHistory = await getAllHistory();
    const recentConversations = allHistory
      .filter(r => r.chatHistory && r.chatHistory.length > 0)
      .slice(0, 10);

    const recentChatText = recentConversations.length > 0
      ? recentConversations.map((c, i) =>
          `### 最近题目${i + 1}：《${c.question || '未知'}》\n` +
          c.chatHistory.map(m => `${m.role === 'user' ? '学生' : '小智'}：${String(m.content).slice(0, 600)}`).join('\n')
        ).join('\n\n')
      : '最近没有对话记录';

    const currentChatText = (currentChatHistory && currentChatHistory.length > 0)
      ? `### 当前对话：《${String(currentProblemText || '').slice(0, 100)}》\n` +
        currentChatHistory.map(m => `${m.role === 'user' ? '学生' : '小智'}：${String(m.content).slice(0, 600)}`).join('\n')
      : '当前没有进行中的对话';

    const historyText = analysis ? `
- 总提问次数：${analysis.totalQuestions}
- 薄弱知识点：${analysis.weakTopics.slice(0, 5).map(t => `${t.topic}（平均提示深度${t.avgHintLevel}）`).join('、') || '暂无'}
- 最常练习：${analysis.mostAskedTopics.slice(0, 3).join('、') || '暂无'}
` : '暂无历史记录';

    // 使用教练的系统prompt，确保输出不受限
    const settings = await getSettings();
    const personaKey = settings.coachStyle || DEFAULT_PERSONA_KEY;
    const systemPrompt = buildCoachPrompt(personaKey);

    const userPrompt = `请根据以下学习记录，为这位同学制定**明天**的学习计划。

## 历史学习分析
${historyText}

## 最近10道题的对话记录
${recentChatText}

## 当前进行中的对话
${currentChatText}

## 要求
1. 只规划**明天**的学习内容，不要多天计划
2. 必须包含具体的**题单**（3-5道题，说明题目类型或知识点）
3. 先分析学生当前状态（在思考区输出），再给出计划
4. 输出格式如下（直接输出，不要JSON）：

### 学习状态分析
（简要分析学生当前在哪个阶段、哪些知识点需要加强）

### 明天计划
**重点：**[最薄弱的知识点]

**题单：**
1. [题目类型/知识点] 具体描述或建议（如：洛谷 P1001 或 数组模拟题）
2. [题目类型/知识点] 具体描述或建议
3. [题目类型/知识点] 具体描述或建议

**建议：**
- [具体建议1]
- [具体建议2]

注意：题单要具体，最好能让学生知道去哪里找这些题（如洛谷、Codeforces、AtCoder等）。`;

    try {
      const config = await this.getConfig();
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      await this._streamRequest(config, messages, onThinking, onContent, onDone, onError);
    } catch (e) {
      onError(e);
    }
  }

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

  async _streamRequest(config, messages, onThinking, onContent, onDone, onError) {
    const url = `${config.baseURL}/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 1800000);

    try {
      const response = await fetch(url, {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ model: config.model, messages, temperature: 0.7, max_tokens: 32768, stream: true })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = '', buf = '';
      let readTimeout = null;

      const resetReadTimeout = () => {
        clearTimeout(readTimeout);
        readTimeout = setTimeout(() => controller.abort(), 1800000);
      };
      resetReadTimeout();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetReadTimeout();
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim();
          if (d === '[DONE]') continue;
          try {
            const j = JSON.parse(d);
            const delta = j.choices?.[0]?.delta;
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
      else onError(e);
    } finally {
      clearTimeout(fetchTimeout);
    }
  }
}

const learningPlanGenerator = new LearningPlanGenerator();
export { learningPlanGenerator, LearningPlanGenerator };

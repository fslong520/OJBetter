/**
 * 学习计划生成器 - 流式输出，专注明天做什么 + 题单
 */
import { getAllHistory, extractTopic } from '../storage/history.js';
import { getSettings } from '../storage/settings.js';
import { ZEN_BASE_URL } from '../config/models.js';
import { getUnifiedCoachPrompt, DEFAULT_PERSONA_KEY } from '../coach/personas.js';
import { streamChatCompletion } from '../lib/stream-fetcher.js';
import { stageAnalyzer, getStageLabel } from './stage-analyzer.js';
import { getKnowledgeAggregates, getAllKnowledgeRecords } from '../storage/knowledgeGraph.js';

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

    const [aggregates, stageResult, allKgRecords] = await Promise.all([
      getKnowledgeAggregates().catch(() => null),
      stageAnalyzer.analyzeStage().catch(() => null),
      getAllKnowledgeRecords().catch(() => [])
    ]);

    const stageText = stageResult && !stageResult.insufficientData
      ? `
## 学习阶段分析
- 当前阶段：${getStageLabel(stageResult.currentStage)} (${stageResult.currentStage})
- 自信程度：${(stageResult.stageConfidence * 100).toFixed(0)}%
- 薄弱知识点：${(stageResult.weakPoints || []).join('、') || '暂无'}
- 掌握较好：${(stageResult.strongPoints || []).join('、') || '暂无'}
- 推荐难度范围：CF ${stageResult.recommendedRating?.[0] || 800} ~ ${stageResult.recommendedRating?.[1] || 1200}
- ${stageResult.summary || ''}`
      : '';

    const kgText = aggregates && aggregates.totalRecords > 0
      ? `\n## 知识图谱统计\n总记录：${aggregates.totalRecords} 条`
      : '';

    const codeKgRecords = (allKgRecords || [])
      .filter(r => r.codeSnippets && r.codeSnippets.length > 0)
      .slice(0, 3);

    let codeInsightText = '';
    if (codeKgRecords.length > 0) {
      codeInsightText = '\n## 学生代码质量观察\n' + codeKgRecords.map(r => {
        const parts = [];
        if (r.codeQuality) parts.push(`· 代码质量：${r.codeQuality}`);
        if (r.commonMistakes?.length) parts.push(`· 常见错误：${r.commonMistakes.join('、')}`);
        (r.codeSnippets || []).forEach(s => {
          parts.push(`· 写了${s.lineCount}行${s.language}代码：${s.summary}`);
        });
        return parts.join('\n');
      }).filter(Boolean).join('\n\n');
    }

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
    const systemPrompt = getUnifiedCoachPrompt(personaKey);

    const userPrompt = `请根据以下学习记录，为这位同学制定**明天**的学习推荐。

## 历史学习分析
${historyText}
${stageText}
${kgText}
${codeInsightText}
## 最近对话记录
${recentChatText}

## 当前对话
${currentChatText}

## 硬性输出格式（必须严格遵守）
你的输出必须分成两段，缺一不可：

### 📝 学习建议
2-3句话，分析学生薄弱知识点，指明明天改进方向。
这里**不要**包含任何题目——题目全部放在下方练习题区。

### ✏️ 练习题
列出 3-5 道具体题目，每道题必须包含 OJ 平台 + **精确题号**（如 P1048、1741A、abc283_d），
不可只写题目名或"一道洛谷的题"这种模糊描述。
格式：{OJ平台} {题号} {可选：题目名} — {知识点标签} (CF {难度分})

有效示例：
✏️ 练习题：
洛谷 P1048 采药 — DP/0-1背包 (CF 1200)
CF 1741A — 字符串 (CF 800)
AtCoder abc283_d — 栈 (CF 1000)

## 其他要求
1. 只规划**明天**的内容，不要多天计划
2. 练习题 3-5 道，难度分布合理，重点覆盖薄弱知识点
3. 不要推荐学生已做过的题目（参考历史记录）
4. 优先从洛谷、Codeforces、AtCoder 找题
5. 直接输出，不要 JSON，不要额外说明
6. 练习题必须写具体题号，不可模糊描述
7. 结合学生的代码质量观察，针对性地推荐能改进其编码习惯和常见错误的练习`;

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

  async _streamRequest(config, messages, onThinking, onContent, onDone, onError) {
    await streamChatCompletion(config, messages, { onThinking, onContent, onDone, onError });
  }
}

const learningPlanGenerator = new LearningPlanGenerator();
export { learningPlanGenerator, LearningPlanGenerator };

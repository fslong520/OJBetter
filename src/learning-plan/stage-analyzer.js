/**
 * 学习阶段分析器
 * 读取知识图谱聚合数据 → AI 非流式分析 → 缓存结果
 *
 * 被 generator.js 调用以增强学习计划推荐
 */
import { getKnowledgeAggregates, getKnowledgeStats, saveStageAnalysis, getStageAnalysis, getAllKnowledgeRecords } from '../storage/knowledgeGraph.js';
import { getSettings } from '../storage/settings.js';
import { ZEN_BASE_URL } from '../config/models.js';

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 小时
const MIN_RECORDS = 3;

/**
 * CF Rating → 中文阶段标签
 *
 * 800-1200:  入门级（语法、模拟、简单条件判断）
 * 1200-1600: 普及级（基础算法：枚举、排序、贪心、简单 DP）
 * 1600-2000: 提高级（进阶 DP、图论、数论、字符串）
 * 2000+:     省选/省队级（复杂数据结构、高级算法、思维题）
 *
 * @param {string} currentStage - "rating_{min}_{max}" 格式
 * @returns {string} 中文阶段名
 */
function getStageLabel(currentStage) {
  if (!currentStage || typeof currentStage !== 'string') return '未知';
  const match = currentStage.match(/rating_(\d+)_\d+/);
  if (!match) return '未知';
  const min = parseInt(match[1], 10);
  if (min >= 2000) return '省选级';
  if (min >= 1600) return '提高级';
  if (min >= 1200) return '普及级';
  return '入门级';
}

class StageAnalyzer {
  /**
   * 分析学生当前学习阶段
   * 缓存有效且 < 6 小时则直接返回，否则调 AI 分析
   *
   * @param {boolean} forceRefresh - 跳过缓存
   * @returns {Promise<Object>}
   */
  async analyzeStage(forceRefresh = false) {
    try {
      // 1. 缓存检查
      if (!forceRefresh) {
        const cached = await getStageAnalysis();
        if (cached && cached.analyzedAt && Date.now() - cached.analyzedAt < CACHE_TTL) {
          return cached;
        }
      }

      // 2. 加载数据
      const [aggregates, stats] = await Promise.all([
        getKnowledgeAggregates(),
        getKnowledgeStats()
      ]);

      // 3. 数据不足
      if (stats.totalRecords < MIN_RECORDS) {
        return {
          insufficientData: true,
          message: '再多练习几道题，我就能给你出推荐了✊',
          currentStage: null
        };
      }

      // 4. AI 分析
      const aiResult = await this._runAIAnalysis(stats, aggregates);

      // 5. 保存缓存
      const analysis = {
        ...aiResult,
        analyzedAt: Date.now(),
        stageLabel: getStageLabel(aiResult.currentStage)
      };
      await saveStageAnalysis(analysis);

      return analysis;
    } catch (e) {
      // 静默失败，返回默认值
      return {
        insufficientData: false,
        currentStage: null,
        stageConfidence: 0,
        weakPoints: [],
        strongPoints: [],
        recommendedRating: [800, 1200],
        summary: '',
        error: true
      };
    }
  }

  /**
   * 调用 AI 非流式接口分析知识数据
   * @param {Object} stats       - getKnowledgeStats() 返回值
   * @param {Object} aggregates  - getKnowledgeAggregates() 返回值
   * @returns {Promise<Object>}  解析后的 JSON 对象
   */
  async _runAIAnalysis(stats, aggregates) {
    const weakTopicsText = stats.weakestTopics.length > 0
      ? stats.weakestTopics.map(t => `- ${t.topic}（掌握度 ${(t.avgMastery * 100).toFixed(0)}%）`).join('\n')
      : '暂无数据';

    const strongTopicsText = stats.strongestTopics.length > 0
      ? stats.strongestTopics.map(t => `- ${t.topic}（掌握度 ${(t.avgMastery * 100).toFixed(0)}%）`).join('\n')
      : '暂无数据';

    const difficultyText = Object.entries(stats.recordsByDifficulty || {})
      .map(([range, count]) => `- ${range}: ${count}题`)
      .join('\n');

    // NEW: Load code analysis from records
    const allRecords = await getAllKnowledgeRecords();
    const codeRecords = allRecords.filter(r => r.codeSnippets && r.codeSnippets.length > 0).slice(0, 5);

    let codeAnalysisText = '暂无代码分析数据';
    if (codeRecords.length > 0) {
      codeAnalysisText = codeRecords.map(r => {
        const snippets = (r.codeSnippets || []).map(s =>
          `- [${s.language}] ${s.summary}${s.keyIssues?.length ? '，问题：' + s.keyIssues.join(', ') : ''}`
        ).join('\n');
        const quality = r.codeQuality ? `代码质量：${r.codeQuality}` : '';
        const mistakes = r.commonMistakes?.length ? `常见错误：${r.commonMistakes.join('、')}` : '';
        return `${snippets}\n${quality}\n${mistakes}`.trim();
      }).filter(Boolean).join('\n\n');
      if (!codeAnalysisText) codeAnalysisText = '暂无代码分析数据';
    }

    const systemPrompt = '你是一位信奥赛学习分析师。根据学生的学习数据，分析当前所处的竞赛阶段和薄弱环节。';

    const userPrompt = `## 学习数据

总做题数：${stats.totalRecords}
涉及知识点数：${stats.uniqueKnowledgePoints}
涉及算法标签数：${stats.uniqueTags}

## 知识点掌握度（按薄弱程度排序）
${weakTopicsText}

## 强项知识点
${strongTopicsText}

## 难度分布
${difficultyText}

## 代码质量分析
${codeAnalysisText}

## 要求
请分析学生当前所处的学习阶段，返回严格 JSON 格式（不要其他文字）：

{
  "currentStage": "rating_1200_1400",
  "stageConfidence": 0.85,
  "stageDescription": "2-3句中文分析：学生的优势、薄弱点、整体定位",
  "weakPoints": ["动态规划", "图论"],
  "strongPoints": ["模拟", "排序"],
  "recommendedRating": [1000, 1400],
  "summary": "一句总结"
}

说明：
- currentStage: 格式为 "rating_{min}_{max}"，如 "rating_800_1200"
- stageConfidence: 0-1，AI 对自己判断的自信程度
- weakPoints: 最薄弱的 2-3 个知识点名称
- strongPoints: 掌握最好的 2-3 个知识点名称
- recommendedRating: 推荐练习的 CF Rating 范围 [最小值, 最大值]
- summary: 精简的一句话阶段总结`;

    const config = await this._getConfig();
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const url = `${config.baseURL}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OJBetter/1.1.3 (Chrome Extension)'
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const body = {
      model: config.model,
      messages,
      stream: false,
      temperature: 0.1,
      max_tokens: 800
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    return this._parseAnalysis(content);
  }

  /**
   * 解析 AI 返回的 JSON 字符串
   * 尝试顺序：直接解析 → ```json 代码块 → {...} 正则提取 → 默认值
   * @param {string} content
   * @returns {Object}
   */
  _parseAnalysis(content) {
    try {
      return JSON.parse(content);
    } catch {
      try {
        const codeMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeMatch) {
          return JSON.parse(codeMatch[1].trim());
        }
      } catch {
        try {
          const objMatch = content.match(/\{[\s\S]*\}/);
          if (objMatch) {
            return JSON.parse(objMatch[0]);
          }
        } catch {
          // 全部失败，走默认值
        }
      }
    }

    return {
      currentStage: 'rating_800_1200',
      stageConfidence: 0.5,
      stageDescription: '',
      weakPoints: [],
      strongPoints: [],
      recommendedRating: [800, 1200],
      summary: ''
    };
  }

  /**
   * 获取 AI 配置
   * 与 HintGenerator.getConfig 相同模式，支持 free / custom 切换
   * @returns {Promise<Object>}
   */
  async _getConfig() {
    const settings = await getSettings();
    const baseConfig = {
      temperature: settings.temperature ?? 0.1,
      maxTokens: 800,
      topP: settings.topP ?? 1.0
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
}

const stageAnalyzer = new StageAnalyzer();

export { stageAnalyzer, StageAnalyzer, getStageLabel };

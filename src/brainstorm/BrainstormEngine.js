/**
 * 灵光一闪 - 头脑风暴引擎
 *
 * 独立于教练模式的状态机，管理头脑风暴对话、灵光标记、持久化。
 * AI 按需选用思考角度，无固定角色轮换。
 * 不继承 HintGenerator —— 状态逻辑完全不同。
 */

import { getUnifiedBrainstormPrompt } from './BrainstormPrompts.js';
import { getSettings } from '../storage/settings.js';
import { streamChatCompletion } from '../lib/stream-fetcher.js';

const STORAGE_PREFIX = 'brain_';

export class BrainstormEngine {
  constructor() {
    this.reset();
  }

  /** 重置所有状态 */
  reset() {
    this.sessionId = null;
    this.problemText = '';
    this.chatHistory = [];        // 独立于教练模式的对话历史
    this.status = 'idle';         // idle | ai_turn | student_turn | collecting
    this.sparkCount = 0;          // 已标记灵光数
    this.sparkCollection = [];    // 灵光合集
    this.totalRounds = 0;         // 总对话轮数
    this.streamId = null;         // 当前流 ID
    this.streamCleanup = null;    // 流清理函数
    this.onSparkCallback = null;  // 灵光标记回调
  }

  /** 判断是否有进行中的会话 */
  get isActive() {
    return this.status === 'ai_turn' || this.status === 'student_turn';
  }

  // ==================== 主要流程 ====================

  /**
   * 开始新的头脑风暴
   * @param {string} problemText 题目文本
   * @param {object} callbacks { onThinking, onContent, onDone, onError, onSpark }
   */
  async start(problemText, callbacks = {}) {
    this.reset();
    this.sessionId = 'brain_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    this.problemText = problemText;
    this.status = 'ai_turn';

    // 保存初始状态到 storage
    await this._saveState();

    // 生成开场白
    const systemPrompt = getUnifiedBrainstormPrompt();
    const userContext = `## 当前题目\n${problemText.slice(0, 4000)}\n\n请开始一场头脑风暴。先用 1-2 句话承接场景，然后抛出一个具体问题。`;

    this.chatHistory.push({ role: 'user', content: userContext });

    await this._streamRequest({
      systemPrompt,
      messages: [
        { role: 'user', content: userContext }
      ],
      ...callbacks
    });
  }

  /**
   * 继续已保存的头脑风暴（恢复会话）
   */
  async resume(savedState, callbacks = {}) {
    Object.assign(this, savedState);
    this.status = 'student_turn';
    this.streamId = null;
    this.streamCleanup = null;

    // 只恢复 chatHistory，不做新请求
    return this.chatHistory;
  }

  /**
   * 处理学生消息
   * @param {string} text 学生输入
   * @param {Array} attachments 附件（图片等）
   * @param {object} callbacks { onThinking, onContent, onDone, onError, onSpark }
   */
  async onStudentMessage(text, attachments, callbacks = {}) {
    if (this.status !== 'student_turn') return;

    // 记录学生消息
    const msg = { role: 'user', content: text };
    if (attachments && attachments.length > 0) {
      msg.attachments = attachments;
    }
    this.chatHistory.push(msg);
    this.totalRounds++;

    this.status = 'ai_turn';
    await this._saveState();

    // 构建系统提示词（统一提示词，无角色轮换）
    const systemPrompt = getUnifiedBrainstormPrompt();

    // 构建消息列表
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `## 当前题目\n${this.problemText.slice(0, 4000)}` }
    ];

    // 加入对话历史（取最近 10 轮上下文，避免超长）
    const recentHistory = this.chatHistory.slice(-20);
    for (const msg of recentHistory) {
      const content = typeof msg.content === 'string' ? msg.content.slice(0, 2000) : msg.content;
      messages.push({ role: msg.role, content });
    }

    this.onSparkCallback = callbacks.onSpark || null;

    await this._streamRequest({
      systemPrompt,
      messages,
      ...callbacks
    });
  }

  /**
   * 结束头脑风暴，生成灵光合集
   * @param {object} callbacks { onContent, onDone, onError }
   */
  async end(callbacks = {}) {
    this.status = 'collecting';

    // 生成合集内容
    let summary = '✨ 灵光一闪 · 今日合集\n\n';

    if (this.sparkCollection.length > 0) {
      summary += '💡 灵光记录：\n';
      this.sparkCollection.forEach((spark, i) => {
        summary += `  ${i + 1}. ${spark.text}\n`;
      });
    } else {
      summary += '💡 今天没有特别标记的灵光，但思考本身就是收获。\n';
    }

    // 生成拓展建议
    summary += '\n🌱 还可再想：\n';
    summary += '  • 试试换个角度，用刚想到的思路解另一道题\n';
    summary += '  • 把你在这轮风暴中想到的点写下来，形成自己的笔记\n';

    if (callbacks.onContent) callbacks.onContent(summary);
    if (callbacks.onDone) callbacks.onDone(summary);

    this.chatHistory.push({ role: 'assistant', content: summary, isSummary: true });

    // 保存最终状态
    this.status = 'idle';
    await this._saveState();

    if (callbacks.onDone) callbacks.onDone(summary);
  }

  // ==================== 流式请求（复用现有架构） ====================

  async _streamRequest({ systemPrompt, messages, onThinking, onContent, onDone, onError }) {
    try {
      const config = await this._getConfig();
      let fullText = '';
      let streamError = null;

      await streamChatCompletion(config, messages, {
        onThinking,
        onContent,
        onDone: (text) => {
          fullText = text;
          if (onDone) onDone(text);
        },
        onError: (e) => {
          streamError = e;
          if (onError) onError(e);
        }
      });

      if (streamError) {
        this.status = 'student_turn';
        return;
      }

      // 检查灵光触发
      const spark = this._detectSpark(fullText);

      // 记录 AI 回复
      const assistantMsg = { role: 'assistant', content: fullText };
      this.chatHistory.push(assistantMsg);

      // 保存状态
      await this._saveState();

      this.status = 'student_turn';
    } catch (e) {
      console.error('[Brainstorm Fetch Error]', e);
      this.status = 'student_turn';
      if (onError) onError(e);
    }
  }

  async _getConfig() {
    const settings = await getSettings();
    const baseConfig = {
      enableThinking: settings.enableThinking !== false,
      temperature: settings.temperature ?? 0.7,
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
      baseURL: 'https://opencode.ai/zen/v1',
      model: settings.freeModel || 'big-pickle',
      apiKey: settings.zenApiKey || ''
    };
  }

  // ==================== 灵光检测 ====================

  /**
   * 检测 AI 回复中是否包含值得标记的灵光
   * 简单策略：若回复长度 > 80 字且包含问号，且当前回合数满足条件
   * 真实场景应由 AI 自行判断，此处提供后备机制
   */
  _detectSpark(text) {
    if (!text || this.sparkCount >= 5) return null;

    // 由 prompt 中的指令控制 AI 自行追加灵光卡片
    // 后端检测：提取可能的 insight 句（句末句号且有实质内容）
    const lines = text.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (t.includes('💡') || t.includes('灵光一现')) {
        // AI 自主标记了灵光——直接从文本提取
        const sparkText = t.replace(/[┌─│└💡灵光一现]/g, '').trim();
        if (sparkText.length > 4) {
          const spark = {
            id: `spark_${Date.now()}_${this.sparkCount}`,
            text: sparkText,
            source: 'ai_response',
            timestamp: Date.now()
          };
          this.sparkCollection.push(spark);
          this.sparkCount++;
          if (this.onSparkCallback) this.onSparkCallback(spark);
          return spark;
        }
      }
    }
    return null;
  }

  // ==================== 持久化 ====================

  async _saveState() {
    if (!this.sessionId) return;
    const key = STORAGE_PREFIX + this.sessionId;
    const data = {
      sessionId: this.sessionId,
      problemText: this.problemText,
      chatHistory: this.chatHistory,
      status: this.status,
      sparkCount: this.sparkCount,
      sparkCollection: this.sparkCollection,
      totalRounds: this.totalRounds
    };
    try {
      await chrome.storage.local.set({ [key]: data });
    } catch (e) {
      console.warn('[Brainstorm] Save state failed', e);
    }
  }

  /**
   * 从 storage 加载保存的会话
   * @param {string} sessionId
   * @returns {object|null} saved state
   */
  static async loadState(sessionId) {
    if (!sessionId) return null;
    const key = STORAGE_PREFIX + sessionId;
    try {
      const result = await chrome.storage.local.get([key]);
      return result[key] || null;
    } catch (e) {
      console.warn('[Brainstorm] Load state failed', e);
      return null;
    }
  }

  /**
   * 查找最近的未完成头脑风暴会话
   * @returns {object|null} { sessionId, preview }
   */
  static async findRecentIncomplete() {
    try {
      const all = await chrome.storage.local.get(null);
      const brainKeys = Object.keys(all).filter(k => k.startsWith(STORAGE_PREFIX));
      if (brainKeys.length === 0) return null;

      // 找最新的
      let latest = null;
      let latestId = null;
      for (const key of brainKeys) {
        const state = all[key];
        if (state && (state.status === 'ai_turn' || state.status === 'student_turn')) {
          if (!latest || (state.sessionId > latest.sessionId)) {
            latest = state;
            latestId = key;
          }
        }
      }
      if (!latest) return null;

      // 提取预览文本
      const lastMsg = latest.chatHistory && latest.chatHistory.length > 0
        ? latest.chatHistory[latest.chatHistory.length - 1]
        : null;
      const preview = lastMsg
        ? (typeof lastMsg.content === 'string' ? lastMsg.content.slice(0, 60) : '')
        : '';

      return {
        sessionId: latest.sessionId,
        preview: preview || latest.problemText?.slice(0, 40) || '未命名会话'
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * 删除指定会话
   */
  static async deleteSession(sessionId) {
    if (!sessionId) return;
    const key = STORAGE_PREFIX + sessionId;
    try {
      await chrome.storage.local.remove(key);
    } catch (e) {
      console.warn('[Brainstorm] Delete session failed', e);
    }
  }
}

export default BrainstormEngine;

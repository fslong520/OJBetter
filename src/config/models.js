/**
 * API 配置
 * 免费模式：OpenCode Zen（openai 兼容 /chat/completions）
 * 自定义模式：任意 OpenAI 兼容接口
 */

const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

const DEFAULT_API_CONFIG = {
  modelMode: 'free',
  freeModel: 'big-pickle',
  zenApiKey: '',
  customBaseURL: '',
  customModel: '',
  customApiKey: '',
  cachedModels: [],
  // AI 高级参数
  enableThinking: true,    // 是否开启思考过程（部分模型支持）
  temperature: 0.3,        // 温度参数（0-1，越高越随机）
  maxTokens: 32768,         // 最大输出 token 数
  topP: 1.0                // Top-P 采样（可选）
};

export { DEFAULT_API_CONFIG, ZEN_BASE_URL };

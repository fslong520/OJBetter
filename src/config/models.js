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
  cachedModels: []
};

export { DEFAULT_API_CONFIG, ZEN_BASE_URL };

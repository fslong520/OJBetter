/**
 * OpenCode Zen 会话标识
 *
 * Zen 网关（https://opencode.ai/zen）要求所有请求携带 `x-opencode-session` 头
 * （UUID 格式）。缺失时网关返回 400 MissingSessionID：
 *   "Error from provider (Console): OpenCode's free tier can only be used in OpenCode"
 *
 * 该头只是会话标识、不是凭据，免费档匿名请求也接受（实测 2026-09）。
 * 每个 JS context（background / sidepanel / content）在首次加载本模块时
 * 生成一次，进程内恒定；跨 context 不同亦无碍。
 */

function generateSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // 兜底：crypto.randomUUID 不可用时拼一个 v4 形状的 UUID
  const hex = (n) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
}

const ZEN_SESSION_ID = generateSessionId();
const ZEN_SESSION_HEADER = { 'x-opencode-session': ZEN_SESSION_ID };

export { ZEN_SESSION_ID, ZEN_SESSION_HEADER };

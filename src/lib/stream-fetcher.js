/**
 * 流式 Chat Completion 获取器
 * 统一 SSE 流式解析，从 3 处重复实现提取为共享模块。
 *
 * 用法:
 *   import { streamChatCompletion } from '../lib/stream-fetcher.js';
 *   await streamChatCompletion(config, messages, {
 *     onThinking(text) {},
 *     onContent(text) {},
 *     onDone(fullText) {},
 *     onError(err) {},
 *     getCancelled() { return false; }  // 可选
 *   });
 *
 * config: { baseURL, model, apiKey, temperature, maxTokens, topP, enableThinking }
 * messages: [{ role, content }] 标准 OpenAI 消息格式
 * callbacks: { onThinking, onContent, onDone, onError, getCancelled }
 *   - getCancelled() 可选，每次迭代检查，返回 true 则提前终止
 *   - 所有回调均为可选
 */

const USER_AGENT = 'OJBetter/1.1.5 (Chrome Extension)';
const FETCH_TIMEOUT_MS = 1_800_000;  // 30 min
const READ_TIMEOUT_MS = 1_800_000;   // 30 min

/**
 * 流式调用 Chat Completion API，通过回调输出结果。
 * 内部处理所有错误，调用 onError 后不再抛出（回调可安全 await）。
 */
export async function streamChatCompletion(config, messages, callbacks = {}) {
  const { onThinking, onContent, onDone, onError, getCancelled } = callbacks;

  const url = `${config.baseURL}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const body = {
    model: config.model,
    messages,
    stream: true,
    temperature: config.temperature ?? 0.1,
    max_tokens: config.maxTokens || 32768
  };
  if (config.topP !== undefined && config.topP < 1.0) {
    body.top_p = config.topP;
  }

  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        err.error?.message ||
        `连接出问题了（${response.status}），检查一下设置里的 API 配置？`
      );
    }

    // 检测非 SSE 响应（如验证码页面 / HTML 页面）
    const contentType = response.headers.get('content-type') || '';
    if (
      !contentType.includes('text/event-stream') &&
      !contentType.includes('application/json')
    ) {
      const text = await response.text().catch(() => '');
      if (
        text.includes('captcha') ||
        text.includes('验证码') ||
        text.includes('<html')
      ) {
        throw new Error('小智被验证码拦住了，等一会儿再试试？');
      }
      throw new Error('小智收到了看不懂的回复，换个模型试试？');
    }

    if (!response.body) {
      throw new Error('小智没有收到回复，检查一下网络再试试');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buf = '';

    // 读取超时：长时间未收到数据时终止
    let readTimeout = null;
    const resetReadTimeout = () => {
      clearTimeout(readTimeout);
      readTimeout = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
    };
    resetReadTimeout();

    while (true) {
      if (getCancelled && getCancelled()) break;

      const { done, value } = await reader.read();
      if (done) break;

      resetReadTimeout();
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // 思考过程（仅当 enableThinking 未禁用时输出）
          if (
            config.enableThinking !== false &&
            (delta.reasoning_content || delta.reasoning)
          ) {
            if (onThinking) onThinking(delta.reasoning_content || delta.reasoning);
          }

          if (delta.content) {
            full += delta.content;
            if (onContent) onContent(delta.content);
          }
        } catch (_) {
          // 忽略无法解析的 SSE 行
        }
      }
    }

    clearTimeout(readTimeout);
    if (onDone) onDone(full);
  } catch (e) {
    console.error('[OJBetter Fetch Error]', {
      url,
      errorName: e.name,
      errorMessage: e.message,
      errorStack: e.stack
    });

    if (onError) {
      if (e.name === 'AbortError') {
        onError(new Error('小智想太久了，点一下重新试试吧'));
      } else if (
        e.message?.includes('CORS') ||
        e.message?.includes('address space') ||
        e.message?.includes('blocked')
      ) {
        onError(new Error('网络不通畅，去设置里换个连接方式试试？'));
      } else if (e.message === 'Failed to fetch') {
        onError(
          new Error(
            '暂时连不上小智的脑子，检查一下网络，或者去设置里换个方式连接'
          )
        );
      } else {
        onError(e);
      }
    }
  } finally {
    clearTimeout(fetchTimeout);
  }
}

/**
 * OJ Problem Link Generator
 * 解析自然语言文本中的 OJ 题目引用，生成可验证的题目链接。
 * 用于推荐题目的链接生成与可用性验证。
 *
 * 支持平台：洛谷 (luogu)、Codeforces (codeforces)、AtCoder (atcoder)
 */

// ==================== Platform Config ====================

const PLATFORM_CONFIG = {
  luogu: {
    name: '洛谷',
    aliases: ['luogu', '洛谷'],
    urlTemplate: (id) => `https://www.luogu.com.cn/problem/${id}`,
    idPattern: /^P\d+$/i,
    inferPattern: /P\d+/i,
    confidence: 0.8
  },
  codeforces: {
    name: 'Codeforces',
    aliases: ['codeforces', 'cf'],
    urlTemplate: (id) => {
      // id format: "1741A" → "1741/A"
      const match = id.match(/^(\d+)([A-Z][A-Za-z0-9]*)$/);
      if (!match) return null;
      return `https://codeforces.com/problemset/problem/${match[1]}/${match[2]}`;
    },
    idPattern: /^\d+[A-Z][A-Za-z0-9]*$/,
    inferPattern: /\d+[A-Z][A-Za-z0-9]*/,
    confidence: 0.7
  },
  atcoder: {
    name: 'AtCoder',
    aliases: ['atcoder', 'abc', 'arc', 'agc', 'ahc'],
    urlTemplate: (id) => {
      const match = id.match(/^(abc|arc|agc|ahc)(\d+)_([a-z])$/);
      if (!match) return null;
      return `https://atcoder.jp/contests/${match[1]}${match[2]}/tasks/${match[1]}${match[2]}_${match[3]}`;
    },
    idPattern: /^(abc|arc|agc|ahc)\d+_[a-z]$/,
    inferPattern: null, // handled specially
    confidence: 0.7
  }
};

// ==================== Parsing ====================

/**
 * 解析自然语言文本，提取 OJ 平台与题目 ID。
 * @param {string} text - 用户输入的自然语言文本
 * @returns {{ platform: string, id: string, confidence: number } | null}
 */
export function parseProblemId(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  // --- 1. 洛谷 ---
  // "洛谷 P1048 采药" / "Luogu P1048" / "P1048"
  const luoguExplicit = /(?:洛谷|luogu)\s*(P\d+)/i.exec(trimmed);
  if (luoguExplicit) {
    return { platform: 'luogu', id: luoguExplicit[1].toUpperCase(), confidence: 1.0 };
  }

  // --- 2. Codeforces ---
  // "Codeforces 1741A" / "CF 1741A"
  const cfExplicit = /(?:codeforces|cf)\s+(\d+[A-Z][A-Za-z0-9]*)/i.exec(trimmed);
  if (cfExplicit) {
    return { platform: 'codeforces', id: cfExplicit[1], confidence: 1.0 };
  }

  // --- 3. AtCoder ---
  // "AtCoder ABC 283 D" / "AtCoder abc283_d" / "ABC 283 D" / "abc283_d"

  // "AtCoder ABC 283 D" (spaced form)
  const atcoderSpaced = /(?:atcoder)\s+(abc|arc|agc|ahc)\s*(\d+)\s*([a-zA-Z])/i.exec(trimmed);
  if (atcoderSpaced) {
    const contest = atcoderSpaced[1].toLowerCase();
    const num = atcoderSpaced[2];
    const letter = atcoderSpaced[3].toLowerCase();
    return { platform: 'atcoder', id: `${contest}${num}_${letter}`, confidence: 1.0 };
  }

  // "AtCoder abc283_d" (compact form with underscore)
  const atcoderCompactExplicit = /(?:atcoder)\s+(abc|arc|agc|ahc)(\d+)_([a-z])/i.exec(trimmed);
  if (atcoderCompactExplicit) {
    const contest = atcoderCompactExplicit[1].toLowerCase();
    const num = atcoderCompactExplicit[2];
    const letter = atcoderCompactExplicit[3].toLowerCase();
    return { platform: 'atcoder', id: `${contest}${num}_${letter}`, confidence: 1.0 };
  }

  // "ABC 283 D" / "ARC 100 C" (no explicit platform)
  const atcoderShort = /^(abc|arc|agc|ahc)\s*(\d+)\s*([a-zA-Z])$/i.exec(trimmed);
  if (atcoderShort) {
    const contest = atcoderShort[1].toLowerCase();
    const num = atcoderShort[2];
    const letter = atcoderShort[3].toLowerCase();
    return { platform: 'atcoder', id: `${contest}${num}_${letter}`, confidence: 0.8 };
  }

  // "abc283_d" / "arc100_c" (compact form)
  const atcoderCompact = /^(abc|arc|agc|ahc)(\d+)_([a-z])$/i.exec(trimmed);
  if (atcoderCompact) {
    const contest = atcoderCompact[1].toLowerCase();
    const num = atcoderCompact[2];
    const letter = atcoderCompact[3].toLowerCase();
    return { platform: 'atcoder', id: `${contest}${num}_${letter}`, confidence: 0.7 };
  }

  // --- 4. Infer by pattern (no explicit platform) ---

  // Pure P-number → luogu
  const pureLuogu = /^(P\d+)$/i.exec(trimmed);
  if (pureLuogu) {
    return { platform: 'luogu', id: pureLuogu[1].toUpperCase(), confidence: 0.8 };
  }

  // Pure CF-style number+letter → codeforces
  const pureCf = /^(\d+[A-Z][A-Za-z0-9]*)$/.exec(trimmed);
  if (pureCf) {
    return { platform: 'codeforces', id: pureCf[1], confidence: 0.7 };
  }

  return null;
}

// ==================== URL Generation ====================

/**
 * 根据解析结果生成题目 URL。
 * @param {{ platform: string, id: string }} parsed - parseProblemId 的输出
 * @returns {string|null}
 */
export function generateProblemUrl(parsed) {
  if (!parsed || !parsed.platform || !parsed.id) return null;

  const config = PLATFORM_CONFIG[parsed.platform];
  if (!config) return null;

  // Validate id format
  if (config.idPattern && !config.idPattern.test(parsed.id)) return null;

  return config.urlTemplate(parsed.id);
}

// ==================== Verification ====================

/**
 * 对题目 URL 发送 HEAD 请求验证可用性。
 * @param {string} url - 题目 URL
 * @param {number} [timeoutMs=5000] - 超时时间（毫秒）
 * @returns {Promise<{ valid: boolean|null, status: number, error?: string }>}
 */
export async function verifyProblemUrl(url, timeoutMs = 5000) {
  if (!url) {
    return { valid: null, status: 0, error: 'no_url' };
  }

  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs)
    });
    const valid = resp.status >= 200 && resp.status < 300;
    return { valid, status: resp.status };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { valid: null, status: 0, error: 'timeout' };
    }
    return { valid: null, status: 0, error: 'network' };
  }
}

// ==================== Display Helpers ====================

const STATUS_MAP = {
  unknown: { cssClass: 'entry-unknown', icon: '🔗', statusText: '格式有误' },
  valid: { cssClass: 'entry-valid', icon: '✅', statusText: '可点击' },
  invalid: { cssClass: 'entry-invalid', icon: '❌', statusText: '题号不存在' },
  unverified: { cssClass: 'entry-unverified', icon: '⏳', statusText: '待确认' }
};

/**
 * 将条目转换为展示用对象。
 * @param {{ rawText: string, parsed: object|null, url: string|null, verification: object|null, status: string }} entry
 * @returns {{ cssClass: string, icon: string, linkHtml: string|null, statusText: string }}
 */
export function formatEntryForDisplay(entry) {
  const status = entry?.status || 'unknown';
  const info = STATUS_MAP[status] || STATUS_MAP.unknown;

  let linkHtml = null;
  if (entry?.url && (status === 'valid' || status === 'unverified')) {
    linkHtml = `<a href="${entry.url}" target="_blank" class="problem-link">点击做题 ↗</a>`;
  }

  return {
    cssClass: info.cssClass,
    icon: info.icon,
    linkHtml,
    statusText: info.statusText
  };
}

// ==================== Entry Processing ====================

/**
 * 解析文本 → 生成 URL → 验证可用性。
 * @param {string} text - 自然语言文本
 * @returns {Promise<{ rawText: string, parsed: object|null, url: string|null, verification: object|null, status: string, displayTitle: string }>}
 */
export async function generateRecommendationEntry(text) {
  const rawText = text;
  const parsed = parseProblemId(text);
  const displayTitle = text;

  if (!parsed) {
    return {
      rawText,
      parsed: null,
      url: null,
      verification: null,
      displayTitle,
      status: 'unknown'
    };
  }

  const url = generateProblemUrl(parsed);
  if (!url) {
    return {
      rawText,
      parsed,
      url: null,
      verification: null,
      displayTitle,
      status: 'unknown'
    };
  }

  const verification = await verifyProblemUrl(url);
  let status;
  if (verification.valid === true) status = 'valid';
  else if (verification.valid === false) status = 'invalid';
  else status = 'unverified';

  return {
    rawText,
    parsed,
    url,
    verification,
    displayTitle,
    status
  };
}

/**
 * 并发验证多个条目，控制最大并行数。
 * @param {Array<{ url: string }>} entries - 待验证条目数组
 * @param {number} [concurrency=5] - 最大并行请求数
 * @returns {Promise<Array>} 填充了 verification 和 status 的条目数组
 */
export async function verifyAllEntries(entries, concurrency = 5) {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const results = new Array(entries.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < entries.length) {
      const idx = nextIndex++;
      const entry = entries[idx];
      if (!entry.url) {
        results[idx] = {
          ...entry,
          verification: null,
          status: 'unknown'
        };
        continue;
      }
      const verification = await verifyProblemUrl(entry.url);
      let status;
      if (verification.valid === true) status = 'valid';
      else if (verification.valid === false) status = 'invalid';
      else status = 'unverified';
      results[idx] = { ...entry, verification, status };
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, entries.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

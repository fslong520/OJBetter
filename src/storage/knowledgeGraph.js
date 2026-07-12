/**
 * 知识图谱存储 - 单 key 嵌套结构
 * 追踪知识点掌握度、难度分布、学习阶段分析
 */

const STORAGE_KEY = 'knowledge_graph';
const MAX_RECORDS = 5000;
const MAX_KNOWLEDGE_POINTS = 200;

const DEFAULT_DATA = {
  version: '1.0',
  records: [],
  aggregates: {
    knowledgePoints: {},
    tags: {},
    totalRecords: 0,
    lastUpdated: 0
  },
  stageAnalysis: null
};

/** 500ms debounce timer for aggregate recomputation */
let _debounceTimer = null;

function _dateStr(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Map hintLevel (1/2/3) to mastery estimate (0-1)
 * Level 1 (min hint) → 0.8, Level 2 (medium) → 0.5, Level 3 (max hint) → 0.2
 */
function _computeMasteryFromHint(hintLevel) {
  const map = { 1: 0.8, 2: 0.5, 3: 0.2 };
  return map[hintLevel] !== undefined ? map[hintLevel] : 0.5;
}

/** Load full data from storage; return default if missing */
async function _load() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || JSON.parse(JSON.stringify(DEFAULT_DATA));
}

/** Save full data to storage */
async function _save(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

/**
 * Recompute aggregates from all records.
 * Called internally via 500ms debounce after new record insertion.
 */
async function _updateAggregates() {
  const data = await _load();
  const records = data.records;

  const kpAccum = {};
  const tagAccum = {};

  for (const rec of records) {
    const mastery = rec.masteryEstimate || 0.5;
    const difficulty = rec.difficulty || 0;

    if (rec.knowledgePoints && rec.knowledgePoints.length) {
      for (const kp of rec.knowledgePoints) {
        if (!kpAccum[kp]) {
          kpAccum[kp] = { count: 0, totalMastery: 0, lastPracticed: 0, totalDifficulty: 0 };
        }
        kpAccum[kp].count++;
        kpAccum[kp].totalMastery += mastery;
        kpAccum[kp].lastPracticed = Math.max(kpAccum[kp].lastPracticed, rec.timestamp);
        kpAccum[kp].totalDifficulty += difficulty;
      }
    }

    if (rec.tags && rec.tags.length) {
      for (const tag of rec.tags) {
        if (!tagAccum[tag]) {
          tagAccum[tag] = { count: 0, totalMastery: 0, lastPracticed: 0 };
        }
        tagAccum[tag].count++;
        tagAccum[tag].totalMastery += mastery;
        tagAccum[tag].lastPracticed = Math.max(tagAccum[tag].lastPracticed, rec.timestamp);
      }
    }
  }

  // Build knowledgePoints aggregates
  const kpResult = {};
  for (const [name, agg] of Object.entries(kpAccum)) {
    kpResult[name] = {
      count: agg.count,
      avgMastery: agg.count > 0 ? +(agg.totalMastery / agg.count).toFixed(4) : 0,
      lastPracticed: agg.lastPracticed,
      avgDifficulty: agg.count > 0 ? +(agg.totalDifficulty / agg.count).toFixed(2) : 0
    };
  }

  // Build tags aggregates
  const tagResult = {};
  for (const [name, agg] of Object.entries(tagAccum)) {
    tagResult[name] = {
      count: agg.count,
      avgMastery: agg.count > 0 ? +(agg.totalMastery / agg.count).toFixed(4) : 0,
      lastPracticed: agg.lastPracticed
    };
  }

  // Enforce MAX_KNOWLEDGE_POINTS: keep most recently practiced
  const sortedKp = Object.entries(kpResult).sort((a, b) => b[1].lastPracticed - a[1].lastPracticed);
  if (sortedKp.length > MAX_KNOWLEDGE_POINTS) {
    for (let i = MAX_KNOWLEDGE_POINTS; i < sortedKp.length; i++) {
      delete kpResult[sortedKp[i][0]];
    }
  }

  data.aggregates = {
    knowledgePoints: kpResult,
    tags: tagResult,
    totalRecords: records.length,
    lastUpdated: Date.now()
  };

  await _save(data);
}

/** Debounced wrapper: batches rapid insertions into single recompute */
function _debouncedUpdateAggregates() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    _updateAggregates().catch(() => {});
  }, 500);
}

// ==================== Public API ====================

/**
 * Add a knowledge record.
 * @param {Object} record
 * @param {string}  [record.problemUrl]
 * @param {string[]} [record.knowledgePoints]
 * @param {number}  [record.difficulty]       CF Rating 800-3500
 * @param {string[]} [record.tags]
 * @param {number}  [record.hintLevelUsed]    1|2|3
 * @param {number}  [record.masteryEstimate]  0-1, computed from hintLevel if absent
 * @param {string}  [record.sourceRecordId]    link to history record
 * @returns {Promise<Object>} the saved record
 */
async function addKnowledgeRecord(record) {
  const now = Date.now();
  const id = 'knode_' + now.toString(36) + Math.random().toString(36).slice(2, 8);

  const masteryEstimate = record.masteryEstimate !== undefined && record.masteryEstimate !== null
    ? record.masteryEstimate
    : _computeMasteryFromHint(record.hintLevelUsed);

  const newRecord = {
    id,
    timestamp: now,
    date: _dateStr(now),
    problemUrl: record.problemUrl || '',
    knowledgePoints: Array.isArray(record.knowledgePoints) ? record.knowledgePoints : [],
    difficulty: typeof record.difficulty === 'number' ? record.difficulty : 0,
    tags: Array.isArray(record.tags) ? record.tags : [],
    hintLevelUsed: record.hintLevelUsed || 2,
    masteryEstimate,
    sourceRecordId: record.sourceRecordId || '',
    codeSnippets: Array.isArray(record.codeSnippets) ? record.codeSnippets : [],
    codeQuality: typeof record.codeQuality === 'string' ? record.codeQuality : '',
    commonMistakes: Array.isArray(record.commonMistakes) ? record.commonMistakes : []
  };

  const data = await _load();
  data.records.unshift(newRecord);

  // Enforce MAX_RECORDS: keep newest
  if (data.records.length > MAX_RECORDS) {
    data.records.length = MAX_RECORDS;
  }

  await _save(data);
  _debouncedUpdateAggregates();

  return newRecord;
}

/** Return all records (newest first) */
async function getAllKnowledgeRecords() {
  const data = await _load();
  return data.records;
}

/** Return cached aggregate object */
async function getKnowledgeAggregates() {
  const data = await _load();
  return data.aggregates;
}

/**
 * Return computed statistics from all records.
 * Includes weakest/strongest topics, difficulty range, and bucketed counts.
 */
async function getKnowledgeStats() {
  const data = await _load();
  const records = data.records;

  const totalRecords = records.length;

  // Collect unique names
  const uniqueKp = new Set();
  const uniqueTag = new Set();
  const kpStats = {};

  for (const rec of records) {
    const mastery = rec.masteryEstimate || 0.5;

    if (rec.knowledgePoints) {
      for (const kp of rec.knowledgePoints) {
        uniqueKp.add(kp);
        if (!kpStats[kp]) kpStats[kp] = { total: 0, count: 0 };
        kpStats[kp].total += mastery;
        kpStats[kp].count++;
      }
    }
    if (rec.tags) {
      for (const tag of rec.tags) uniqueTag.add(tag);
    }
  }

  // weakest / strongest by avgMastery
  const kpAvg = Object.entries(kpStats)
    .filter(([, v]) => v.count > 0)
    .map(([name, v]) => ({ name, avgMastery: +(v.total / v.count).toFixed(4) }));

  kpAvg.sort((a, b) => a.avgMastery - b.avgMastery);

  const weakestTopics = kpAvg.slice(0, 5).map(t => ({ topic: t.name, avgMastery: t.avgMastery }));
  const strongestTopics = kpAvg.slice(-5).reverse().map(t => ({ topic: t.name, avgMastery: t.avgMastery }));

  // Difficulty range
  const difficulties = records
    .map(r => r.difficulty)
    .filter(d => typeof d === 'number' && d > 0);

  let difficultyRange = { min: 0, max: 0, avg: 0 };
  if (difficulties.length > 0) {
    const sum = difficulties.reduce((a, b) => a + b, 0);
    difficultyRange = {
      min: Math.min(...difficulties),
      max: Math.max(...difficulties),
      avg: Math.round(sum / difficulties.length)
    };
  }

  // Bucket by difficulty
  const recordsByDifficulty = {
    '800-1200': 0,
    '1200-1600': 0,
    '1600-2000': 0,
    '2000+': 0
  };
  for (const rec of records) {
    const d = rec.difficulty || 0;
    if (d >= 800 && d < 1200) recordsByDifficulty['800-1200']++;
    else if (d >= 1200 && d < 1600) recordsByDifficulty['1200-1600']++;
    else if (d >= 1600 && d < 2000) recordsByDifficulty['1600-2000']++;
    else if (d >= 2000) recordsByDifficulty['2000+']++;
  }

  return {
    totalRecords,
    uniqueKnowledgePoints: uniqueKp.size,
    uniqueTags: uniqueTag.size,
    weakestTopics,
    strongestTopics,
    difficultyRange,
    recordsByDifficulty
  };
}

/**
 * Save (overwrite) the stage analysis cache.
 * Does NOT trigger aggregate update.
 * @param {Object} analysis
 * @param {string}   analysis.currentStage
 * @param {number}   analysis.stageConfidence    0-1
 * @param {string[]} analysis.weakPoints
 * @param {string[]} analysis.strongPoints
 * @param {number[]} analysis.recommendedRating  [min, max]
 * @param {string}   analysis.summary
 * @param {number}   [analysis.analyzedAt]
 */
async function saveStageAnalysis(analysis) {
  const data = await _load();
  data.stageAnalysis = {
    currentStage: analysis.currentStage || '',
    stageConfidence: analysis.stageConfidence || 0,
    weakPoints: Array.isArray(analysis.weakPoints) ? analysis.weakPoints : [],
    strongPoints: Array.isArray(analysis.strongPoints) ? analysis.strongPoints : [],
    recommendedRating: Array.isArray(analysis.recommendedRating) ? analysis.recommendedRating : [800, 1200],
    summary: analysis.summary || '',
    analyzedAt: analysis.analyzedAt || Date.now()
  };
  await _save(data);
}

/** Return cached stage analysis or null */
async function getStageAnalysis() {
  const data = await _load();
  return data.stageAnalysis || null;
}

export {
  addKnowledgeRecord,
  getAllKnowledgeRecords,
  getKnowledgeAggregates,
  getStageAnalysis,
  saveStageAnalysis,
  getKnowledgeStats
};

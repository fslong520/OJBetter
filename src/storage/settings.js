/**
 * 设置存储
 */
import { DEFAULT_API_CONFIG } from '../config/models.js';

const SETTINGS_KEY = 'tutor_settings';

const DEFAULT_SETTINGS = {
  ...DEFAULT_API_CONFIG,
  defaultHintLevel: 2,
  coachStyle: 'default'
};

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
}

async function saveSettings(settings) {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export { getSettings, saveSettings, DEFAULT_SETTINGS };

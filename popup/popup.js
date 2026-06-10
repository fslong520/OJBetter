/**
 * Popup - 弹出窗口
 */

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('open-sidepanel-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
      });
    }
    window.close();
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  });

  document.getElementById('plan-popup-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
      });
    }
    window.close();
  });

  await loadStats();
});

async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getHistory' });
    const history = response.history || [];

    document.getElementById('stat-count').textContent = history.length || '0';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = history.filter(h => h.timestamp >= today.getTime()).length;
    document.getElementById('stat-today').textContent = todayCount;
  } catch (e) {
    document.getElementById('stat-count').textContent = '0';
    document.getElementById('stat-today').textContent = '0';
  }
}

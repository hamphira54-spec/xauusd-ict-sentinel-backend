const DEFAULTS = {
  apiBaseUrl: 'http://localhost:3000',
  apiKey: '',
  autoScan: true,
  autoScanMinutes: 15,
  sessionFilter: true
};

const TF_ORDER = ['1W', '1H', '15M', '5M', '1M'];

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set({ ...DEFAULTS, ...current });
  await scheduleAlarm(current.autoScanMinutes || DEFAULTS.autoScanMinutes);
});

async function scheduleAlarm(minutes) {
  chrome.alarms.clear('ict-auto-scan', () => {
    chrome.alarms.create('ict-auto-scan', { periodInMinutes: Math.max(15, Number(minutes) || 15) });
  });
}

async function getActiveTradingViewTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true, url: ['https://www.tradingview.com/*'] });
  return tabs[0];
}

async function captureTimeframeScreenshots(tab) {
  const screenshots = [];
  for (const timeframe of TF_ORDER) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'ICT_SWITCH_TIMEFRAME', timeframe });
      await new Promise(r => setTimeout(r, 1400));
      const image = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      screenshots.push({ timeframe, image });
    } catch (error) {
      screenshots.push({ timeframe, error: error.message });
    }
  }
  return screenshots;
}

async function runScan(tabId, manual = false) {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  if (!settings.apiKey || !settings.apiBaseUrl) {
    console.warn('XAUUSD ICT Sentinel not configured');
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    const screenshots = await captureTimeframeScreenshots(tab);
    const payload = await chrome.tabs.sendMessage(tabId, {
      type: 'ICT_SCAN',
      manual,
      settings,
      requestedTimeframes: TF_ORDER,
      screenshotsMeta: screenshots.map(s => ({ timeframe: s.timeframe, captured: !!s.image }))
    });
    if (!payload || payload.error) throw new Error(payload?.error || 'No payload returned from content script');

    payload.screenshots = screenshots.filter(x => !!x.image);

    const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-extension-api-key': settings.apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('XAUUSD ICT Sentinel scan result', data);
    await chrome.tabs.sendMessage(tabId, { type: 'ICT_SCAN_RESULT', data });
  } catch (error) {
    console.error(error);
    await chrome.tabs.sendMessage(tabId, { type: 'ICT_SCAN_RESULT', data: { ok: false, error: error.message } }).catch(() => {});
  }
}

chrome.action.onClicked.addListener(async tab => {
  if (tab?.id) await runScan(tab.id, true);
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'ict-auto-scan') return;
  const settings = await chrome.storage.sync.get(DEFAULTS);
  if (!settings.autoScan) return;
  const tab = await getActiveTradingViewTab();
  if (tab?.id) await runScan(tab.id, false);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'SAVE_SETTINGS') {
    chrome.storage.sync.set(msg.settings).then(async () => {
      await scheduleAlarm(msg.settings.autoScanMinutes || DEFAULTS.autoScanMinutes);
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg?.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(DEFAULTS).then(sendResponse);
    return true;
  }
});

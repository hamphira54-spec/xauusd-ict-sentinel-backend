(function () {
  function showToast(text, isError = false) {
    let el = document.getElementById('ict-sentinel-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ict-sentinel-toast';
      el.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;background:#111827;color:#fff;padding:12px 16px;border-radius:12px;font:14px Arial;box-shadow:0 12px 28px rgba(0,0,0,.35);max-width:360px';
      document.body.appendChild(el);
    }
    el.style.background = isError ? '#7f1d1d' : '#111827';
    el.textContent = text;
    setTimeout(() => { if (el) el.remove(); }, 6000);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'ICT_SCAN') {
      window.XAUUSD_ICT_SENTINEL.extractStructuredData(msg.requestedTimeframes || ['1W', '1H', '15M', '5M', '1M'])
        .then(data => sendResponse(data))
        .catch(err => sendResponse({ error: err.message }));
      return true;
    }
    if (msg?.type === 'ICT_SWITCH_TIMEFRAME') {
      window.XAUUSD_ICT_SENTINEL.switchTimeframe(msg.timeframe)
        .then(ok => sendResponse({ ok, timeframe: msg.timeframe }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }
    if (msg?.type === 'ICT_SCAN_RESULT') {
      const data = msg.data || {};
      if (data.ok && data.status === 'signal_sent') {
        showToast(`Signal sent: ${data.analysis.grade} | ${data.analysis.entry.model} | cooldown ${data.cooldownMinutes}m`);
      } else if (data.status === 'rejected_by_sniper_mode') {
        showToast(`Rejected by sniper mode: ${data.analysis.grade} / ${data.analysis.confidence}`);
      } else if (data.status === 'duplicate_blocked') {
        showToast('Duplicate blocked. Cooldown active.');
      } else {
        showToast(data.error || 'Scan failed', true);
      }
    }
  });
})();

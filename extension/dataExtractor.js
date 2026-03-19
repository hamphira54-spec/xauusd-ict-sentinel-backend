(function () {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function getSymbolFromPage() {
    const text = document.body.innerText || '';
    if (text.includes('XAUUSD') || text.includes('GOLD')) return 'XAUUSD';
    const title = document.title || '';
    if (/XAUUSD|GOLD/i.test(title)) return 'XAUUSD';
    return null;
  }

  function pickNumber(text) {
    const m = String(text || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }

  function getOHLCFromDom() {
    const bodyText = document.body.innerText || '';
    const joined = bodyText.split('\n').slice(0, 200).join(' ');
    const open = pickNumber(joined.match(/O\s*([\d.,]+)/i)?.[1]);
    const high = pickNumber(joined.match(/H\s*([\d.,]+)/i)?.[1]);
    const low = pickNumber(joined.match(/L\s*([\d.,]+)/i)?.[1]);
    const close = pickNumber(joined.match(/C\s*([\d.,]+)/i)?.[1]);
    if ([open, high, low, close].every(v => typeof v === 'number')) return { open, high, low, close };
    return null;
  }

  function getVisiblePrice() {
    const nums = (document.body.innerText || '').match(/\d{3,4}(?:\.\d{1,2})?/g) || [];
    const last = nums.at(-1);
    return last ? Number(last) : null;
  }

  function syntheticCandlesFromLastBar(lastBar, count = 40, stepMs = 60000) {
    const candles = [];
    if (!lastBar) return candles;
    let ref = Number(lastBar.close);
    for (let i = count; i > 0; i--) {
      const drift = (Math.sin(i / 3) * 2) + (Math.cos(i / 4) * 1.4);
      const open = Number((ref - drift * 0.35).toFixed(2));
      const close = Number((ref + drift * 0.25).toFixed(2));
      const high = Number((Math.max(open, close) + 0.45 + Math.abs(drift) * 0.2).toFixed(2));
      const low = Number((Math.min(open, close) - 0.45 - Math.abs(drift) * 0.2).toFixed(2));
      candles.push({ time: Date.now() - i * stepMs, open, high, low, close });
      ref = close;
    }
    return candles;
  }

  function findTimeframeButton(label) {
    const nodes = [...document.querySelectorAll('button, div[role="button"], span')];
    const exact = nodes.find(n => (n.textContent || '').trim() === label);
    if (exact) return exact;
    return nodes.find(n => new RegExp(`(^|\\s)${label}(\\s|$)`, 'i').test((n.textContent || '').trim()));
  }

  async function switchTimeframe(label) {
    const btn = findTimeframeButton(label);
    if (!btn) return false;
    btn.click();
    await sleep(1000);
    return true;
  }

  async function extractPerTimeframe(label) {
    await switchTimeframe(label);
    await sleep(500);
    const ohlc = getOHLCFromDom();
    const price = getVisiblePrice() || ohlc?.close || 0;
    const step = label === '1W' ? 7 * 24 * 60 * 60 * 1000 : label === '1H' ? 60 * 60 * 1000 : label === '15M' ? 15 * 60 * 1000 : label === '5M' ? 5 * 60 * 1000 : 60 * 1000;
    return {
      timeframe: label,
      price,
      ohlc,
      candles: syntheticCandlesFromLastBar(ohlc || { open: price - 1, high: price + 1, low: price - 2, close: price }, label === '1W' ? 20 : 50, step)
    };
  }

  async function extractStructuredData(tfOrder = ['1W', '1H', '15M', '5M', '1M']) {
    const symbol = getSymbolFromPage();
    if (symbol !== 'XAUUSD') return { error: 'Chart is not XAUUSD. Open TradingView XAUUSD chart first.' };

    const tfData = [];
    for (const tf of tfOrder) tfData.push(await extractPerTimeframe(tf));

    const w = tfData.find(x => x.timeframe === '1W');
    const h = tfData.find(x => x.timeframe === '1H');
    const m1 = tfData.find(x => x.timeframe === '1M');
    const m5 = tfData.find(x => x.timeframe === '5M');
    const m15 = tfData.find(x => x.timeframe === '15M');
    const price = m1?.price || h?.price || w?.price || 0;
    const htfCandles = [...(w?.candles || []), ...(h?.candles || [])];

    return {
      symbol: 'XAUUSD',
      timeframes: tfOrder,
      screenshots: [],
      htfData: {
        price,
        midpoint: Number(((Math.max(...htfCandles.map(c => c.high)) + Math.min(...htfCandles.map(c => c.low))) / 2).toFixed(2)),
        highs: htfCandles.map(c => c.high),
        lows: htfCandles.map(c => c.low)
      },
      ltfData: {
        candles: m1?.candles || [],
        candles5m: m5?.candles || [],
        candles15m: m15?.candles || [],
        highs: (m1?.candles || []).map(c => c.high),
        lows: (m1?.candles || []).map(c => c.low)
      },
      rawTimeframes: tfData,
      meta: {
        extractedAt: new Date().toISOString(),
        extractionMode: 'timeframe-sequenced-dom+synthetic-series',
        note: 'Production extension controls timeframe switching and screenshot capture. Replace synthetic candles with a direct TradingView series adapter for maximum accuracy if your environment exposes one.'
      }
    };
  }

  window.XAUUSD_ICT_SENTINEL = { extractStructuredData, sleep, switchTimeframe };
})();

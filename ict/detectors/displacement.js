function candleBodyPercent(c) {
  const high = Number(c.high);
  const low = Number(c.low);
  const open = Number(c.open);
  const close = Number(c.close);
  const range = Math.max(high - low, 0.00001);
  const body = Math.abs(close - open);
  return Number(((body / range) * 100).toFixed(2));
}

function detectDisplacement(candles = []) {
  if (!Array.isArray(candles) || candles.length < 3) {
    return { detected: false, reason: 'Not enough candles' };
  }

  const recent = candles.slice(-5);
  const candidate = [...recent].reverse().find(c => candleBodyPercent(c) >= 70);
  if (!candidate) return { detected: false, reason: 'No 70%+ body candle found in recent window' };

  const direction = Number(candidate.close) > Number(candidate.open) ? 'bullish' : 'bearish';
  const bodyPercent = candleBodyPercent(candidate);
  const range = Number(candidate.high) - Number(candidate.low);

  return {
    detected: true,
    direction,
    bodyPercent,
    impulseSize: Number(range.toFixed(2)),
    candleTime: candidate.time,
    open: Number(candidate.open),
    close: Number(candidate.close),
    high: Number(candidate.high),
    low: Number(candidate.low)
  };
}

module.exports = { detectDisplacement, candleBodyPercent };

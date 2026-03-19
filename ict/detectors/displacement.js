function detectDisplacement(candles = []) {
  if (!Array.isArray(candles) || candles.length < 2) {
    return { found: false, direction: 'neutral', bodyPct: 0, quality: 0, note: 'Not enough candles' };
  }

  const c = candles.at(-1);
  const open = Number(c.open);
  const close = Number(c.close);
  const high = Number(c.high);
  const low = Number(c.low);
  const range = Math.max(0.01, high - low);
  const body = Math.abs(close - open);
  const bodyPct = Number(((body / range) * 100).toFixed(2));
  const direction = close > open ? 'bullish' : close < open ? 'bearish' : 'neutral';

  if (bodyPct >= 70) {
    return {
      found: true,
      direction,
      bodyPct,
      quality: bodyPct >= 85 ? 15 : 12,
      note: `Strong ${direction} displacement candle with ${bodyPct}% body efficiency`
    };
  }

  return {
    found: false,
    direction,
    bodyPct,
    quality: Math.min(8, Math.round(bodyPct / 10)),
    note: 'No institutional-grade displacement candle detected'
  };
}

module.exports = { detectDisplacement };

function avg(values = []) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + Number(b || 0), 0) / values.length;
}

function detectBias(htf = {}) {
  const highs = Array.isArray(htf.highs) ? htf.highs.map(Number) : [];
  const lows = Array.isArray(htf.lows) ? htf.lows.map(Number) : [];
  const price = Number(htf.price || 0);

  const rangeHigh = Math.max(...(highs.length ? highs : [price]));
  const rangeLow = Math.min(...(lows.length ? lows : [price]));
  const midpoint = Number(((rangeHigh + rangeLow) / 2).toFixed(2));
  const recentHighs = highs.slice(-5);
  const recentLows = lows.slice(-5);
  const highSlope = recentHighs.length >= 2 ? recentHighs[recentHighs.length - 1] - recentHighs[0] : 0;
  const lowSlope = recentLows.length >= 2 ? recentLows[recentLows.length - 1] - recentLows[0] : 0;

  let bias = 'neutral';
  if (price > midpoint && highSlope >= 0 && lowSlope >= 0) bias = 'bullish';
  if (price < midpoint && highSlope <= 0 && lowSlope <= 0) bias = 'bearish';

  const premiumDiscount = price > midpoint ? 'premium' : price < midpoint ? 'discount' : 'equilibrium';
  const strength = Math.min(100, Math.round((Math.abs(highSlope) + Math.abs(lowSlope)) / Math.max(price * 0.0005, 1) * 10));

  return {
    price,
    rangeHigh,
    rangeLow,
    midpoint,
    bias,
    premiumDiscount,
    trend: {
      highSlope: Number(highSlope.toFixed(2)),
      lowSlope: Number(lowSlope.toFixed(2)),
      avgHigh: Number(avg(recentHighs).toFixed(2)),
      avgLow: Number(avg(recentLows).toFixed(2)),
      strength
    }
  };
}

module.exports = { detectBias };

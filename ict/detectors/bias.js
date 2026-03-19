function average(arr = []) {
  if (!arr.length) return 0;
  return arr.reduce((sum, v) => sum + Number(v || 0), 0) / arr.length;
}

function detectBias(htf = {}) {
  const highs = Array.isArray(htf.highs) ? htf.highs.map(Number).filter(Number.isFinite) : [];
  const lows = Array.isArray(htf.lows) ? htf.lows.map(Number).filter(Number.isFinite) : [];
  const price = Number(htf.price);

  const swingHigh = highs.length ? Math.max(...highs) : price;
  const swingLow = lows.length ? Math.min(...lows) : price;
  const midpoint = Number((((swingHigh + swingLow) / 2) || price || 0).toFixed(2));
  const avgHigh = average(highs.slice(-5));
  const avgLow = average(lows.slice(-5));
  const range = Math.max(0.01, swingHigh - swingLow);
  const premiumDiscount = price <= midpoint ? 'discount' : 'premium';

  let bias = 'neutral';
  let alignment = 8;

  if (price > midpoint && avgHigh >= avgLow && price > avgHigh - range * 0.15) {
    bias = 'bullish';
    alignment = 20;
  } else if (price < midpoint && avgLow <= avgHigh && price < avgLow + range * 0.15) {
    bias = 'bearish';
    alignment = 20;
  } else if (Math.abs(price - midpoint) <= range * 0.05) {
    bias = 'neutral';
    alignment = 10;
  } else {
    alignment = 14;
    bias = price > midpoint ? 'bullish' : 'bearish';
  }

  return {
    swingHigh: Number(swingHigh.toFixed(2)),
    swingLow: Number(swingLow.toFixed(2)),
    midpoint,
    price,
    premiumDiscount,
    bias,
    alignment
  };
}

module.exports = { detectBias };

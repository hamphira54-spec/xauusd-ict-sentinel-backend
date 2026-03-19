function detectFVG(candles = []) {
  if (!Array.isArray(candles) || candles.length < 3) {
    return { found: false, side: 'none', zone: null, quality: 0, note: 'Not enough candles' };
  }

  const a = candles.at(-3);
  const b = candles.at(-2);
  const c = candles.at(-1);

  if (Number(c.low) > Number(a.high)) {
    const size = Number((Number(c.low) - Number(a.high)).toFixed(2));
    return {
      found: true,
      side: 'bullish',
      zone: [Number(a.high), Number(c.low)],
      gapSize: size,
      quality: size > 1 ? 15 : 11,
      note: 'Bullish fair value gap detected'
    };
  }

  if (Number(c.high) < Number(a.low)) {
    const size = Number((Number(a.low) - Number(c.high)).toFixed(2));
    return {
      found: true,
      side: 'bearish',
      zone: [Number(c.high), Number(a.low)],
      gapSize: size,
      quality: size > 1 ? 15 : 11,
      note: 'Bearish fair value gap detected'
    };
  }

  return {
    found: false,
    side: 'none',
    zone: null,
    gapSize: 0,
    quality: 4,
    note: 'No active 3-candle FVG detected'
  };
}

module.exports = { detectFVG };

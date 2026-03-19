function detectFVG(candles = []) {
  if (!Array.isArray(candles) || candles.length < 3) {
    return { detected: false, reason: 'Not enough candles' };
  }

  const lastThree = candles.slice(-3);
  const [a, b, c] = lastThree.map(x => ({
    high: Number(x.high),
    low: Number(x.low),
    time: x.time
  }));

  if (c.low > a.high) {
    const size = c.low - a.high;
    return {
      detected: true,
      type: 'bullish',
      start: a.high,
      end: c.low,
      midpoint: Number(((a.high + c.low) / 2).toFixed(2)),
      size: Number(size.toFixed(2)),
      candleTime: b.time,
      quality: size > 1.5 ? 'high' : size > 0.7 ? 'medium' : 'low'
    };
  }

  if (c.high < a.low) {
    const size = a.low - c.high;
    return {
      detected: true,
      type: 'bearish',
      start: c.high,
      end: a.low,
      midpoint: Number(((c.high + a.low) / 2).toFixed(2)),
      size: Number(size.toFixed(2)),
      candleTime: b.time,
      quality: size > 1.5 ? 'high' : size > 0.7 ? 'medium' : 'low'
    };
  }

  return { detected: false, reason: 'No 3-candle fair value gap' };
}

module.exports = { detectFVG };

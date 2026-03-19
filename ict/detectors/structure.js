function detectStructureShift(candles = []) {
  if (!Array.isArray(candles) || candles.length < 8) {
    return { detected: false, type: 'none', reason: 'Not enough candles' };
  }

  const recent = candles.slice(-10);
  const latest = recent[recent.length - 1];
  const swingHigh = Math.max(...recent.slice(0, -1).map(c => Number(c.high)));
  const swingLow = Math.min(...recent.slice(0, -1).map(c => Number(c.low)));
  const prevClose = Number(recent[recent.length - 2].close);
  const close = Number(latest.close);

  if (close > swingHigh && prevClose <= swingHigh) {
    return {
      detected: true,
      type: 'bullish_MSS',
      brokenLevel: swingHigh,
      candleTime: latest.time,
      description: 'Close broke above prior swing high.'
    };
  }

  if (close < swingLow && prevClose >= swingLow) {
    return {
      detected: true,
      type: 'bearish_MSS',
      brokenLevel: swingLow,
      candleTime: latest.time,
      description: 'Close broke below prior swing low.'
    };
  }

  const localHigh = Math.max(...recent.slice(-5, -1).map(c => Number(c.high)));
  const localLow = Math.min(...recent.slice(-5, -1).map(c => Number(c.low)));
  if (close > localHigh) {
    return {
      detected: true,
      type: 'bullish_CHoCH',
      brokenLevel: localHigh,
      candleTime: latest.time,
      description: 'Change of character bullish break.'
    };
  }
  if (close < localLow) {
    return {
      detected: true,
      type: 'bearish_CHoCH',
      brokenLevel: localLow,
      candleTime: latest.time,
      description: 'Change of character bearish break.'
    };
  }

  return {
    detected: false,
    type: 'none',
    referenceHigh: swingHigh,
    referenceLow: swingLow,
    description: 'No clear MSS / CHoCH detected.'
  };
}

module.exports = { detectStructureShift };

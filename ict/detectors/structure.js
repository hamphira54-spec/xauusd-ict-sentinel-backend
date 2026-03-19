function lastSwingHigh(candles = []) {
  if (candles.length < 4) return null;
  const section = candles.slice(-6, -1);
  return Math.max(...section.map(c => Number(c.high)));
}

function lastSwingLow(candles = []) {
  if (candles.length < 4) return null;
  const section = candles.slice(-6, -1);
  return Math.min(...section.map(c => Number(c.low)));
}

function detectStructureShift(candles = []) {
  if (!Array.isArray(candles) || candles.length < 6) {
    return { found: false, type: 'none', direction: 'neutral', quality: 0, phase: 'consolidation', note: 'Not enough candles' };
  }

  const last = candles.at(-1);
  const prev = candles.at(-2);
  const swingHigh = lastSwingHigh(candles);
  const swingLow = lastSwingLow(candles);

  if (swingHigh !== null && Number(last.close) > swingHigh && Number(prev.close) <= swingHigh) {
    return {
      found: true,
      type: 'MSS',
      direction: 'bullish',
      quality: 10,
      phase: 'reversal',
      brokenLevel: Number(swingHigh),
      note: 'Bullish market structure shift above recent swing high'
    };
  }

  if (swingLow !== null && Number(last.close) < swingLow && Number(prev.close) >= swingLow) {
    return {
      found: true,
      type: 'MSS',
      direction: 'bearish',
      quality: 10,
      phase: 'reversal',
      brokenLevel: Number(swingLow),
      note: 'Bearish market structure shift below recent swing low'
    };
  }

  const recentRangeHigh = Math.max(...candles.slice(-8).map(c => Number(c.high)));
  const recentRangeLow = Math.min(...candles.slice(-8).map(c => Number(c.low)));
  const recentRange = Math.max(0.01, recentRangeHigh - recentRangeLow);
  const lastRange = Math.max(0.01, Number(last.high) - Number(last.low));
  const phase = lastRange < recentRange * 0.18 ? 'consolidation' : 'continuation';

  return {
    found: false,
    type: phase === 'continuation' ? 'CHoCH-lite' : 'range',
    direction: Number(last.close) > Number(prev.close) ? 'bullish' : 'bearish',
    quality: phase === 'continuation' ? 6 : 3,
    phase,
    note: phase === 'continuation' ? 'Momentum continuation without clean MSS' : 'Compressed range, avoid aggressive entries'
  };
}

module.exports = { detectStructureShift };

function buildEntryContext({ HTF, liquidity, displacement, fvg, structure, candles = [], sessionInfo = {} }) {
  const latest = candles[candles.length - 1] || {};
  const bias = HTF?.bias || 'neutral';
  const alignedLong = bias === 'bullish' && liquidity.side === 'sellside' && displacement.direction === 'bullish' && fvg.type === 'bullish' && /^bullish/.test(structure.type || '');
  const alignedShort = bias === 'bearish' && liquidity.side === 'buyside' && displacement.direction === 'bearish' && fvg.type === 'bearish' && /^bearish/.test(structure.type || '');

  let valid = false;
  let side = 'none';
  let model = 'none';
  let phase = 'consolidation';

  if (alignedLong) {
    valid = true;
    side = 'buy';
    model = 'Liquidity Sweep + Bullish Displacement + Bullish FVG + MSS';
    phase = 'reversal';
  } else if (alignedShort) {
    valid = true;
    side = 'sell';
    model = 'Liquidity Sweep + Bearish Displacement + Bearish FVG + MSS';
    phase = 'reversal';
  } else if (bias === displacement.direction && fvg.type === displacement.direction && structure.detected) {
    valid = true;
    side = bias === 'bullish' ? 'buy' : bias === 'bearish' ? 'sell' : 'none';
    model = 'Continuation Displacement + FVG + Structure';
    phase = 'continuation';
  }

  const entryRange = fvg.detected
    ? [Number(Math.min(fvg.start, fvg.end).toFixed(2)), Number(Math.max(fvg.start, fvg.end).toFixed(2))]
    : [Number(latest.low || latest.close || 0), Number(latest.high || latest.close || 0)];

  const sl = side === 'buy'
    ? Number(((liquidity.sweptLevel || latest.low || 0) - 0.6).toFixed(2))
    : side === 'sell'
      ? Number(((liquidity.sweptLevel || latest.high || 0) + 0.6).toFixed(2))
      : null;

  const refEntry = entryRange[0] && entryRange[1] ? Number(((entryRange[0] + entryRange[1]) / 2).toFixed(2)) : Number(latest.close || 0);
  const risk = sl !== null ? Math.abs(refEntry - sl) : 0;

  const tp1 = side === 'buy'
    ? Number((refEntry + risk * 2).toFixed(2))
    : side === 'sell'
      ? Number((refEntry - risk * 2).toFixed(2))
      : null;
  const tp2 = side === 'buy'
    ? Number((refEntry + risk * 3).toFixed(2))
    : side === 'sell'
      ? Number((refEntry - risk * 3).toFixed(2))
      : null;

  return {
    valid,
    side,
    model,
    phase,
    session: sessionInfo.name || 'unknown',
    sessionAllowed: !!sessionInfo.allowed,
    entryRange,
    entryPrice: refEntry,
    stopLoss: sl,
    takeProfit1: tp1,
    takeProfit2: tp2,
    latestPrice: Number(latest.close || 0),
    reason: valid ? 'All required confluence present.' : 'Entry confluence incomplete.'
  };
}

module.exports = { buildEntryContext };

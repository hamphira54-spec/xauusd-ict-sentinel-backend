function detectLiquiditySweep(candles = []) {
  if (!Array.isArray(candles) || candles.length < 6) {
    return { detected: false, side: 'none', reason: 'Not enough candles' };
  }

  const recent = candles.slice(-8);
  const latest = recent[recent.length - 1];
  const prior = recent.slice(0, -1);
  const priorHigh = Math.max(...prior.map(c => Number(c.high)));
  const priorLow = Math.min(...prior.map(c => Number(c.low)));

  const sweepBuySide = Number(latest.high) > priorHigh && Number(latest.close) < priorHigh;
  const sweepSellSide = Number(latest.low) < priorLow && Number(latest.close) > priorLow;

  if (sweepBuySide) {
    return {
      detected: true,
      side: 'buyside',
      sweptLevel: priorHigh,
      candleTime: latest.time,
      description: 'Price ran above prior highs and closed back below liquidity.'
    };
  }

  if (sweepSellSide) {
    return {
      detected: true,
      side: 'sellside',
      sweptLevel: priorLow,
      candleTime: latest.time,
      description: 'Price ran below prior lows and closed back above liquidity.'
    };
  }

  return {
    detected: false,
    side: 'none',
    referenceHigh: priorHigh,
    referenceLow: priorLow,
    description: 'No clean liquidity sweep found.'
  };
}

module.exports = { detectLiquiditySweep };

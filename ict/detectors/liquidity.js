function detectLiquiditySweep(candles = []) {
  if (!Array.isArray(candles) || candles.length < 6) {
    return { found: false, side: 'none', quality: 0, sweepPrice: null, note: 'Not enough candles' };
  }

  const recent = candles.slice(-6);
  const trigger = recent.at(-1);
  const prior = recent.slice(0, -1);
  const priorHigh = Math.max(...prior.map(c => Number(c.high)));
  const priorLow = Math.min(...prior.map(c => Number(c.low)));

  if (Number(trigger.high) > priorHigh && Number(trigger.close) < priorHigh) {
    return {
      found: true,
      side: 'buyside',
      quality: 20,
      sweepPrice: Number(trigger.high),
      note: 'Buyside liquidity swept and closed back below previous highs'
    };
  }

  if (Number(trigger.low) < priorLow && Number(trigger.close) > priorLow) {
    return {
      found: true,
      side: 'sellside',
      quality: 20,
      sweepPrice: Number(trigger.low),
      note: 'Sellside liquidity swept and closed back above previous lows'
    };
  }

  return {
    found: false,
    side: 'none',
    quality: 4,
    sweepPrice: null,
    note: 'No clean liquidity sweep detected'
  };
}

module.exports = { detectLiquiditySweep };

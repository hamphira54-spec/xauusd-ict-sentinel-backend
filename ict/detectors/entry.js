function round2(n) { return Number(Number(n).toFixed(2)); }

function detectEntry(context = {}) {
  const { HTF = {}, LTF = {} } = context;
  const price = Number(HTF.price || LTF.price || 0);
  const liquidity = LTF.liquidity || {};
  const displacement = LTF.displacement || {};
  const fvg = LTF.fvg || {};
  const structure = LTF.structure || {};

  let side = HTF.bias === 'bullish' ? 'buy' : HTF.bias === 'bearish' ? 'sell' : 'neutral';
  if (liquidity.side === 'sellside') side = 'buy';
  if (liquidity.side === 'buyside') side = 'sell';

  const modelParts = [];
  if (liquidity.found) modelParts.push(`${liquidity.side} sweep`);
  if (displacement.found) modelParts.push(`${displacement.direction} displacement`);
  if (fvg.found) modelParts.push(`${fvg.side} FVG`);
  if (structure.found) modelParts.push(structure.type);
  const model = modelParts.length ? modelParts.join(' + ') : 'No-trade model';

  let entryRange;
  if (fvg.found && Array.isArray(fvg.zone)) {
    entryRange = [round2(fvg.zone[0]), round2(fvg.zone[1])];
  } else {
    const buffer = Math.max(0.6, Number((Math.abs(Number(LTF.lastClose || price) - price) || 1.2).toFixed(2)));
    entryRange = side === 'buy'
      ? [round2(price - buffer), round2(price - buffer * 0.2)]
      : [round2(price + buffer * 0.2), round2(price + buffer)];
  }

  const stopLoss = side === 'buy'
    ? round2(Math.min(liquidity.sweepPrice || entryRange[0], entryRange[0]) - 1.8)
    : round2(Math.max(liquidity.sweepPrice || entryRange[1], entryRange[1]) + 1.8);

  const risk = Math.max(0.5, Math.abs((side === 'buy' ? entryRange[1] : entryRange[0]) - stopLoss));
  const takeProfit1 = side === 'buy' ? round2(entryRange[1] + risk * 1.5) : round2(entryRange[0] - risk * 1.5);
  const takeProfit2 = side === 'buy' ? round2(entryRange[1] + risk * 2.5) : round2(entryRange[0] - risk * 2.5);

  const session = LTF.session || 'Off-session';
  const phase = structure.phase || 'continuation';
  const precision = fvg.found && structure.found ? 10 : fvg.found || liquidity.found ? 7 : 3;

  return {
    valid: side !== 'neutral' && liquidity.found && displacement.found,
    side,
    model,
    entryRange,
    stopLoss,
    takeProfit1,
    takeProfit2,
    session,
    phase,
    precision,
    reason: [liquidity.note, displacement.note, fvg.note, structure.note].filter(Boolean).join(' | ')
  };
}

module.exports = { detectEntry };

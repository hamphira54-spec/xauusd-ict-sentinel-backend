const { detectBias } = require('./detectors/bias');
const { detectLiquiditySweep } = require('./detectors/liquidity');
const { detectDisplacement } = require('./detectors/displacement');
const { detectFVG } = require('./detectors/fvg');
const { detectStructureShift } = require('./detectors/structure');
const { detectEntry } = require('./detectors/entry');
const { scoreAnalysis } = require('./scoringEngine');

function normalizeCandles(candles = []) {
  return (Array.isArray(candles) ? candles : [])
    .map((c, i) => ({
      time: c.time || c.timestamp || Date.now() - (candles.length - i) * 60000,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    }))
    .filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite));
}

function inferSession(meta = {}) {
  const hour = Number(meta.utcHour);
  if (Number.isFinite(hour)) {
    if (hour >= 7 && hour < 12) return 'London';
    if (hour >= 13 && hour < 17) return 'Overlap';
    if (hour >= 12 && hour < 21) return 'New York';
  }
  return meta.session || 'Off-session';
}

function analyzeICT(payload = {}, adaptiveBoost = 0) {
  const htfWeekly = payload.htfData?.['1W'] || payload.htfData?.weekly || {};
  const htfHourly = payload.htfData?.['1H'] || payload.htfData?.hourly || {};
  const ltf15 = payload.ltfData?.['15M'] || {};
  const ltf5 = payload.ltfData?.['5M'] || {};
  const ltf1 = payload.ltfData?.['1M'] || {};

  const htfPrice = Number(htfHourly.price || htfWeekly.price || payload.price || 0);
  const htf = detectBias({
    highs: [...(htfWeekly.highs || []), ...(htfHourly.highs || [])],
    lows: [...(htfWeekly.lows || []), ...(htfHourly.lows || [])],
    price: htfPrice
  });

  const ltfCandles = normalizeCandles(ltf1.candles?.length ? ltf1.candles : ltf5.candles?.length ? ltf5.candles : ltf15.candles || []);
  const liquidity = detectLiquiditySweep(ltfCandles);
  const displacement = detectDisplacement(ltfCandles);
  const fvg = detectFVG(ltfCandles);
  const structure = detectStructureShift(ltfCandles);
  const session = inferSession(payload.meta || {});

  const LTF = {
    timeframe: ltf1.candles?.length ? '1M' : ltf5.candles?.length ? '5M' : '15M',
    price: Number(ltfCandles.at(-1)?.close || htfPrice),
    lastClose: Number(ltfCandles.at(-1)?.close || htfPrice),
    candles: ltfCandles,
    highs: ltfCandles.map(c => c.high),
    lows: ltfCandles.map(c => c.low),
    liquidity,
    displacement,
    fvg,
    structure,
    session
  };

  const entry = detectEntry({ HTF: htf, LTF });
  const scored = scoreAnalysis({ HTF: htf, LTF, entry }, adaptiveBoost);

  return {
    symbol: payload.symbol || 'XAUUSD',
    HTF: htf,
    LTF,
    entry,
    score: scored.score,
    qualityScore: scored.qualityScore,
    confidence: scored.confidence,
    grade: scored.grade,
    scoreBreakdown: scored,
    sourceDiagnostics: payload.diagnostics || {}
  };
}

module.exports = { analyzeICT };

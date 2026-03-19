const { detectBias } = require('./detectors/bias');
const { detectLiquiditySweep } = require('./detectors/liquidity');
const { detectDisplacement } = require('./detectors/displacement');
const { detectFVG } = require('./detectors/fvg');
const { detectStructureShift } = require('./detectors/structure');
const { buildEntryContext } = require('./detectors/entry');
const { scoreICTContext } = require('./scoringEngine');

function getSessionInfo(now = new Date()) {
  const utcHour = now.getUTCHours();
  const day = now.getUTCDay();
  const weekday = day >= 1 && day <= 5;

  let name = 'off-session';
  let allowed = false;
  if (utcHour >= 7 && utcHour < 10) {
    name = 'London';
    allowed = true;
  } else if (utcHour >= 12 && utcHour < 16) {
    name = 'New York';
    allowed = true;
  } else if (utcHour >= 12 && utcHour < 14) {
    name = 'London/New York Overlap';
    allowed = true;
  }

  return { name, allowed: allowed && weekday, weekday };
}

function buildHTFContext(htfData = {}) {
  return detectBias(htfData);
}

function analyzeICT(payload = {}, adaptiveBoost = 0) {
  const htfRaw = payload.htfData || {};
  const ltfRaw = payload.ltfData || {};
  const candles = Array.isArray(ltfRaw.candles) ? ltfRaw.candles : [];
  const HTF = buildHTFContext(htfRaw);
  const liquidity = detectLiquiditySweep(candles);
  const displacement = detectDisplacement(candles);
  const fvg = detectFVG(candles);
  const structure = detectStructureShift(candles);
  const sessionInfo = getSessionInfo(new Date());
  const entry = buildEntryContext({ HTF, liquidity, displacement, fvg, structure, candles, sessionInfo });
  const scoring = scoreICTContext({ HTF, liquidity, displacement, fvg, structure, entry, adaptiveBoost });

  return {
    symbol: payload.symbol || 'XAUUSD',
    timeframes: payload.timeframes || ['1W', '1H', '15M', '5M', '1M'],
    HTF,
    LTF: {
      liquidity,
      displacement,
      fvg,
      structure,
      candlesCount: candles.length
    },
    entry,
    score: scoring.score,
    qualityScore: scoring.qualityScore,
    confidence: scoring.confidence,
    grade: scoring.grade,
    breakdown: scoring.breakdown,
    screenshots: Array.isArray(payload.screenshots) ? payload.screenshots : []
  };
}

module.exports = { analyzeICT, getSessionInfo };

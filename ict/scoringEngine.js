function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function computeGrade(score) {
  if (score >= 95) return 'A+++';
  if (score >= 90) return 'A++';
  if (score >= 80) return 'A+';
  return 'reject';
}

function scoreSession(sessionInfo = {}) {
  return sessionInfo.allowed ? 5 : 0;
}

function scoreEntryPrecision(entry = {}, fvg = {}) {
  if (!entry.valid) return 0;
  if (fvg.detected && fvg.quality === 'high') return 10;
  if (fvg.detected && fvg.quality === 'medium') return 8;
  if (fvg.detected) return 6;
  return 4;
}

function scoreICTContext({ HTF, liquidity, displacement, fvg, structure, entry, adaptiveBoost = 0 }) {
  const details = {
    htfAlignment: 0,
    liquiditySweep: 0,
    displacement: 0,
    fvgQuality: 0,
    structureShift: 0,
    entryPrecision: 0,
    sessionTiming: 0,
    modelStrength: 0,
    adaptiveBoost: 0
  };

  if ((HTF.bias === 'bullish' && HTF.premiumDiscount === 'discount') || (HTF.bias === 'bearish' && HTF.premiumDiscount === 'premium')) {
    details.htfAlignment = 20;
  } else if (HTF.bias !== 'neutral') {
    details.htfAlignment = 12;
  }

  if (liquidity.detected) details.liquiditySweep = 20;
  if (displacement.detected) details.displacement = displacement.bodyPercent >= 80 ? 15 : 12;
  if (fvg.detected) details.fvgQuality = fvg.quality === 'high' ? 15 : fvg.quality === 'medium' ? 11 : 8;
  if (structure.detected) details.structureShift = /^.*MSS$/.test(structure.type || '') ? 10 : 8;
  details.entryPrecision = scoreEntryPrecision(entry, fvg);
  details.sessionTiming = scoreSession({ allowed: entry.sessionAllowed });
  if (entry.valid && entry.phase === 'reversal') details.modelStrength = 5;
  else if (entry.valid) details.modelStrength = 4;

  details.adaptiveBoost = clamp(adaptiveBoost, -5, 5);
  const score = Object.values(details).reduce((a, b) => a + b, 0);
  const qualityScore = clamp(score, 0, 100);
  const confidence = clamp(Math.round(qualityScore * 0.92 + (entry.valid ? 6 : 0)), 0, 100);

  return {
    score: qualityScore,
    qualityScore,
    confidence,
    grade: computeGrade(qualityScore),
    breakdown: details
  };
}

module.exports = { scoreICTContext, computeGrade };

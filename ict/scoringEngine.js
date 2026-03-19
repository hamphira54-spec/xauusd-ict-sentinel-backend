function getGrade(score) {
  if (score >= 95) return 'A+++';
  if (score >= 90) return 'A++';
  if (score >= 80) return 'A+';
  return 'reject';
}

function scoreAnalysis(analysis, adaptiveBoost = 0) {
  const breakdown = {
    htfAlignment: Number(analysis.HTF.alignment || 0),
    liquidity: Number(analysis.LTF.liquidity?.quality || 0),
    displacement: Number(analysis.LTF.displacement?.quality || 0),
    fvg: Number(analysis.LTF.fvg?.quality || 0),
    structure: Number(analysis.LTF.structure?.quality || 0),
    entryPrecision: Number(analysis.entry?.precision || 0),
    session: /London|New York|Overlap/.test(analysis.entry?.session || '') ? 5 : 0,
    modelStrength: Number(Math.max(0, Math.min(5, adaptiveBoost + (analysis.entry?.valid ? 3 : 0))))
  };

  const rawScore = Object.values(breakdown).reduce((sum, v) => sum + Number(v || 0), 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let confidence = score;
  if (!analysis.entry?.valid) confidence -= 8;
  if (!analysis.LTF.structure?.found) confidence -= 4;
  if (!analysis.LTF.fvg?.found) confidence -= 3;
  if (analysis.LTF.structure?.phase === 'consolidation') confidence -= 10;
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  return {
    ...breakdown,
    score,
    qualityScore: score,
    confidence,
    grade: getGrade(score)
  };
}

module.exports = { scoreAnalysis, getGrade };

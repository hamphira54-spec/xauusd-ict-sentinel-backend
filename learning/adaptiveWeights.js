function getAdaptiveBoost(modelPerformance = []) {
  const best = {};
  for (const item of modelPerformance) best[item.model] = item;

  return function boostForModel(model) {
    const stats = best[model];
    if (!stats || stats.total < 5) return 0;
    if (stats.winRate > 70) return 4;
    if (stats.winRate < 40) return -4;
    return 0;
  };
}

module.exports = { getAdaptiveBoost };

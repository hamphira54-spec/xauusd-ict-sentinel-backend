const { buildModelStats } = require('./modelStats');

function getAdaptiveBoost(trades = [], model = '') {
  const row = buildModelStats(trades).find(r => r.model === model);
  if (!row || row.total < 5) return 0;
  if (row.winRate >= 70) return 2;
  if (row.winRate < 40) return -2;
  return 0;
}

module.exports = { getAdaptiveBoost };

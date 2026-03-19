const { buildModelStats, buildSessionStats } = require('./modelStats');

function analyzePerformance(trades = []) {
  const resolved = trades.filter(t => t.result === 'win' || t.result === 'loss');
  const wins = resolved.filter(t => t.result === 'win').length;
  const losses = resolved.filter(t => t.result === 'loss').length;
  const total = trades.length;

  return {
    totalTrades: total,
    resolvedTrades: resolved.length,
    wins,
    losses,
    pending: trades.filter(t => t.result === 'pending').length,
    winRate: resolved.length ? Number(((wins / resolved.length) * 100).toFixed(2)) : 0,
    modelPerformance: buildModelStats(trades),
    sessionPerformance: buildSessionStats(trades),
    recentTrades: [...trades].slice(-50).reverse()
  };
}

module.exports = { analyzePerformance };

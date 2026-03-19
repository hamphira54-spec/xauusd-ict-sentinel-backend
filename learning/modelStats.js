function pct(a, b) {
  return b ? Number(((a / b) * 100).toFixed(2)) : 0;
}

function buildModelStats(trades = []) {
  const map = {};
  for (const trade of trades) {
    const key = trade.model || 'Unknown';
    map[key] ||= { total: 0, win: 0, loss: 0, pending: 0, avgScore: 0, avgConfidence: 0 };
    map[key].total += 1;
    map[key][trade.result || 'pending'] = (map[key][trade.result || 'pending'] || 0) + 1;
    map[key].avgScore += Number(trade.score || 0);
    map[key].avgConfidence += Number(trade.confidence || 0);
  }

  return Object.entries(map).map(([model, s]) => ({
    model,
    total: s.total,
    win: s.win,
    loss: s.loss,
    pending: s.pending,
    winRate: pct(s.win, s.win + s.loss),
    avgScore: Number((s.avgScore / s.total).toFixed(2)),
    avgConfidence: Number((s.avgConfidence / s.total).toFixed(2))
  })).sort((a, b) => b.winRate - a.winRate || b.avgScore - a.avgScore);
}

function buildSessionStats(trades = []) {
  const map = {};
  for (const trade of trades) {
    const key = trade.session || 'Unknown';
    map[key] ||= { total: 0, win: 0, loss: 0 };
    map[key].total += 1;
    if (trade.result === 'win') map[key].win += 1;
    if (trade.result === 'loss') map[key].loss += 1;
  }

  return Object.entries(map).map(([session, s]) => ({
    session,
    total: s.total,
    win: s.win,
    loss: s.loss,
    winRate: pct(s.win, s.win + s.loss)
  })).sort((a, b) => b.winRate - a.winRate);
}

module.exports = { buildModelStats, buildSessionStats };

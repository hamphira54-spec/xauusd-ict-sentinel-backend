const crypto = require('crypto');
const { appendTrade, getFingerprint, saveFingerprint, readDb, updateTrade } = require('./database');

function buildFingerprint(signal) {
  return crypto.createHash('sha256').update([
    signal.symbol,
    signal.entry?.side,
    signal.entry?.model,
    signal.entry?.entryRange?.join('-'),
    signal.entry?.phase
  ].join('|')).digest('hex');
}

function computeCooldownMinutes({ grade, confidence, phase, session }) {
  if (phase === 'consolidation') return 60;
  if (grade === 'A+++' && phase === 'reversal') return 20;
  if (grade === 'A++' && phase === 'continuation') return 45;
  if (confidence >= 92 && /Overlap/.test(session || '')) return 20;
  if (confidence >= 85) return 35;
  return 60;
}

function isDuplicateSignal(signal) {
  const fingerprint = buildFingerprint(signal);
  const existing = getFingerprint(fingerprint);
  if (!existing) return { duplicate: false, fingerprint };
  if (Date.now() < existing.expiresAt) return { duplicate: true, fingerprint, existing };
  return { duplicate: false, fingerprint };
}

function reserveSignalFingerprint(signal) {
  const fingerprint = buildFingerprint(signal);
  const cooldownMinutes = computeCooldownMinutes({
    grade: signal.grade,
    confidence: signal.confidence,
    phase: signal.entry?.phase,
    session: signal.entry?.session
  });
  saveFingerprint(fingerprint, {
    fingerprint,
    createdAt: Date.now(),
    expiresAt: Date.now() + cooldownMinutes * 60 * 1000
  });
  return { fingerprint, cooldownMinutes };
}

function logTradeFromSignal(signal, ai = {}, diagnostics = {}) {
  const id = crypto.randomUUID();
  const trade = {
    id,
    symbol: signal.symbol,
    bias: ai.refinedBias || signal.HTF?.bias,
    model: ai.refinedModel || signal.entry?.model,
    session: signal.entry?.session,
    side: signal.entry?.side,
    entry: signal.entry?.entryRange,
    sl: signal.entry?.stopLoss,
    tp1: signal.entry?.takeProfit1,
    tp2: signal.entry?.takeProfit2,
    phase: signal.entry?.phase,
    score: signal.score,
    confidence: signal.confidence,
    grade: signal.grade,
    result: 'pending',
    aiProvider: ai.provider || 'fallback',
    aiNotes: ai.notes || '',
    diagnostics,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  appendTrade(trade);
  return trade;
}

function updateTradeResult(id, result, metadata = {}) {
  return updateTrade(id, { result, resultMeta: metadata });
}

function autoResolvePendingTrades(price, timestamp = new Date().toISOString(), maxAgeHours = 48) {
  if (!Number.isFinite(Number(price))) return [];
  const db = readDb();
  const now = Date.now();
  const updates = [];

  for (const trade of db.trades) {
    if (trade.result !== 'pending') continue;
    const ageHours = (now - new Date(trade.createdAt).getTime()) / 36e5;
    if (ageHours > maxAgeHours) continue;

    const side = trade.side;
    const sl = Number(trade.sl);
    const tp1 = Number(trade.tp1);
    const current = Number(price);
    let result = null;

    if (side === 'buy') {
      if (current <= sl) result = 'loss';
      else if (current >= tp1) result = 'win';
    } else if (side === 'sell') {
      if (current >= sl) result = 'loss';
      else if (current <= tp1) result = 'win';
    }

    if (result) {
      trade.result = result;
      trade.resultMeta = { resolvedBy: 'price_update', price: current, timestamp };
      trade.updatedAt = new Date().toISOString();
      updates.push({ id: trade.id, result });
    }
  }

  if (updates.length) {
    db.trades = db.trades;
    require('./database').writeDb(db);
  }

  return updates;
}

module.exports = {
  buildFingerprint,
  computeCooldownMinutes,
  isDuplicateSignal,
  reserveSignalFingerprint,
  logTradeFromSignal,
  updateTradeResult,
  autoResolvePendingTrades
};

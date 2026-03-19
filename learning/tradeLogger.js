const crypto = require('crypto');
const { appendTrade, getFingerprint, saveFingerprint, readDb, writeDb } = require('./database');

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

  const now = Date.now();
  if (now < existing.expiresAt) {
    return { duplicate: true, fingerprint, existing };
  }

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
  const now = Date.now();
  saveFingerprint(fingerprint, {
    symbol: signal.symbol,
    createdAt: now,
    cooldownMinutes,
    expiresAt: now + cooldownMinutes * 60 * 1000
  });
  return { fingerprint, cooldownMinutes };
}

function logTradeFromSignal(signal, ai = {}) {
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    symbol: signal.symbol,
    model: signal.entry?.model,
    session: signal.entry?.session,
    phase: signal.entry?.phase,
    bias: signal.HTF?.bias,
    entry: signal.entry?.entryPrice,
    entryRange: signal.entry?.entryRange,
    SL: signal.entry?.stopLoss,
    TP1: signal.entry?.takeProfit1,
    TP2: signal.entry?.takeProfit2,
    result: 'pending',
    score: signal.score,
    confidence: signal.confidence,
    grade: signal.grade,
    qualityScore: signal.qualityScore,
    aiProvider: ai.provider || 'fallback',
    aiConfirmed: !!ai.confirmed,
    aiNotes: ai.notes || ''
  };
  return appendTrade(record);
}

function updateTradeResult(id, result) {
  const db = readDb();
  const idx = db.trades.findIndex(t => t.id === id);
  if (idx === -1) return null;
  db.trades[idx].result = result;
  db.trades[idx].updatedAt = new Date().toISOString();
  writeDb(db);
  return db.trades[idx];
}

module.exports = {
  buildFingerprint,
  computeCooldownMinutes,
  isDuplicateSignal,
  reserveSignalFingerprint,
  logTradeFromSignal,
  updateTradeResult
};

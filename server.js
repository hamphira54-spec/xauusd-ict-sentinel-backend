require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { analyzeICT } = require('./ict/ictEngine');
const { ensureDb, readDb } = require('./learning/database');
const { analyzePerformance } = require('./learning/performanceAnalyzer');
const { getAdaptiveBoost } = require('./learning/adaptiveWeights');
const { isDuplicateSignal, reserveSignalFingerprint, logTradeFromSignal, updateTradeResult, autoResolvePendingTrades } = require('./learning/tradeLogger');
const { validateStructuredAnalysis } = require('./services/aiRouter');
const { sendTelegramSignal } = require('./services/telegram');

ensureDb();
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

function requireApiKey(req, res, next) {
  const provided = req.headers['x-extension-api-key'];
  const expected = process.env.EXTENSION_API_KEY;
  if (!expected || provided !== expected) return res.status(401).json({ ok: false, error: 'Unauthorized extension key' });
  next();
}

function isWeekday(date = new Date()) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function strictSniperPass(analysis) {
  return (
    (analysis.grade === 'A++' || analysis.grade === 'A+++') &&
    analysis.confidence >= 85 &&
    analysis.qualityScore >= 85 &&
    /London|New York|Overlap/.test(analysis.entry?.session || '') &&
    isWeekday()
  );
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'xauusd-ict-sentinel-v2', time: new Date().toISOString() });
});

app.get('/api/performance', (req, res) => {
  const db = readDb();
  res.json(analyzePerformance(db.trades));
});

app.post('/api/price-update', requireApiKey, (req, res) => {
  const updates = autoResolvePendingTrades(Number(req.body?.price), req.body?.timestamp, Number(process.env.PENDING_MAX_AGE_HOURS || 48));
  res.json({ ok: true, resolved: updates.length, updates });
});

app.post('/api/trades/:id/result', (req, res) => {
  const trade = updateTradeResult(req.params.id, req.body?.result, { manual: true });
  if (!trade) return res.status(404).json({ ok: false, error: 'Trade not found' });
  res.json({ ok: true, trade });
});

app.post('/api/scan', requireApiKey, async (req, res) => {
  try {
    if ((req.body?.symbol || '').toUpperCase() !== 'XAUUSD') return res.status(400).json({ ok: false, error: 'Only XAUUSD is supported' });

    const trades = readDb().trades;
    const bootstrapModel = req.body?.ltfData?.['1M']?.modelHint || req.body?.ltfData?.['5M']?.modelHint || '';
    const adaptiveBoost = getAdaptiveBoost(trades, bootstrapModel);
    const analysis = analyzeICT(req.body, adaptiveBoost);

    const ai = await validateStructuredAnalysis(analysis, process.env);
    analysis.confidence = Math.max(0, Math.min(100, analysis.confidence + Number(ai.confidenceAdjustment || 0)));

    if (!strictSniperPass(analysis) || !ai.confirmed) {
      return res.json({ ok: true, status: 'rejected_by_sniper_mode', analysis, ai });
    }

    const duplicate = isDuplicateSignal(analysis);
    if (duplicate.duplicate) {
      return res.json({ ok: true, status: 'duplicate_blocked', analysis, ai, duplicate });
    }

    const { cooldownMinutes, fingerprint } = reserveSignalFingerprint(analysis);
    const trade = logTradeFromSignal(analysis, ai, req.body?.diagnostics || {});
    const telegram = await sendTelegramSignal(analysis, ai, cooldownMinutes, process.env);

    if (process.env.AUTO_UPDATE_RESULTS === 'true') {
      autoResolvePendingTrades(Number(req.body?.price || analysis.LTF.price), req.body?.timestamp, Number(process.env.PENDING_MAX_AGE_HOURS || 48));
    }

    return res.json({
      ok: true,
      status: 'signal_sent',
      fingerprint,
      cooldownMinutes,
      telegram,
      trade,
      analysis,
      ai
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, stack: process.env.NODE_ENV === 'production' ? undefined : error.stack });
  }
});

app.get('/', (req, res) => res.redirect('/dashboard'));
app.listen(PORT, () => console.log(`XAUUSD ICT Sentinel v2 listening on ${PORT}`));

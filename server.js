require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { analyzeICT } = require('./ict/ictEngine');
const { ensureDb, readDb } = require('./learning/database');
const { analyzePerformance } = require('./learning/performanceAnalyzer');
const { getAdaptiveBoost } = require('./learning/adaptiveWeights');
const { isDuplicateSignal, reserveSignalFingerprint, logTradeFromSignal, updateTradeResult } = require('./learning/tradeLogger');
const { validateStructuredAnalysis } = require('./services/aiRouter');
const { sendTelegramSignal } = require('./services/telegram');

ensureDb();
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

function requireApiKey(req, res, next) {
  const provided = req.headers['x-extension-api-key'];
  const expected = process.env.EXTENSION_API_KEY;
  if (!expected || provided !== expected) {
    return res.status(401).json({ ok: false, error: 'Unauthorized extension key' });
  }
  next();
}

function isWeekday(date = new Date()) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function strictSniperPass(analysis, ai) {
  return (
    (analysis.grade === 'A++' || analysis.grade === 'A+++') &&
    analysis.confidence >= 85 &&
    analysis.qualityScore >= 85 &&
    analysis.entry.sessionAllowed &&
    isWeekday(new Date()) &&
    ai.confirmed
  );
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'XAUUSD ICT Sentinel', time: new Date().toISOString() });
});

app.get('/config', requireApiKey, (req, res) => {
  res.json({
    ok: true,
    symbol: 'XAUUSD',
    autoScanMinutes: 15,
    timeframes: ['1W', '1H', '15M', '5M', '1M'],
    sniperMode: true
  });
});

app.get('/dashboard-data', (req, res) => {
  const stats = analyzePerformance(readDb().trades || []);
  res.json({ ok: true, ...stats });
});

app.post('/trade-result', requireApiKey, (req, res) => {
  const { id, result } = req.body || {};
  if (!id || !['win', 'loss', 'pending'].includes(result)) {
    return res.status(400).json({ ok: false, error: 'id and valid result are required' });
  }
  const updated = updateTradeResult(id, result);
  if (!updated) return res.status(404).json({ ok: false, error: 'Trade not found' });
  res.json({ ok: true, trade: updated });
});

app.post('/scan', requireApiKey, async (req, res) => {
  try {
    const payload = req.body || {};
    if (payload.symbol !== 'XAUUSD') {
      return res.status(400).json({ ok: false, error: 'Only XAUUSD is supported' });
    }

    const stats = analyzePerformance(readDb().trades || []);
    const boostFn = getAdaptiveBoost(stats.modelPerformance || []);
    let analysis = analyzeICT(payload, 0);
    analysis = analyzeICT(payload, boostFn(analysis.entry?.model));

    const duplicateCheck = isDuplicateSignal(analysis);
    if (duplicateCheck.duplicate) {
      return res.json({
        ok: true,
        status: 'duplicate_blocked',
        fingerprint: duplicateCheck.fingerprint,
        duplicateMeta: duplicateCheck.existing,
        analysis
      });
    }

    const ai = await validateStructuredAnalysis(analysis, process.env);
    analysis.confidence = Math.max(0, Math.min(100, analysis.confidence + Number(ai.confidenceAdjustment || 0)));
    if (ai.refinedBias) analysis.HTF.bias = ai.refinedBias;
    if (ai.refinedModel && analysis.entry) analysis.entry.model = ai.refinedModel;

    const sniperPass = strictSniperPass(analysis, ai);
    if (!sniperPass) {
      return res.json({
        ok: true,
        status: 'rejected_by_sniper_mode',
        analysis,
        ai
      });
    }

    const { cooldownMinutes, fingerprint } = reserveSignalFingerprint(analysis);
    const trade = logTradeFromSignal(analysis, ai);
    const telegram = await sendTelegramSignal(analysis, ai, cooldownMinutes, process.env);

    return res.json({
      ok: true,
      status: 'signal_sent',
      fingerprint,
      cooldownMinutes,
      trade,
      telegram,
      analysis,
      ai
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
  }
});

app.get('/', (req, res) => {
  res.type('html').send('<h2>XAUUSD ICT Sentinel</h2><p>Service online. Dashboard: <a href="/dashboard">/dashboard</a></p>');
});

app.listen(PORT, () => {
  console.log(`XAUUSD ICT Sentinel listening on ${PORT}`);
});

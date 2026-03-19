import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const EXTENSION_API_KEY = process.env.EXTENSION_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const SNIPER_MODE = {
  enabled: true,
  minConfidence: 85,
  minQualityScore: 85,
  allowedGrades: new Set(['A++', 'A+++']),
  sessions: new Set(['London', 'NewYork', 'Overlap']),
  weekdaysOnly: true
};

const ADAPTIVE_COOLDOWN = {
  defaultMinutes: 45,
  consolidationMinutes: 60,
  retracementMinutes: 40,
  continuationMinutes: 45,
  reversalMinutes: 30,
  expansionMinutes: 25,
  aPlusPlusPlusBonusMinutes: -10,
  overlapBonusMinutes: -5,
  minMinutes: 15,
  maxMinutes: 90
};

const recentSignalCache = new Map();

app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN }));
app.use(express.json({ limit: '50mb' }));

function nowUtcIso() {
  return new Date().toISOString();
}

function isWeekdayUTC(date = new Date()) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function getSessionUTC(date = new Date()) {
  const h = date.getUTCHours();
  if (h >= 6 && h < 10) return 'London';
  if (h >= 10 && h < 12) return 'Overlap';
  if (h >= 12 && h < 16) return 'NewYork';
  return isWeekdayUTC(date) ? 'Other' : 'Closed';
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isXauusdLike(symbol) {
  const s = normalizeSymbol(symbol);
  return s.includes('XAUUSD') || s === 'GOLD';
}

function normalizeTfKey(key) {
  const raw = String(key || '').trim().toUpperCase();
  const map = {
    '1W': '1W', '1WK': '1W', '1WEEK': '1W', 'W': '1W',
    '1H': '1H', '60': '1H', '60M': '1H', '1HR': '1H', '1HOUR': '1H',
    '15': '15M', '15M': '15M', '15MIN': '15M', '15MINUTE': '15M',
    '5': '5M', '5M': '5M', '5MIN': '5M', '5MINUTE': '5M',
    '1': '1M', '1M': '1M', '1MIN': '1M', '1MINUTE': '1M',
    'ACTIVE': 'ACTIVE'
  };
  return map[raw] || raw;
}

function looksLikeImageData(value) {
  return typeof value === 'string' && (
    value.startsWith('data:image/') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  );
}

function normalizeScreenshotMap(body) {
  const out = {};
  const add = (key, value) => {
    if (!value || !looksLikeImageData(value)) return;
    out[normalizeTfKey(key)] = value;
  };

  const candidates = [body?.screenshots, body?.images, body?.timeframes];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => {
        if (typeof item === 'string') {
          add(`ACTIVE_${index + 1}`, item);
          return;
        }
        if (item && typeof item === 'object') {
          add(item.timeframe || item.tf || item.label || item.name || `ACTIVE_${index + 1}`,
            item.image || item.dataUrl || item.data || item.screenshot || item.url || '');
        }
      });
    } else if (candidate && typeof candidate === 'object') {
      for (const [key, value] of Object.entries(candidate)) {
        if (typeof value === 'string') add(key, value);
        else if (value && typeof value === 'object') {
          add(key, value.image || value.dataUrl || value.data || value.screenshot || value.url || '');
        }
      }
    }
  }

  if (body?.screenshot && looksLikeImageData(body.screenshot)) add('ACTIVE', body.screenshot);
  return out;
}

function makeFallbackSignal({ symbol, session, screenshotCount, warning }) {
  return {
    ok: true,
    pair: normalizeSymbol(symbol || 'XAUUSD') || 'XAUUSD',
    bias: 'neutral',
    setupCategory: 'continuation',
    modelDetected: 'FVG Continuation',
    grade: 'A+',
    qualityScore: 70,
    confidence: 40,
    entryRange: { min: 0, max: 0 },
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    session,
    liquidityEvent: 'Unavailable in fallback mode',
    nextTarget: 'Unavailable in fallback mode',
    reasoning: [warning || 'Fallback mode used.', `Received ${screenshotCount} screenshot(s).`],
    warning: warning || null,
    timestampUtc: nowUtcIso(),
    marketPhase: 'unknown',
    cooldownMinutes: ADAPTIVE_COOLDOWN.defaultMinutes
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJson(text) {
  if (!text) return null;
  const direct = safeJsonParse(text);
  if (direct) return direct;
  const match = String(text).match(/\{[\s\S]*\}/);
  return match ? safeJsonParse(match[0]) : null;
}

function buildPrompt({ symbol, session, screenshotKeys }) {
  return `You are an ICT trading analysis engine.
Analyze ONLY the provided chart screenshots for ${symbol}.
The screenshots may represent these timeframes: ${screenshotKeys.join(', ') || 'ACTIVE'}.
Determine directional bias and classify the setup into one of these models only:
Liquidity Sweep + Displacement + FVG Reversal; Turtle Soup Reversal; Unicorn Reversal; Breaker Block Reversal; Silver Bullet Reversal; AMD + FVG Reversal Sniper; FVG Continuation; Order Block Continuation; Breaker Continuation; Mitigation Block Continuation; Power of Three Continuation.
Return STRICT JSON only with this shape:
{"pair":"XAUUSD","bias":"bullish|bearish|neutral","setupCategory":"reversal|continuation","modelDetected":"string","grade":"A|A+|A++|A+++","qualityScore":0,"confidence":0,"entryRange":{"min":0,"max":0},"stopLoss":0,"tp1":0,"tp2":0,"session":"${session}","liquidityEvent":"string","nextTarget":"string","reasoning":["string"],"warning":"string or null"}
Be conservative. Use numbers only for prices.`;
}

async function callOpenAI({ symbol, session, screenshots }) {
  const content = [{ type: 'input_text', text: buildPrompt({ symbol, session, screenshotKeys: Object.keys(screenshots) }) }];
  for (const [tf, image] of Object.entries(screenshots)) {
    content.push({ type: 'input_text', text: `Timeframe: ${tf}` });
    content.push({ type: 'input_image', image_url: image });
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model: OPENAI_MODEL, input: [{ role: 'user', content }] })
  });

  const json = await response.json();
  if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${JSON.stringify(json)}`);

  const outputText =
    json.output_text ||
    (Array.isArray(json.output)
      ? json.output
          .map((item) => Array.isArray(item?.content) ? item.content.map((c) => c?.text || '').join(' ') : '')
          .join(' ')
      : '');

  const parsed = extractJson(outputText);
  if (!parsed) throw new Error(`Could not parse OpenAI JSON output: ${outputText}`);
  return parsed;
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  const json = await response.json();
  if (!response.ok || !json.ok) throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
}

function detectMarketPhase(signal) {
  const model = String(signal.modelDetected || '').toLowerCase();
  const reasoning = Array.isArray(signal.reasoning) ? signal.reasoning.join(' ').toLowerCase() : '';

  if (model.includes('reversal') || reasoning.includes('liquidity sweep') || reasoning.includes('change of character') || reasoning.includes('market structure shift')) return 'reversal';
  if (model.includes('continuation')) return 'continuation';
  if (reasoning.includes('displacement') || reasoning.includes('expansion') || reasoning.includes('impulsive move')) return 'expansion';
  if (reasoning.includes('retracement') || reasoning.includes('pullback') || reasoning.includes('discount') || reasoning.includes('premium')) return 'retracement';
  if (reasoning.includes('range-bound') || reasoning.includes('consolidation') || reasoning.includes('sideways')) return 'consolidation';
  return 'unknown';
}

function computeAdaptiveCooldownMinutes(signal) {
  const phase = signal.marketPhase || detectMarketPhase(signal);
  let minutes = ADAPTIVE_COOLDOWN.defaultMinutes;

  if (phase === 'consolidation') minutes = ADAPTIVE_COOLDOWN.consolidationMinutes;
  else if (phase === 'retracement') minutes = ADAPTIVE_COOLDOWN.retracementMinutes;
  else if (phase === 'continuation') minutes = ADAPTIVE_COOLDOWN.continuationMinutes;
  else if (phase === 'reversal') minutes = ADAPTIVE_COOLDOWN.reversalMinutes;
  else if (phase === 'expansion') minutes = ADAPTIVE_COOLDOWN.expansionMinutes;

  if (signal.grade === 'A+++') minutes += ADAPTIVE_COOLDOWN.aPlusPlusPlusBonusMinutes;
  if (signal.session === 'Overlap') minutes += ADAPTIVE_COOLDOWN.overlapBonusMinutes;
  if ((signal.confidence || 0) >= 92 && (signal.qualityScore || 0) >= 92) minutes -= 5;

  minutes = Math.max(ADAPTIVE_COOLDOWN.minMinutes, minutes);
  minutes = Math.min(ADAPTIVE_COOLDOWN.maxMinutes, minutes);
  return minutes;
}

function signalFingerprint(signal) {
  return [
    signal.pair || 'XAUUSD',
    signal.bias || 'neutral',
    signal.modelDetected || 'unknown',
    signal.entryRange?.min ?? 0,
    signal.entryRange?.max ?? 0,
    signal.marketPhase || 'unknown'
  ].join('|');
}

function isCooldownActive(signal) {
  const existing = recentSignalCache.get(signalFingerprint(signal));
  if (!existing) return false;
  const ageMs = Date.now() - existing.sentAt;
  return ageMs < existing.cooldownMinutes * 60 * 1000;
}

function markSignalSent(signal) {
  const cooldownMinutes = computeAdaptiveCooldownMinutes(signal);
  recentSignalCache.set(signalFingerprint(signal), { sentAt: Date.now(), cooldownMinutes });

  const maxAge = ADAPTIVE_COOLDOWN.maxMinutes * 60 * 1000 * 2;
  for (const [k, v] of recentSignalCache.entries()) {
    if (Date.now() - v.sentAt > maxAge) recentSignalCache.delete(k);
  }
  return cooldownMinutes;
}

function shouldSendTelegram(signal) {
  if (!SNIPER_MODE.enabled) return true;
  if (SNIPER_MODE.weekdaysOnly && !isWeekdayUTC()) return false;
  if (!SNIPER_MODE.sessions.has(signal.session)) return false;
  if (!SNIPER_MODE.allowedGrades.has(signal.grade)) return false;
  if ((signal.confidence || 0) < SNIPER_MODE.minConfidence) return false;
  if ((signal.qualityScore || 0) < SNIPER_MODE.minQualityScore) return false;
  if (isCooldownActive(signal)) return false;
  return true;
}

function formatTelegramSignal(signal) {
  return [
    `🎯 <b>${signal.pair}</b> — <b>${signal.grade}</b>`,
    `Bias: <b>${signal.bias}</b>`,
    `Model: <b>${signal.modelDetected}</b>`,
    `Phase: <b>${signal.marketPhase || 'unknown'}</b>`,
    `Category: <b>${signal.setupCategory}</b>`,
    `Confidence: <b>${signal.confidence}</b>`,
    `Quality Score: <b>${signal.qualityScore}</b>`,
    `Entry: <b>${signal.entryRange?.min} - ${signal.entryRange?.max}</b>`,
    `SL: <b>${signal.stopLoss}</b>`,
    `TP1: <b>${signal.tp1}</b>`,
    `TP2: <b>${signal.tp2}</b>`,
    `Session: <b>${signal.session}</b>`,
    `Liquidity: ${signal.liquidityEvent || 'N/A'}`,
    `Next Target: ${signal.nextTarget || 'N/A'}`,
    `Cooldown: <b>${signal.cooldownMinutes || ADAPTIVE_COOLDOWN.defaultMinutes} min</b>`,
    '',
    `<b>Reasoning</b>`,
    ...(Array.isArray(signal.reasoning) ? signal.reasoning.map((r) => `• ${r}`) : []),
    signal.warning ? `\n⚠️ Warning: ${signal.warning}` : ''
  ].filter(Boolean).join('\n');
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'xauusd-ict-sentinel-backend',
    utc: nowUtcIso(),
    weekdayAllowed: isWeekdayUTC(),
    session: getSessionUTC(),
    openaiConfigured: Boolean(OPENAI_API_KEY),
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    model: OPENAI_MODEL,
    sniperMode: {
      enabled: SNIPER_MODE.enabled,
      minConfidence: SNIPER_MODE.minConfidence,
      minQualityScore: SNIPER_MODE.minQualityScore,
      sessions: Array.from(SNIPER_MODE.sessions),
      allowedGrades: Array.from(SNIPER_MODE.allowedGrades)
    },
    adaptiveCooldown: {
      enabled: true,
      defaultMinutes: ADAPTIVE_COOLDOWN.defaultMinutes,
      minMinutes: ADAPTIVE_COOLDOWN.minMinutes,
      maxMinutes: ADAPTIVE_COOLDOWN.maxMinutes
    }
  });
});

app.post('/api/scan', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '') || '';
    if (EXTENSION_API_KEY && apiKey !== EXTENSION_API_KEY) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const body = req.body || {};
    const symbol = normalizeSymbol(body.symbol || 'XAUUSD');
    const screenshots = normalizeScreenshotMap(body);
    const screenshotKeys = Object.keys(screenshots);
    const session = getSessionUTC();

    if (body.symbol && !isXauusdLike(symbol)) {
      return res.status(400).json({ ok: false, error: 'Only XAUUSD is supported', receivedSymbol: body.symbol });
    }

    if (!screenshotKeys.length) {
      return res.status(400).json({ ok: false, error: 'At least one screenshot is required', receivedKeys: Object.keys(body || {}) });
    }

    if (SNIPER_MODE.enabled) {
      if (SNIPER_MODE.weekdaysOnly && !isWeekdayUTC()) {
        return res.json(makeFallbackSignal({ symbol, session, screenshotCount: screenshotKeys.length, warning: 'Skipped: outside weekday window.' }));
      }
      if (!SNIPER_MODE.sessions.has(session)) {
        return res.json(makeFallbackSignal({ symbol, session, screenshotCount: screenshotKeys.length, warning: 'Skipped: outside sniper session window.' }));
      }
    }

    if (!OPENAI_API_KEY) {
      return res.json(makeFallbackSignal({ symbol, session, screenshotCount: screenshotKeys.length, warning: 'OPENAI_API_KEY is missing.' }));
    }

    const aiSignal = await callOpenAI({ symbol: 'XAUUSD', session, screenshots });
    const signal = {
      ok: true,
      pair: 'XAUUSD',
      bias: aiSignal.bias || 'neutral',
      setupCategory: aiSignal.setupCategory || 'continuation',
      modelDetected: aiSignal.modelDetected || 'FVG Continuation',
      grade: aiSignal.grade || 'A',
      qualityScore: Number(aiSignal.qualityScore || 0),
      confidence: Number(aiSignal.confidence || 0),
      entryRange: {
        min: Number(aiSignal.entryRange?.min || 0),
        max: Number(aiSignal.entryRange?.max || 0)
      },
      stopLoss: Number(aiSignal.stopLoss || 0),
      tp1: Number(aiSignal.tp1 || 0),
      tp2: Number(aiSignal.tp2 || 0),
      session: aiSignal.session || session,
      liquidityEvent: aiSignal.liquidityEvent || 'N/A',
      nextTarget: aiSignal.nextTarget || 'N/A',
      reasoning: Array.isArray(aiSignal.reasoning) ? aiSignal.reasoning : ['OpenAI response received.'],
      warning: aiSignal.warning ?? null,
      timestampUtc: nowUtcIso()
    };

    signal.marketPhase = detectMarketPhase(signal);
    signal.cooldownMinutes = computeAdaptiveCooldownMinutes(signal);

    const strictMode = body.strictGradeMode ?? body.meta?.strictMode ?? true;
    const telegramMirroring = body.telegramMirroringEnabled ?? body.meta?.telegramMirroring ?? true;

    if (telegramMirroring && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        const strictAllowed = !strictMode || SNIPER_MODE.allowedGrades.has(signal.grade);
        const sniperAllowed = shouldSendTelegram(signal);
        if (strictAllowed && sniperAllowed) {
          signal.cooldownMinutes = markSignalSent(signal);
          await sendTelegramMessage(formatTelegramSignal(signal));
          console.log('Telegram sent');
        } else {
          console.log('Telegram skipped', {
            strictAllowed,
            sniperAllowed,
            grade: signal.grade,
            confidence: signal.confidence,
            qualityScore: signal.qualityScore,
            session: signal.session
          });
        }
      } catch (err) {
        console.error('Telegram error:', err?.message || err);
      }
    }

    return res.json(signal);
  } catch (err) {
    console.error('SCAN ERROR:', err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

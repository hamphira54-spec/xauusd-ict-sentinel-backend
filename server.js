
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.EXTENSION_API_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const STRICT_WEEKDAY_ONLY = String(process.env.STRICT_WEEKDAY_ONLY || 'false').toLowerCase() === 'true';
const ENABLE_TELEGRAM = String(process.env.ENABLE_TELEGRAM || 'true').toLowerCase() !== 'false';
const dedupeCache = new Map();

app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN }));
app.use(express.json({ limit: '35mb' }));

function isWeekdayUtc(date = new Date()) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function detectSessionUtc(date = new Date()) {
  const total = date.getUTCHours() * 60 + date.getUTCMinutes();
  const londonStart = 7 * 60;
  const londonEnd = 10 * 60 + 30;
  const nyStart = 12 * 60 + 30;
  const nyEnd = 16 * 60;
  const overlapStart = 12 * 60 + 30;
  const overlapEnd = 14 * 60;
  if (total >= overlapStart && total <= overlapEnd) return 'Overlap';
  if (total >= londonStart && total <= londonEnd) return 'London';
  if (total >= nyStart && total <= nyEnd) return 'NewYork';
  return 'Other';
}

function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  const incoming = req.headers['x-api-key'];
  if (incoming !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

function normalizePayload(body = {}) {
  const pair = String(body.pair || body.symbol || '').toUpperCase();
  let shots = [];

  if (Array.isArray(body.screenshots)) {
    shots = body.screenshots
      .filter(Boolean)
      .map((shot, index) => ({
        timeframe: String(shot.timeframe || shot.tf || body.timeframe || `SHOT_${index + 1}`).toUpperCase(),
        dataUrl: shot.dataUrl || shot.image || shot.screenshot || null,
        note: shot.note || null
      }))
      .filter((s) => typeof s.dataUrl === 'string' && s.dataUrl.startsWith('data:image/'));
  }

  if (!shots.length && typeof body.screenshot === 'string' && body.screenshot.startsWith('data:image/')) {
    shots = [{ timeframe: String(body.timeframe || 'CURRENT').toUpperCase(), dataUrl: body.screenshot }];
  }

  return {
    pair,
    pageState: body.pageState || {},
    strictGradeMode: body.strictGradeMode !== false,
    telegramMirroringEnabled: body.telegramMirroringEnabled !== false,
    timestampUtc: body.timestampUtc || new Date().toISOString(),
    source: body.source || 'unknown',
    screenshots: shots
  };
}

function validatePayload(payload) {
  if (payload.pair !== 'XAUUSD') return 'Only XAUUSD is supported';
  if (!Array.isArray(payload.screenshots) || !payload.screenshots.length) return 'At least one screenshot is required';
  return null;
}

function cleanupDedupeCache() {
  const now = Date.now();
  for (const [key, expires] of dedupeCache.entries()) {
    if (expires <= now) dedupeCache.delete(key);
  }
}

function rememberSignal(signal) {
  cleanupDedupeCache();
  const material = `${signal.pair}|${signal.bias}|${signal.modelDetected}|${signal.entryRange?.min}|${signal.entryRange?.max}|${signal.stopLoss}|${signal.tp1}|${signal.tp2}`;
  const key = crypto.createHash('sha1').update(material).digest('hex');
  if (dedupeCache.has(key)) return false;
  dedupeCache.set(key, Date.now() + 10 * 60 * 1000);
  return true;
}

function fallbackSignal(payload, reason = 'Fallback mode') {
  const now = new Date();
  return {
    ok: true,
    pair: 'XAUUSD',
    bias: 'neutral',
    setupCategory: 'continuation',
    modelDetected: 'FVG Continuation',
    grade: 'REJECT',
    qualityScore: 40,
    confidence: 40,
    entryRange: { min: 0, max: 0 },
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    session: detectSessionUtc(now),
    liquidityEvent: 'Unavailable in fallback mode',
    nextTarget: 'Unavailable in fallback mode',
    reasoning: [reason, `Received ${payload.screenshots.length} screenshot(s).`, 'Configure OpenAI and test with clean chart images.'],
    warning: 'Fallback mode only. Do not use as a live trading signal.',
    timeframeContext: {
      weekly: 'Unavailable',
      hourly: 'Unavailable',
      m15: 'Unavailable',
      m5: 'Unavailable',
      m1: 'Unavailable'
    },
    timestampUtc: now.toISOString(),
    scanId: `scan_${Date.now()}`,
    rawScreenshotCount: payload.screenshots.length
  };
}

function signalSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      pair: { type: 'string' },
      bias: { type: 'string' },
      setupCategory: { type: 'string' },
      modelDetected: { type: 'string' },
      grade: { type: 'string' },
      qualityScore: { type: 'number' },
      confidence: { type: 'number' },
      entryRange: {
        type: 'object',
        additionalProperties: false,
        properties: {
          min: { type: 'number' },
          max: { type: 'number' }
        },
        required: ['min', 'max']
      },
      stopLoss: { type: 'number' },
      tp1: { type: 'number' },
      tp2: { type: 'number' },
      session: { type: 'string' },
      liquidityEvent: { type: 'string' },
      nextTarget: { type: 'string' },
      reasoning: { type: 'array', items: { type: 'string' } },
      warning: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      timeframeContext: {
        type: 'object',
        additionalProperties: false,
        properties: {
          weekly: { type: 'string' },
          hourly: { type: 'string' },
          m15: { type: 'string' },
          m5: { type: 'string' },
          m1: { type: 'string' }
        },
        required: ['weekly', 'hourly', 'm15', 'm5', 'm1']
      }
    },
    required: ['pair', 'bias', 'setupCategory', 'modelDetected', 'grade', 'qualityScore', 'confidence', 'entryRange', 'stopLoss', 'tp1', 'tp2', 'session', 'liquidityEvent', 'nextTarget', 'reasoning', 'warning', 'timeframeContext']
  };
}

function buildPrompt(payload) {
  return [
    'You are XAUUSD ICT Sentinel, a strict ICT screenshot analysis engine.',
    'Analyze only XAUUSD chart screenshots from TradingView.',
    'Your job is to identify whether there is a strong ICT setup.',
    'Only these models are allowed:',
    'Reversal: Liquidity Sweep + Displacement + FVG Reversal; Turtle Soup Reversal; Unicorn Reversal; Breaker Block Reversal; Silver Bullet Reversal; AMD + FVG Reversal Sniper.',
    'Continuation: FVG Continuation; Order Block Continuation; Breaker Continuation; Mitigation Block Continuation; Power of Three Continuation.',
    'If the setup is weak, unclear, missing key evidence, or not A++ / A+++, return grade REJECT.',
    'Use only the visible evidence from the screenshots. Do not invent prices if unreadable.',
    'Confidence and qualityScore should be 0-100.',
    'Return only strict JSON matching the supplied schema.',
    `Current UTC session: ${detectSessionUtc()}. Weekday allowed: ${isWeekdayUtc()}.`,
    `Strict grade mode: ${payload.strictGradeMode}. Screenshot count: ${payload.screenshots.length}.`,
    `Page metadata: ${JSON.stringify(payload.pageState)}`
  ].join('\n');
}

async function callOpenAI(payload) {
  if (!OPENAI_API_KEY) {
    return fallbackSignal(payload, 'OPENAI_API_KEY is missing.');
  }

  const content = [{ type: 'input_text', text: buildPrompt(payload) }];
  for (const shot of payload.screenshots) {
    content.push({ type: 'input_text', text: `Screenshot timeframe: ${shot.timeframe}` });
    content.push({ type: 'input_image', image_url: shot.dataUrl, detail: 'high' });
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [{ role: 'user', content }],
      text: {
        format: {
          type: 'json_schema',
          name: 'xauusd_ict_signal',
          schema: signalSchema()
        }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${text}`);
  }

  const data = await response.json();
  const rawText = data.output_text || data.output?.[0]?.content?.[0]?.text || '';
  if (!rawText) {
    throw new Error('OpenAI returned no structured text output.');
  }

  const parsed = JSON.parse(rawText);
  parsed.ok = true;
  parsed.timestampUtc = new Date().toISOString();
  parsed.scanId = `scan_${Date.now()}`;
  parsed.rawScreenshotCount = payload.screenshots.length;
  return parsed;
}

function normalizeSignal(signal, payload) {
  const cleaned = {
    ok: true,
    pair: String(signal.pair || 'XAUUSD').toUpperCase(),
    bias: String(signal.bias || 'neutral').toLowerCase(),
    setupCategory: String(signal.setupCategory || 'continuation').toLowerCase(),
    modelDetected: String(signal.modelDetected || 'Unknown'),
    grade: String(signal.grade || 'REJECT').toUpperCase(),
    qualityScore: Number(signal.qualityScore || 0),
    confidence: Number(signal.confidence || 0),
    entryRange: {
      min: Number(signal.entryRange?.min || 0),
      max: Number(signal.entryRange?.max || 0)
    },
    stopLoss: Number(signal.stopLoss || 0),
    tp1: Number(signal.tp1 || 0),
    tp2: Number(signal.tp2 || 0),
    session: String(signal.session || detectSessionUtc()),
    liquidityEvent: String(signal.liquidityEvent || 'Unknown'),
    nextTarget: String(signal.nextTarget || 'Unknown'),
    reasoning: Array.isArray(signal.reasoning) ? signal.reasoning.slice(0, 6).map(String) : ['No reasoning returned'],
    warning: signal.warning == null ? null : String(signal.warning),
    timeframeContext: {
      weekly: String(signal.timeframeContext?.weekly || 'Unavailable'),
      hourly: String(signal.timeframeContext?.hourly || 'Unavailable'),
      m15: String(signal.timeframeContext?.m15 || 'Unavailable'),
      m5: String(signal.timeframeContext?.m5 || 'Unavailable'),
      m1: String(signal.timeframeContext?.m1 || 'Unavailable')
    },
    timestampUtc: signal.timestampUtc || new Date().toISOString(),
    scanId: signal.scanId || `scan_${Date.now()}`,
    rawScreenshotCount: signal.rawScreenshotCount || payload.screenshots.length
  };

  if (payload.strictGradeMode && !['A++', 'A+++'].includes(cleaned.grade)) {
    cleaned.warning = cleaned.warning || 'Strict grade mode rejected this setup.';
  }
  return cleaned;
}

async function sendTelegram(signal) {
  if (!ENABLE_TELEGRAM || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  if (!['A++', 'A+++'].includes(signal.grade)) return false;
  if (!rememberSignal(signal)) return false;

  const text = [
    `XAUUSD ICT Sentinel — ${signal.grade}`,
    `Bias: ${signal.bias}`,
    `Model: ${signal.modelDetected}`,
    `Entry: ${signal.entryRange.min} - ${signal.entryRange.max}`,
    `SL: ${signal.stopLoss}`,
    `TP1: ${signal.tp1}`,
    `TP2: ${signal.tp2}`,
    `Session: ${signal.session}`,
    `Liquidity: ${signal.liquidityEvent}`,
    `Confidence: ${signal.confidence}`,
    `Reasoning: ${signal.reasoning.join(' | ')}`,
    signal.warning ? `Warning: ${signal.warning}` : null
  ].filter(Boolean).join('\n');

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
  });
  return response.ok;
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'xauusd-ict-sentinel-backend-v2',
    utc: new Date().toISOString(),
    weekdayAllowed: isWeekdayUtc(),
    session: detectSessionUtc(),
    openaiConfigured: Boolean(OPENAI_API_KEY),
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    strictWeekdayOnly: STRICT_WEEKDAY_ONLY
  });
});

app.post('/api/scan', authMiddleware, async (req, res) => {
  try {
    const payload = normalizePayload(req.body || {});
    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({ ok: false, error: validationError });
    }

    if (STRICT_WEEKDAY_ONLY && !isWeekdayUtc()) {
      return res.json({
        ok: true,
        pair: 'XAUUSD',
        grade: 'REJECT',
        warning: 'Weekday-only mode blocked this scan.',
        session: detectSessionUtc(),
        reasoning: ['Weekend scan rejected.']
      });
    }

    const rawSignal = await callOpenAI(payload);
    const signal = normalizeSignal(rawSignal, payload);

    if (payload.telegramMirroringEnabled) {
      try { await sendTelegram(signal); } catch (e) { console.error('Telegram send failed:', e.message); }
    }

    res.json(signal);
  } catch (error) {
    console.error('SCAN ERROR:', error);
    res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`XAUUSD ICT Sentinel backend listening on ${PORT}`);
});

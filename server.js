import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.EXTENSION_API_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN }));
app.use(express.json({ limit: '25mb' }));

function isWeekdayUtc(date = new Date()) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function detectSessionUtc(date = new Date()) {
  const h = date.getUTCHours();
  const m = date.getUTCMinutes();
  const total = h * 60 + m;
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

function validateScanBody(body) {
  const requiredTf = ['1W', '1H', '15M', '5M', '1M'];
  if (!body || typeof body !== 'object') return 'Body is missing';
  if ((body.symbol || '').toUpperCase() !== 'XAUUSD') return 'Only XAUUSD is supported';
  if (!Array.isArray(body.screenshots)) return 'screenshots must be an array';
  const found = new Set(body.screenshots.map((s) => String(s.timeframe || '').toUpperCase()));
  for (const tf of requiredTf) {
    if (!found.has(tf)) return `Missing timeframe screenshot: ${tf}`;
  }
  return null;
}

function fallbackSignal(body) {
  const now = new Date();
  const session = detectSessionUtc(now);
  return {
    pair: 'XAUUSD',
    bias: 'neutral',
    setupCategory: 'reversal',
    modelDetected: 'Liquidity Sweep + Displacement + FVG Reversal',
    grade: 'A++',
    qualityScore: 86,
    confidence: 0.63,
    entryRange: { min: 0, max: 0 },
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    session,
    liquidityEvent: 'Unverified in fallback mode',
    nextTarget: 'PDH/PDL not extracted',
    reasoning: [
      'OpenAI is not configured or did not return structured output.',
      'This fallback response is for UI connectivity testing only.',
      'Do not use this as a live trading signal.'
    ],
    warning: 'Fallback mode only. Configure OPENAI_API_KEY for real analysis.',
    timeframeContext: {
      weekly: 'Weekly context unavailable in fallback mode.',
      hourly: 'Hourly bias unavailable in fallback mode.',
      m15: '15M setup unavailable in fallback mode.',
      m5: '5M confirmation unavailable in fallback mode.',
      m1: '1M trigger unavailable in fallback mode.'
    },
    timestampUtc: now.toISOString(),
    scanId: `scan_${Date.now()}`
  };
}

function buildPrompt(payload) {
  return [
    'You are XAUUSD ICT Sentinel, an ICT trade quality grader.',
    'Analyze the attached XAUUSD TradingView screenshots across 1W, 1H, 15M, 5M, and 1M.',
    'Return ONLY strict JSON.',
    'Only return grade A++ or A+++ if the setup is very strong. Otherwise set grade to REJECT.',
    'Allowed models:',
    '1. Liquidity Sweep + Displacement + FVG Reversal',
    '2. Turtle Soup Reversal',
    '3. Unicorn Reversal',
    '4. Breaker Block Reversal',
    '5. Silver Bullet Reversal',
    '6. AMD + FVG Reversal Sniper',
    '7. FVG Continuation',
    '8. Order Block Continuation',
    '9. Breaker Continuation',
    '10. Mitigation Block Continuation',
    '11. Power of Three Continuation',
    'Return schema:',
    JSON.stringify({
      pair: 'XAUUSD',
      bias: 'bullish|bearish|neutral',
      setupCategory: 'reversal|continuation',
      modelDetected: 'one of the allowed models',
      grade: 'A++|A+++|REJECT',
      qualityScore: 0,
      confidence: 0,
      entryRange: { min: 0, max: 0 },
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      session: 'London|NewYork|Overlap|Other',
      liquidityEvent: 'string',
      nextTarget: 'string',
      reasoning: ['reason1', 'reason2', 'reason3'],
      warning: 'string or null',
      timeframeContext: {
        weekly: 'string',
        hourly: 'string',
        m15: 'string',
        m5: 'string',
        m1: 'string'
      }
    }),
    `Current UTC weekday valid: ${isWeekdayUtc()}. Current session: ${detectSessionUtc()}.`,
    `Extension metadata: ${JSON.stringify({
      symbol: payload.symbol,
      strictGradeMode: payload.strictGradeMode,
      telegramMirroringEnabled: payload.telegramMirroringEnabled,
      timestampUtc: payload.timestampUtc || new Date().toISOString()
    })}`
  ].join('\n');
}

async function callOpenAI(payload) {
  if (!OPENAI_API_KEY) return fallbackSignal(payload);

  const content = [
    { type: 'input_text', text: buildPrompt(payload) }
  ];

  for (const shot of payload.screenshots) {
    content.push({
      type: 'input_text',
      text: `Timeframe ${shot.timeframe}`
    });
    content.push({
      type: 'input_image',
      image_url: shot.dataUrl,
      detail: 'high'
    });
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
          name: 'xauusd_signal',
          schema: {
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
            required: [
              'pair', 'bias', 'setupCategory', 'modelDetected', 'grade', 'qualityScore',
              'confidence', 'entryRange', 'stopLoss', 'tp1', 'tp2', 'session', 'liquidityEvent',
              'nextTarget', 'reasoning', 'warning', 'timeframeContext'
            ]
          },
          strict: true
        }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const outputText = data.output_text;
  if (!outputText) {
    throw new Error('OpenAI response did not contain output_text');
  }
  const parsed = JSON.parse(outputText);
  parsed.timestampUtc = new Date().toISOString();
  parsed.scanId = `scan_${Date.now()}`;
  return parsed;
}

async function sendTelegram(signal) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const text = [
    `📡 XAUUSD ICT Sentinel`,
    `Pair: ${signal.pair}`,
    `Grade: ${signal.grade}`,
    `Bias: ${signal.bias}`,
    `Model: ${signal.modelDetected}`,
    `Entry: ${signal.entryRange.min} - ${signal.entryRange.max}`,
    `SL: ${signal.stopLoss}`,
    `TP1: ${signal.tp1}`,
    `TP2: ${signal.tp2}`,
    `Session: ${signal.session}`,
    `Confidence: ${signal.confidence}`,
    `Liquidity: ${signal.liquidityEvent}`,
    `Target: ${signal.nextTarget}`,
    `Warning: ${signal.warning || 'None'}`
  ].join('\n');

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text })
  });
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'xauusd-ict-sentinel-backend',
    utc: new Date().toISOString(),
    weekdayAllowed: isWeekdayUtc(),
    session: detectSessionUtc(),
    openaiConfigured: Boolean(OPENAI_API_KEY),
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID)
  });
});

app.post('/api/scan', async (req, res) => {
  try {
    const body = req.body || {};
    console.log('SCAN BODY:', JSON.stringify(body, null, 2));

    const symbol = body.symbol;
    const screenshots = body.screenshots || {};

    if (symbol !== 'XAUUSD') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid symbol',
        receivedSymbol: symbol
      });
    }

    const required = ['1W', '1H', '15M', '5M', '1M'];
    const missing = required.filter(tf => !screenshots[tf]);

    if (missing.length > 0) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required screenshots',
        missing
      });
    }

    return res.json({
      ok: true,
      message: 'Scan payload accepted'
    });
  } catch (err) {
    console.error('SCAN ERROR:', err);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`XAUUSD ICT Sentinel backend listening on port ${PORT}`);
});

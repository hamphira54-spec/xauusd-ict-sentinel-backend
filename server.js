import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: true,
    credentials: false,
  })
);

app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const EXTENSION_API_KEY = process.env.EXTENSION_API_KEY || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const ALLOWED_TELEGRAM_GRADES = new Set(["A++", "A+++"]);

function nowUtcIso() {
  return new Date().toISOString();
}

function getSessionUTC(date = new Date()) {
  const h = date.getUTCHours();

  if (h >= 6 && h < 11) return "London";
  if (h >= 12 && h < 17) return "NewYork";
  if (h >= 11 && h < 12) return "Overlap";
  return "Other";
}

function weekdayAllowed(date = new Date()) {
  const day = date.getUTCDay(); // 0 sun, 6 sat
  return day >= 1 && day <= 5;
}

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function isXauusdLike(symbol) {
  const s = normalizeSymbol(symbol);
  return s.includes("XAUUSD") || s === "GOLD";
}

function normalizeTfKey(key) {
  const raw = String(key || "").trim().toUpperCase();

  const map = {
    "1W": "1W",
    "W": "1W",
    "1WK": "1W",
    "1WEEK": "1W",

    "1H": "1H",
    "60": "1H",
    "60M": "1H",
    "60MIN": "1H",

    "15": "15M",
    "15M": "15M",
    "15MIN": "15M",

    "5": "5M",
    "5M": "5M",
    "5MIN": "5M",

    "1": "1M",
    "1M": "1M",
    "1MIN": "1M",

    "ACTIVE": "ACTIVE",
  };

  return map[raw] || raw;
}

function looksLikeImageData(value) {
  return (
    typeof value === "string" &&
    (value.startsWith("data:image/") ||
      value.startsWith("http://") ||
      value.startsWith("https://"))
  );
}

function normalizeScreenshotMap(body) {
  const out = {};

  const add = (key, value) => {
    if (!value) return;
    if (!looksLikeImageData(value)) return;
    const tf = normalizeTfKey(key);
    out[tf] = value;
  };

  const candidates = [
    body?.screenshots,
    body?.images,
    body?.timeframes,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => {
        if (typeof item === "string") {
          add(`ACTIVE_${index + 1}`, item);
          return;
        }

        if (item && typeof item === "object") {
          const key =
            item.timeframe ||
            item.tf ||
            item.label ||
            item.name ||
            `ACTIVE_${index + 1}`;

          const value =
            item.image ||
            item.dataUrl ||
            item.data ||
            item.screenshot ||
            item.url ||
            "";

          add(key, value);
        }
      });
    } else if (candidate && typeof candidate === "object") {
      for (const [key, value] of Object.entries(candidate)) {
        if (typeof value === "string") {
          add(key, value);
          continue;
        }

        if (value && typeof value === "object") {
          add(
            key,
            value.image ||
              value.dataUrl ||
              value.data ||
              value.screenshot ||
              value.url ||
              ""
          );
        }
      }
    }
  }

  if (body?.screenshot && looksLikeImageData(body.screenshot)) {
    add("ACTIVE", body.screenshot);
  }

  return out;
}

function makeFallbackSignal({
  symbol,
  session,
  screenshotCount,
  warning,
}) {
  return {
    ok: true,
    pair: normalizeSymbol(symbol || "XAUUSD") || "XAUUSD",
    bias: "neutral",
    setupCategory: "continuation",
    modelDetected: "FVG Continuation",
    grade: "A+",
    qualityScore: 70,
    confidence: 40,
    entryRange: { min: 0, max: 0 },
    stopLoss: 0,
    tp1: 0,
    tp2: 0,
    session,
    liquidityEvent: "Unavailable in fallback mode",
    nextTarget: "Unavailable in fallback mode",
    reasoning: [
      warning || "Fallback mode used.",
      `Received ${screenshotCount} screenshot(s).`,
    ],
    warning: warning || null,
    timestampUtc: nowUtcIso(),
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
  if (!match) return null;

  return safeJsonParse(match[0]);
}

function buildPrompt({ symbol, session, screenshotKeys }) {
  return `
You are an ICT trading analysis engine.

Analyze ONLY the provided chart screenshots for ${symbol}.
The screenshots may represent these timeframes:
${screenshotKeys.join(", ") || "ACTIVE"}

Your task:
1. Determine directional bias.
2. Classify the setup into one of these models only:
   - Liquidity Sweep + Displacement + FVG Reversal
   - Turtle Soup Reversal
   - Unicorn Reversal
   - Breaker Block Reversal
   - Silver Bullet Reversal
   - AMD + FVG Reversal Sniper
   - FVG Continuation
   - Order Block Continuation
   - Breaker Continuation
   - Mitigation Block Continuation
   - Power of Three Continuation
3. Return only the best structured trade idea from the screenshots.
4. Be conservative. If the setup is weak, lower the grade/confidence.
5. Session context is ${session}.

Return STRICT JSON only in this exact shape:
{
  "pair": "XAUUSD",
  "bias": "bullish|bearish|neutral",
  "setupCategory": "reversal|continuation",
  "modelDetected": "string",
  "grade": "A|A+|A++|A+++",
  "qualityScore": 0,
  "confidence": 0,
  "entryRange": { "min": 0, "max": 0 },
  "stopLoss": 0,
  "tp1": 0,
  "tp2": 0,
  "session": "${session}",
  "liquidityEvent": "string",
  "nextTarget": "string",
  "reasoning": ["string", "string"],
  "warning": "string or null"
}

Rules:
- Pair must be XAUUSD
- Use numbers only for prices
- If uncertain, still return JSON but reduce confidence and grade
- No markdown
- No explanation outside JSON
`.trim();
}

async function callOpenAI({ symbol, session, screenshots }) {
  const content = [
    {
      type: "input_text",
      text: buildPrompt({
        symbol,
        session,
        screenshotKeys: Object.keys(screenshots),
      }),
    },
  ];

  for (const [tf, image] of Object.entries(screenshots)) {
    content.push({
      type: "input_text",
      text: `Timeframe: ${tf}`,
    });

    content.push({
      type: "input_image",
      image_url: image,
    });
  }

  const payload = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "user",
        content,
      },
    ],
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(
      `OpenAI API ${response.status}: ${JSON.stringify(json)}`
    );
  }

  const outputText =
    json.output_text ||
    json.output?.map((o) => o?.content?.map((c) => c?.text).join(" ")).join(" ") ||
    "";

  const parsed = extractJson(outputText);

  if (!parsed) {
    throw new Error(`Could not parse OpenAI JSON output: ${outputText}`);
  }

  return parsed;
}

async function sendTelegramMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const json = await res.json();

  if (!res.ok || !json.ok) {
    throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
  }
}

function formatTelegramSignal(signal) {
  return [
    `📡 <b>${signal.pair}</b>`,
    `Grade: <b>${signal.grade}</b>`,
    `Bias: <b>${signal.bias}</b>`,
    `Model: <b>${signal.modelDetected}</b>`,
    `Confidence: <b>${signal.confidence}</b>`,
    `Entry: <b>${signal.entryRange?.min} - ${signal.entryRange?.max}</b>`,
    `SL: <b>${signal.stopLoss}</b>`,
    `TP1: <b>${signal.tp1}</b>`,
    `TP2: <b>${signal.tp2}</b>`,
    `Session: <b>${signal.session}</b>`,
    `Liquidity: ${signal.liquidityEvent || "N/A"}`,
    `Target: ${signal.nextTarget || "N/A"}`,
    "",
    `Reasoning:`,
    ...(Array.isArray(signal.reasoning)
      ? signal.reasoning.map((r) => `• ${r}`)
      : []),
    signal.warning ? `\nWarning: ${signal.warning}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "xauusd-ict-sentinel-backend",
    utc: nowUtcIso(),
    weekdayAllowed: weekdayAllowed(),
    session: getSessionUTC(),
    openaiConfigured: Boolean(OPENAI_API_KEY),
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
    model: OPENAI_MODEL,
  });
});

app.post("/api/scan", async (req, res) => {
  try {
    const apiKey =
      req.headers["x-api-key"] ||
      req.headers["authorization"]?.replace(/^Bearer\s+/i, "") ||
      "";

    if (EXTENSION_API_KEY && apiKey !== EXTENSION_API_KEY) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    const body = req.body || {};
    const symbol = normalizeSymbol(body.symbol || "XAUUSD");
    const screenshots = normalizeScreenshotMap(body);
    const screenshotKeys = Object.keys(screenshots);
    const session = getSessionUTC();

    console.log("SCAN REQUEST KEYS:", Object.keys(body));
    console.log("SCREENSHOT KEYS:", screenshotKeys);

    if (body.symbol && !isXauusdLike(symbol)) {
      return res.status(400).json({
        ok: false,
        error: "Only XAUUSD is supported",
        receivedSymbol: body.symbol,
      });
    }

    if (!screenshotKeys.length) {
      return res.status(400).json({
        ok: false,
        error: "At least one screenshot is required",
        receivedKeys: Object.keys(body || {}),
      });
    }

    if (!OPENAI_API_KEY) {
      return res.json(
        makeFallbackSignal({
          symbol,
          session,
          screenshotCount: screenshotKeys.length,
          warning: "OPENAI_API_KEY is missing.",
        })
      );
    }

    const aiSignal = await callOpenAI({
      symbol: "XAUUSD",
      session,
      screenshots,
    });

    const signal = {
      ok: true,
      pair: "XAUUSD",
      bias: aiSignal.bias || "neutral",
      setupCategory: aiSignal.setupCategory || "continuation",
      modelDetected: aiSignal.modelDetected || "FVG Continuation",
      grade: aiSignal.grade || "A",
      qualityScore: Number(aiSignal.qualityScore || 0),
      confidence: Number(aiSignal.confidence || 0),
      entryRange: {
        min: Number(aiSignal.entryRange?.min || 0),
        max: Number(aiSignal.entryRange?.max || 0),
      },
      stopLoss: Number(aiSignal.stopLoss || 0),
      tp1: Number(aiSignal.tp1 || 0),
      tp2: Number(aiSignal.tp2 || 0),
      session: aiSignal.session || session,
      liquidityEvent: aiSignal.liquidityEvent || "N/A",
      nextTarget: aiSignal.nextTarget || "N/A",
      reasoning: Array.isArray(aiSignal.reasoning)
        ? aiSignal.reasoning
        : ["OpenAI response received."],
      warning: aiSignal.warning ?? null,
      timestampUtc: nowUtcIso(),
    };

    const strictMode =
      body.strictGradeMode ??
      body.meta?.strictMode ??
      true;

    const telegramMirroring =
      body.telegramMirroringEnabled ??
      body.meta?.telegramMirroring ??
      true;

    if (
      telegramMirroring &&
      TELEGRAM_BOT_TOKEN &&
      TELEGRAM_CHAT_ID &&
      (!strictMode || ALLOWED_TELEGRAM_GRADES.has(signal.grade))
    ) {
      try {
        await sendTelegramMessage(formatTelegramSignal(signal));
        console.log("Telegram sent");
      } catch (err) {
        console.error("Telegram error:", err?.message || err);
      }
    }

    return res.json(signal);
  } catch (err) {
    console.error("SCAN ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

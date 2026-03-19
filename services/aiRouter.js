const DEFAULT_TIMEOUT = 25000;

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${JSON.stringify(data).slice(0, 400)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function fallbackDecision(analysis) {
  const confirmed = analysis.grade === 'A++' || analysis.grade === 'A+++';
  return {
    provider: 'fallback',
    confirmed,
    confidenceAdjustment: confirmed ? 0 : -6,
    notes: confirmed ? 'Fallback accepted due to strong structured confluence.' : 'Fallback rejected due to weak structured confluence.',
    refinedModel: analysis.entry?.model,
    refinedBias: analysis.HTF?.bias
  };
}

function buildPrompt(analysis) {
  return [
    'You validate an ICT XAUUSD setup using structured market data.',
    'Do not guess. Reject weak or incomplete confluence.',
    'Return JSON only with keys: confirmed, confidenceAdjustment, notes, refinedModel, refinedBias.',
    JSON.stringify({
      symbol: analysis.symbol,
      HTF: analysis.HTF,
      LTF: {
        timeframe: analysis.LTF?.timeframe,
        price: analysis.LTF?.price,
        liquidity: analysis.LTF?.liquidity,
        displacement: analysis.LTF?.displacement,
        fvg: analysis.LTF?.fvg,
        structure: analysis.LTF?.structure,
        session: analysis.LTF?.session
      },
      entry: analysis.entry,
      score: analysis.score,
      confidence: analysis.confidence,
      grade: analysis.grade
    })
  ].join('\n');
}

async function validateWithOpenAI(analysis, env) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const data = await fetchJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a strict institutional ICT validator.' },
        { role: 'user', content: buildPrompt(analysis) }
      ]
    })
  });
  const raw = data.choices?.[0]?.message?.content || '{}';
  return { provider: 'openai', ...JSON.parse(raw) };
}

async function validateWithGemini(analysis, env) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      contents: [{ parts: [{ text: buildPrompt(analysis) }] }]
    })
  });
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return { provider: 'gemini', ...JSON.parse(raw) };
}

async function validateWithClaude(analysis, env) {
  if (!env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY missing');
  const data = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-sonnet-4-5',
      max_tokens: 300,
      temperature: 0.1,
      messages: [{ role: 'user', content: buildPrompt(analysis) }]
    })
  });
  const raw = data.content?.[0]?.text || '{}';
  return { provider: 'claude', ...JSON.parse(raw) };
}

async function validateStructuredAnalysis(analysis, env = process.env) {
  const providers = [validateWithOpenAI, validateWithGemini, validateWithClaude];
  for (const fn of providers) {
    try {
      const result = await fn(analysis, env);
      return { ...fallbackDecision(analysis), ...result };
    } catch (error) {
      // try next provider
    }
  }
  return fallbackDecision(analysis);
}

module.exports = { validateStructuredAnalysis };

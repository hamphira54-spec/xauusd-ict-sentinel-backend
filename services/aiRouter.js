const DEFAULT_TIMEOUT = 25000;

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${JSON.stringify(data).slice(0, 300)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(analysis) {
  return [
    'You are validating an ICT XAUUSD setup using structured market data.',
    'You are not allowed to guess or invent missing confluence.',
    'Return strict JSON only with keys: confirmed, confidenceAdjustment, notes, refinedModel, refinedBias.',
    'confirmed must be boolean.',
    'confidenceAdjustment must be integer from -10 to 10.',
    'notes must be short.',
    'If structured confluence is weak, set confirmed=false.',
    '',
    JSON.stringify({
      symbol: analysis.symbol,
      HTF: analysis.HTF,
      LTF: analysis.LTF,
      entry: analysis.entry,
      score: analysis.score,
      confidence: analysis.confidence,
      grade: analysis.grade
    })
  ].join('\n');
}

async function validateWithOpenAI(analysis, env) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const data = await fetchJson('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-5.4-mini',
      input: buildPrompt(analysis),
      text: { format: { type: 'json_object' } }
    })
  });

  const outputText = data.output_text || data.output?.map(x => x?.content?.map?.(c => c.text || '').join('')).join('') || '{}';
  return { provider: 'openai', ...JSON.parse(outputText || '{}') };
}

async function validateWithGemini(analysis, env) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const data = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(analysis) }] }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    })
  });
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return { provider: 'gemini', ...JSON.parse(text) };
}

async function validateWithClaude(analysis, env) {
  if (!env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY missing');
  const data = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: buildPrompt(analysis) }]
    })
  });
  const text = data.content?.[0]?.text || '{}';
  return { provider: 'claude', ...JSON.parse(text) };
}

async function validateWithFallback(analysis) {
  const confirmed = analysis.grade === 'A+++' || (analysis.grade === 'A++' && analysis.confidence >= 88 && analysis.entry?.valid);
  return {
    provider: 'fallback',
    confirmed,
    confidenceAdjustment: confirmed ? 0 : -5,
    notes: confirmed ? 'Fallback mode accepted structured setup.' : 'Fallback mode rejected weak structured setup.',
    refinedModel: analysis.entry?.model || 'none',
    refinedBias: analysis.HTF?.bias || 'neutral'
  };
}

async function validateStructuredAnalysis(analysis, env = process.env) {
  const errors = [];
  const providers = [validateWithOpenAI, validateWithGemini, validateWithClaude];
  for (const provider of providers) {
    try {
      return await provider(analysis, env);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { ...(await validateWithFallback(analysis)), errors };
}

module.exports = { validateStructuredAnalysis };

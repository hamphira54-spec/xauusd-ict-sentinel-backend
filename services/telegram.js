async function sendTelegramSignal(signal, ai, cooldownMinutes, env = process.env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { ok: false, skipped: true, reason: 'Telegram not configured' };
  }

  const lines = [
    '🚨 <b>XAUUSD ICT Sentinel</b>',
    `Grade: <b>${signal.grade}</b>`,
    `Bias: <b>${signal.HTF.bias}</b>`,
    `Model: <b>${ai.refinedModel || signal.entry.model}</b>`,
    `Entry: <b>${signal.entry.entryRange.join(' - ')}</b>`,
    `SL: <b>${signal.entry.stopLoss}</b>`,
    `TP1: <b>${signal.entry.takeProfit1}</b>`,
    `TP2: <b>${signal.entry.takeProfit2}</b>`,
    `Session: <b>${signal.entry.session}</b>`,
    `Score: <b>${signal.score}</b> | Confidence: <b>${signal.confidence}</b>`,
    `AI: <b>${ai.provider}</b> | Confirmed: <b>${ai.confirmed ? 'Yes' : 'No'}</b>`,
    `Reasoning: ${ai.notes || signal.entry.reason}`,
    `Cooldown: <b>${cooldownMinutes} min</b>`
  ];

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: lines.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });

  const data = await response.json();
  return { ok: response.ok, data };
}

module.exports = { sendTelegramSignal };

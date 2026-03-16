# XAUUSD ICT Sentinel Backend

Portable backend API for the Chrome extension.

## What it does
- Receives TradingView screenshots from the extension
- Validates XAUUSD-only scan payloads
- Sends multi-timeframe image input to OpenAI
- Returns a structured signal to the extension
- Optionally mirrors accepted A++ / A+++ signals to Telegram

## Endpoints
- `GET /health`
- `POST /api/scan`

## Minimum VPS setup
1. Ubuntu 22.04 VPS
2. Install Node.js 20+
3. Upload this folder
4. Copy `.env.example` to `.env`
5. Fill in your keys
6. Run `npm install`
7. Run `npm start`

## Local commands
```bash
npm install
cp .env.example .env
npm start
```

## Test health
Open:
```text
http://YOUR_SERVER_IP:3000/health
```

## Extension settings
In your Chrome extension options page:
- Backend Base URL: `http://YOUR_SERVER_IP:3000`
- API Key: same as `EXTENSION_API_KEY` in `.env`

## Notes
- If `OPENAI_API_KEY` is missing, the backend returns a fallback connectivity result for testing.
- Real trade analysis requires OpenAI to be configured.
- The current package is intentionally simple and portable. It is a backend starter, not a fully hardened enterprise deployment.

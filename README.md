# XAUUSD ICT Sentinel — Institutional AI Trading Assistant

Production-oriented Node.js + Express backend and Chrome Extension for structured ICT analysis on XAUUSD.

## 3-environment deployment model

### 1) Chrome Extension
- Runs locally in Google Chrome on TradingView only.
- Switches timeframes in sequence: `1W -> 1H -> 15M -> 5M -> 1M`
- Captures screenshots per timeframe.
- Extracts structured data and posts it to the backend.

### 2) Railway Backend
- Receives extension payloads.
- Runs ICT engine, scoring engine, AI routing, sniper filter, learning engine, Telegram delivery.
- Serves the dashboard at `/dashboard`.

### 3) GitHub
- Stores source code.
- Railway deploys directly from the GitHub repo.

## Project structure
- `server.js`
- `package.json`
- `ict/`
- `learning/`
- `dashboard/`
- `extension/`
- `services/`
- `trades.json`

## Environment variables
Create `.env` locally or set the same values in Railway:

```env
PORT=3000
NODE_ENV=production
BASE_URL=http://localhost:3000
EXTENSION_API_KEY=replace_me
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
CLAUDE_API_KEY=
CLAUDE_MODEL=claude-sonnet-4-5
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SESSION_TIMEZONE=Europe/London
AUTO_UPDATE_RESULTS=false
```

## Local run
```bash
npm install
cp .env.example .env
npm start
```

## Railway deployment
1. Push this project to GitHub.
2. In Railway, create a new project from that GitHub repo.
3. Add all environment variables from `.env.example`.
4. Railway will use `npm start`.
5. Confirm health endpoint: `/health`
6. Dashboard path: `/dashboard`

## GitHub -> Railway flow
```text
GitHub repo -> Railway deploy -> live backend URL -> Chrome extension settings
```

## Extension install
1. Open `chrome://extensions`
2. Enable Developer Mode.
3. Click **Load unpacked**.
4. Select the `/extension` folder.
5. Open the extension settings page.
6. Set:
   - Backend API Base URL: your Railway URL
   - Extension API Key: the same `EXTENSION_API_KEY` used in Railway

## Current extraction design
- The extension sequences timeframes and captures screenshots per timeframe.
- Structured extraction is DOM-based.
- Where raw TradingView bar access is unavailable, the extension uses a synthetic candle fallback built from visible OHLC to keep the ICT engine operational.
- For maximum production accuracy, replace that fallback with a direct TradingView series adapter tied to your own chart environment.

## API endpoints
- `GET /health`
- `GET /dashboard-data`
- `GET /config`
- `POST /scan`
- `POST /trade-result`

## Signal policy
- Only XAUUSD
- A++ and A+++ only
- Minimum score 85
- Minimum confidence 85
- London / New York session only
- Weekdays only
- Duplicate fingerprint cooldown protection enabled

## Notes
- The scoring engine is the primary decision maker.
- AI confirms or rejects structured ICT context; it does not replace the score engine.
- This is an analysis assistant, not a profitability guarantee.

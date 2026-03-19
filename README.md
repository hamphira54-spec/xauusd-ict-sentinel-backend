# XAUUSD ICT Sentinel v2 — Backend

Production-ready Node.js + Express backend for Railway.

## Features
- Structured ICT engine for HTF/LTF analysis
- Scoring engine v2 with adaptive model weighting
- AI validation router with OpenAI -> Gemini -> Claude fallback
- Sniper filtering for A++ / A+++ only
- Telegram delivery
- Learning engine with duplicate suppression and cooldown
- Auto result resolution from incoming market prices
- Dashboard at `/dashboard`

## Deploy
1. Push this `Backend` folder to GitHub.
2. Connect repo to Railway.
3. Add Railway variables from `.env.example`.
4. Deploy.

## API endpoints
- `GET /health`
- `GET /dashboard`
- `GET /api/performance`
- `POST /api/scan` (extension -> backend)
- `POST /api/price-update` (extension heartbeat / pending-trade resolution)
- `POST /api/trades/:id/result` (manual result override)

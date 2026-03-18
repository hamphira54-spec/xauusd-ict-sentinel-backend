# XAUUSD ICT Sentinel Backend v2

This is the upgraded portable backend for the Chrome extension.

## What is improved
- Accepts both `screenshots[]` payloads and single `screenshot` payloads
- XAUUSD-only validation
- OpenAI Responses API integration for screenshot reasoning
- Telegram alert mirroring for A++ / A+++ signals
- In-memory duplicate alert suppression
- Better health endpoint

## Endpoints
- `GET /health`
- `POST /api/scan`

## Required Railway / VPS variables
- `OPENAI_API_KEY`
- `EXTENSION_API_KEY`
- `TELEGRAM_BOT_TOKEN` (optional)
- `TELEGRAM_CHAT_ID` (optional)

## Notes
- Do not store or commit real keys into the repo.
- If OpenAI is not configured, the backend returns a safe fallback result.
- Telegram only sends when the grade is `A++` or `A+++`.
- Screenshot quality and chart clarity strongly affect analysis quality.

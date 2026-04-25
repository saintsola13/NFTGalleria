# NFT Galleria

A curated art gallery of the **top 25 NFT collections per chain** across Ethereum, Solana, and ApeChain. Live on-chain data via Reservoir.

> A gallery, not a marketplace. Just the art.

## Stack

- **Vite + React 18** — single-page app, ES2020 build
- **Reservoir API** — collections + tokens for ETH / Solana / ApeChain
- **Netlify Function proxy** — keeps `RESERVOIR_API_KEY` server-side
- **localStorage cache** — 5min TTL, instant revisits

## Local dev

```bash
npm install

# Run frontend + functions together (best dev exp)
npx netlify dev
# → http://localhost:8888

# Frontend only (functions won't work without netlify dev)
npm run dev
```

You'll need a `.env` (or env vars) with:

```
RESERVOIR_API_KEY=your-key-here
```

## Deploy

Push to `main` — Netlify auto-builds. Set `RESERVOIR_API_KEY` in Netlify
**Site settings → Environment variables**.

## Notes

- Collections sorted by 24h volume — the gallery is "top 25 right now"
- No floors / prices / buy buttons. This is intentional.
- Broken image URLs fall back to a halftone placeholder, no grid gaps.

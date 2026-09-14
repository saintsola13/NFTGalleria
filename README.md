# Okina Galleria

Curated on-chain art gallery for Saints-family communities. Live at [nftgalleria.pages.dev](https://nftgalleria.pages.dev/).

## Communities (this issue)

1. **Saints of LA** (Ethereum)
2. **Steezy Ape Gang** (Ethereum)
3. **HMN5** (Ethereum)
4. **Kushlings** (Ethereum)
5. **Bryan Vee Originals** (Ethereum)
6. **Steezy Genesis** (Ethereum)
7. **Chumpz** on Ape (ApeChain)
8. **Forever Undead** (ApeChain)

Add more later in `src/curated.js`, then run `npm run bake` and commit `src/data/collections.json`.

## Stack

- Vite + React
- Baked collection metadata (`src/data/collections.json`)
- Reservoir proxy for token grids (Netlify Functions path; also works behind Cloudflare Pages Functions if wired)

## Scripts

```bash
npm install
npm run dev
npm run build
ALCHEMY_API_KEY=xxx npm run bake
```

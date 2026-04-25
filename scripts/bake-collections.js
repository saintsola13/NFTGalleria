#!/usr/bin/env node
// Bake curated collection metadata into a static JSON.
// Run once whenever the curated list changes:
//
//   ALCHEMY_API_KEY=xxx node scripts/bake-collections.js
//
// Reads:  src/curated.js
// Writes: src/data/collections.json

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ETHEREUM, APECHAIN, SOLANA } from "../src/curated.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../src/data/collections.json");

const ALCHEMY_HOSTS = {
  ethereum: "eth-mainnet.g.alchemy.com",
  apechain: "apechain-mainnet.g.alchemy.com",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAlchemy(chain, contract, name) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error("ALCHEMY_API_KEY env var required");
  const host = ALCHEMY_HOSTS[chain];

  const r = await fetch(
    `https://${host}/nft/v3/${key}/getContractMetadata?contractAddress=${encodeURIComponent(contract)}`,
  );
  if (!r.ok) {
    console.warn(`  ! ${chain} ${name} (${contract}) → ${r.status}`);
    return { id: contract, name, pfp: null, chain };
  }
  const c = await r.json();
  const os = c.openSeaMetadata || {};
  const realName = os.collectionName || c.name || name;
  let pfp = os.imageUrl || c.image?.cachedUrl || c.image?.originalUrl || null;

  if (!pfp) {
    const r2 = await fetch(
      `https://${host}/nft/v3/${key}/getNFTsForContract?contractAddress=${encodeURIComponent(contract)}&withMetadata=true&limit=1`,
    );
    if (r2.ok) {
      const d2 = await r2.json();
      const n0 = d2.nfts?.[0];
      pfp = n0?.image?.cachedUrl || n0?.image?.originalUrl || n0?.image?.thumbnailUrl || null;
    }
  }

  return { id: c.address || contract, name: realName, pfp, chain };
}

async function fetchSolana(symbol, name) {
  const r = await fetch(`https://api-mainnet.magiceden.dev/v2/collections/${encodeURIComponent(symbol)}`);
  if (!r.ok) {
    console.warn(`  ! solana ${name} (${symbol}) → ${r.status}`);
    return { id: symbol, name, pfp: null, chain: "solana" };
  }
  const c = await r.json();
  return {
    id: c.symbol || symbol,
    name: c.name || name,
    pfp: c.image || null,
    chain: "solana",
  };
}

function isPlaceholder(item) {
  return item.contract === "0x0000000000000000000000000000000000000000";
}

async function bake() {
  const out = { ethereum: [], apechain: [], solana: [], builtAt: new Date().toISOString() };

  console.log("→ Ethereum");
  for (const it of ETHEREUM) {
    if (isPlaceholder(it)) continue;
    const col = await fetchAlchemy("ethereum", it.contract, it.name);
    out.ethereum.push(col);
    console.log(`  ✓ ${col.name}`);
    await sleep(150);
  }

  console.log("→ ApeChain");
  for (const it of APECHAIN) {
    if (isPlaceholder(it)) {
      console.log(`  · skip placeholder: ${it.name}`);
      continue;
    }
    const col = await fetchAlchemy("apechain", it.contract, it.name);
    out.apechain.push(col);
    console.log(`  ✓ ${col.name}`);
    await sleep(150);
  }

  console.log("→ Solana");
  for (const it of SOLANA) {
    const col = await fetchSolana(it.symbol, it.name);
    out.solana.push(col);
    console.log(`  ✓ ${col.name}`);
    await sleep(250);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n✓ Wrote ${OUT}`);
  console.log(`  ETH: ${out.ethereum.length} · APE: ${out.apechain.length} · SOL: ${out.solana.length}`);
}

bake().catch((err) => {
  console.error(err);
  process.exit(1);
});

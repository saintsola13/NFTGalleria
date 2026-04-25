#!/usr/bin/env node
// Re-bake just Solana with aggressive backoff (Magic Eden rate-limits hard).
// Reads existing collections.json, replaces only the solana[] array.

import { writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SOLANA } from "../src/curated.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../src/data/collections.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchSolana(symbol, name, attempt = 0) {
  const r = await fetch(`https://api-mainnet.magiceden.dev/v2/collections/${encodeURIComponent(symbol)}`);
  if (r.status === 429 && attempt < 5) {
    const wait = 5000 * (attempt + 1);
    console.log(`    ↻ rate-limited, waiting ${wait/1000}s and retrying...`);
    await sleep(wait);
    return fetchSolana(symbol, name, attempt + 1);
  }
  if (!r.ok) {
    console.warn(`  ! ${name} (${symbol}) → ${r.status}`);
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

async function main() {
  const existing = JSON.parse(readFileSync(OUT, "utf8"));
  const out = [];

  console.log("→ Solana (with backoff)");
  for (const it of SOLANA) {
    const col = await fetchSolana(it.symbol, it.name);
    out.push(col);
    const status = col.pfp ? "✓" : "✗";
    console.log(`  ${status} ${col.name}`);
    await sleep(2000); // 2s between requests = 30/min, well under ME's limits
  }

  existing.solana = out;
  existing.builtAt = new Date().toISOString();
  writeFileSync(OUT, JSON.stringify(existing, null, 2));

  const ok = out.filter(c => c.pfp).length;
  console.log(`\n✓ Done: ${ok}/${out.length} solana collections have PFPs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

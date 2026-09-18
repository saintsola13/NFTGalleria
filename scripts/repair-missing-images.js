#!/usr/bin/env node
/**
 * Repair tokens that list-pages left without imgUrl:
 * getNFTMetadata → download → R2 → rewrite public/tokens JSON.
 *
 *   ONLY=kushlings node scripts/repair-missing-images.js
 *   CHAIN=ethereum CONTRACT=0xe253… node scripts/repair-missing-images.js
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ETHEREUM, APECHAIN } from "../src/curated.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_TOKENS = resolve(ROOT, "public/tokens");
const CACHE_DIR = resolve(ROOT, ".bake-cache");
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "9808f1db3babbe209cf16e9eafcf8f6c";
const CF_TOKEN = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
const BUCKET = process.env.R2_BUCKET || "okinagalleria-nfts";
const PUBLIC_BASE =
  process.env.R2_PUBLIC_BASE ||
  "https://pub-2d8eee3a9be9496ca46bac7e348aa3e6.r2.dev";
const ALCHEMY_HOSTS = {
  ethereum: "eth-mainnet.g.alchemy.com",
  apechain: "apechain-mainnet.g.alchemy.com",
};
const META_CONCURRENCY = Number(process.env.META_CONCURRENCY || 3);
const UPLOAD_CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY || 4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alchemyKey() {
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY.trim();
  const p = "/home/box/.sainthood-bridge/alchemy_api_key";
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  throw new Error("ALCHEMY_API_KEY missing");
}

function pickImageUrl(nft) {
  const img = nft?.image || {};
  return (
    img.thumbnailUrl ||
    img.cachedUrl ||
    img.pngUrl ||
    img.originalUrl ||
    nft?.raw?.metadata?.image ||
    nft?.raw?.metadata?.image_url ||
    null
  );
}

function marketplaceUrl(chain, contract, tokenId) {
  if (chain === "ethereum") return `https://opensea.io/assets/ethereum/${contract}/${tokenId}`;
  if (chain === "apechain") return `https://opensea.io/assets/ape_chain/${contract}/${tokenId}`;
  return null;
}

function extFromContentType(ct, url) {
  const c = (ct || "").toLowerCase();
  if (c.includes("webp")) return "webp";
  if (c.includes("png")) return "png";
  if (c.includes("gif")) return "gif";
  if (c.includes("jpeg") || c.includes("jpg")) return "jpg";
  const m = String(url || "").match(/\.(webp|png|jpe?g|gif)(?:\?|$)/i);
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  return "jpg";
}

async function r2Put(key, body, contentType) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`;
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": String(buf.length),
      },
      body: buf,
    });
    if (r.ok) return r.json().catch(() => ({}));
    const t = await r.text().catch(() => "");
    lastErr = new Error(`R2 PUT ${key} → ${r.status} ${t.slice(0, 160)}`);
    if (r.status === 429 || r.status >= 500) {
      await sleep(Math.min(30000, 800 * 2 ** attempt));
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

async function downloadImage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "image/*,*/*", "user-agent": "okinagalleria-repair/1.0" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("text/html")) return null;
    const ab = await r.arrayBuffer();
    if (!ab.byteLength || ab.byteLength > 5 * 1024 * 1024) return null;
    return { buf: Buffer.from(ab), contentType: ct, ext: extFromContentType(ct, url) };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return out;
}

function collectionId(item) {
  return item.openseaSlug || String(item.contract).toLowerCase();
}

function resolveTargets() {
  const only = (process.env.ONLY || "kushlings").toLowerCase();
  const all = [
    ...ETHEREUM.map((it) => ({ chain: "ethereum", item: it })),
    ...APECHAIN.map((it) => ({ chain: "apechain", item: it })),
  ];
  if (process.env.CONTRACT) {
    const c = process.env.CONTRACT.toLowerCase();
    const chain = process.env.CHAIN || "ethereum";
    return [{ chain, item: { name: c, contract: c } }];
  }
  return all.filter(
    ({ item }) =>
      collectionId(item).includes(only) ||
      item.name.toLowerCase().includes(only) ||
      (item.contract || "").toLowerCase().includes(only),
  );
}

async function repairOne(chain, item) {
  const id = collectionId(item);
  const contract = (item.contract || "").toLowerCase();
  const cacheFile = join(CACHE_DIR, `${chain}__${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  const outFile = join(PUBLIC_TOKENS, chain, `${id}.json`);
  if (!existsSync(cacheFile)) throw new Error(`missing cache ${cacheFile}`);
  if (!existsSync(outFile)) throw new Error(`missing baked JSON ${outFile}`);

  let cache = JSON.parse(readFileSync(cacheFile, "utf8"));
  const baked = JSON.parse(readFileSync(outFile, "utf8"));
  const have = new Set((baked.tokens || []).map((t) => String(t.tokenId)));

  const need = cache.filter((t) => !have.has(String(t.tokenId)));
  console.log(`${item.name}: cache=${cache.length} baked=${have.size} need=${need.length}`);

  const key = alchemyKey();
  const host = ALCHEMY_HOSTS[chain];
  let filledMeta = 0;

  // Enrich missing via getNFTMetadata
  await mapPool(need, META_CONCURRENCY, async (t) => {
    if (t.imgUrl) return;
    const url = `https://${host}/nft/v3/${key}/getNFTMetadata?contractAddress=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(t.tokenId)}&refreshCache=false`;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await fetch(url, { headers: { accept: "application/json" } });
        if (r.status === 429 || r.status >= 500) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        if (!r.ok) return;
        const d = await r.json();
        const imgUrl = pickImageUrl(d);
        if (imgUrl) {
          t.imgUrl = imgUrl;
          if (d.name) t.name = d.name;
          filledMeta++;
        }
        return;
      } catch {
        await sleep(500);
      }
    }
  });
  writeFileSync(cacheFile, JSON.stringify(cache));
  console.log(`  metadata filled ${filledMeta}`);

  const toUpload = need.filter((t) => t.imgUrl);
  console.log(`  uploading ${toUpload.length} (concurrency ${UPLOAD_CONCURRENCY})`);
  let uploaded = 0;
  let failed = 0;
  const added = [];

  await mapPool(toUpload, UPLOAD_CONCURRENCY, async (t) => {
    const safeId = String(t.tokenId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const progressKey = join(CACHE_DIR, `img_${chain}_${id}_${safeId}.done`);
    if (existsSync(progressKey)) {
      const prev = JSON.parse(readFileSync(progressKey, "utf8"));
      added.push({
        tokenId: t.tokenId,
        name: t.name,
        img: prev.publicUrl,
        opensea: marketplaceUrl(chain, t.contract || contract, t.tokenId),
        contract: t.contract || contract,
      });
      return;
    }
    const dl = await downloadImage(t.imgUrl);
    if (!dl) {
      // try original / ipfs fallbacks already in imgUrl; one more getNFTMetadata pngUrl path
      failed++;
      return;
    }
    const objKey = `tokens/${chain}/${id}/${safeId}.${dl.ext}`;
    try {
      await r2Put(objKey, dl.buf, dl.contentType || `image/${dl.ext === "jpg" ? "jpeg" : dl.ext}`);
      const publicUrl = `${PUBLIC_BASE}/${objKey}`;
      writeFileSync(progressKey, JSON.stringify({ publicUrl, key: objKey }));
      uploaded++;
      added.push({
        tokenId: t.tokenId,
        name: t.name,
        img: publicUrl,
        opensea: marketplaceUrl(chain, t.contract || contract, t.tokenId),
        contract: t.contract || contract,
      });
      if (uploaded % 50 === 0) process.stdout.write(`\r    up=${uploaded} fail=${failed}   `);
    } catch (e) {
      failed++;
      if (failed <= 3) console.warn(`\n    ! ${e.message}`);
    }
  });
  process.stdout.write("\n");

  // Merge + sort by tokenId numeric when possible
  const merged = [...(baked.tokens || []), ...added];
  const seen = new Set();
  const dedup = [];
  for (const t of merged) {
    const k = String(t.tokenId);
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(t);
  }
  dedup.sort((a, b) => {
    try {
      const ba = BigInt(a.tokenId);
      const bb = BigInt(b.tokenId);
      return ba < bb ? -1 : ba > bb ? 1 : 0;
    } catch {
      return String(a.tokenId).localeCompare(String(b.tokenId));
    }
  });

  const payload = {
    ...baked,
    count: dedup.length,
    builtAt: new Date().toISOString(),
    repairedAt: new Date().toISOString(),
    tokens: dedup,
  };
  writeFileSync(outFile, JSON.stringify(payload));
  try {
    await r2Put(`tokens/${chain}/${id}.json`, Buffer.from(JSON.stringify(payload)), "application/json");
  } catch (e) {
    console.warn("  ! R2 JSON mirror:", e.message);
  }
  console.log(`  ✓ ${item.name}: now ${dedup.length} tokens (+${added.length}, upload=${uploaded}, fail=${failed})`);
  return { name: item.name, count: dedup.length, added: added.length, uploaded, failed };
}

async function main() {
  if (!CF_TOKEN) throw new Error("CF_API_TOKEN required");
  alchemyKey();
  mkdirSync(CACHE_DIR, { recursive: true });
  const targets = resolveTargets();
  if (!targets.length) throw new Error("no targets matched ONLY=");
  console.log(`Repair targets: ${targets.map((t) => t.item.name).join(", ")}`);
  for (const { chain, item } of targets) {
    await repairOne(chain, item);
    await sleep(1500);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

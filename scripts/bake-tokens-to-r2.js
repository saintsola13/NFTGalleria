#!/usr/bin/env node
/**
 * One-shot: page curated collections via Alchemy, upload images to R2,
 * write static token JSON under public/tokens/ (and mirror to R2).
 *
 *   ALCHEMY_API_KEY=… CF_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
 *     node scripts/bake-tokens-to-r2.js
 *
 * Never prints the Alchemy key. Resumable via .bake-cache/.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ETHEREUM, APECHAIN } from "../src/curated.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_TOKENS = resolve(ROOT, "public/tokens");
const COLLECTIONS_JSON = resolve(ROOT, "src/data/collections.json");
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

const PAGE_SIZE = 100;
const PAGE_SLEEP_MS = 350;
const UPLOAD_CONCURRENCY = 8;
const IMG_TIMEOUT_MS = 20000;
const MAX_IMG_BYTES = 4 * 1024 * 1024; // 4MB cap per image

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alchemyKey() {
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY.trim();
  const p = "/home/box/.sainthood-bridge/alchemy_api_key";
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  throw new Error("ALCHEMY_API_KEY not set and tip.env/bridge key missing");
}

function collectionId(item) {
  if (item.openseaSlug) return item.openseaSlug;
  return String(item.contract).toLowerCase();
}

function marketplaceUrl(chain, contract, tokenId) {
  if (!contract || tokenId == null) return null;
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
  if (c.includes("svg")) return "svg";
  const m = String(url || "").match(/\.(webp|png|jpe?g|gif|svg)(?:\?|$)/i);
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  return "jpg";
}

async function r2Put(key, body, contentType) {
  if (!CF_TOKEN) throw new Error("CF_API_TOKEN / CLOUDFLARE_API_TOKEN required");
  // Slashes in key must NOT be percent-encoded for this API
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
    lastErr = new Error(`R2 PUT ${key} → ${r.status} ${t.slice(0, 200)}`);
    if (r.status === 429 || r.status >= 500) {
      const wait = Math.min(30000, 800 * Math.pow(2, attempt));
      await sleep(wait);
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

async function downloadImage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), IMG_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "image/*,*/*", "user-agent": "okinagalleria-bake/1.0" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("text/html")) return null;
    const ab = await r.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > MAX_IMG_BYTES) return null;
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
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
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
    nft?.tokenUri?.gateway ||
    null
  );
}

/** Fill tokens that list-pages left without imgUrl via getNFTMetadata (rate-limited). */
async function fillMissingViaMetadata(chain, contract, tokens, { concurrency = 3, sleepMs = 120 } = {}) {
  const key = alchemyKey();
  const host = ALCHEMY_HOSTS[chain];
  const missing = tokens.filter((t) => !t.imgUrl);
  if (!missing.length) return tokens;
  console.log(`  → getNFTMetadata fill for ${missing.length} tokens missing images`);
  let filled = 0;
  let fail = 0;
  await mapPool(missing, concurrency, async (t) => {
    const url = `https://${host}/nft/v3/${key}/getNFTMetadata?contractAddress=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(t.tokenId)}&refreshCache=false`;
    try {
      let r;
      for (let attempt = 0; attempt < 4; attempt++) {
        r = await fetch(url, { headers: { accept: "application/json" } });
        if (r.status === 429 || r.status >= 500) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        break;
      }
      if (!r.ok) { fail++; return; }
      const d = await r.json();
      const imgUrl = pickImageUrl(d);
      if (imgUrl) {
        t.imgUrl = imgUrl;
        if (d.name && !t.name) t.name = d.name;
        filled++;
      } else {
        fail++;
      }
    } catch {
      fail++;
    }
    if (sleepMs) await sleep(sleepMs);
  });
  console.log(`  · metadata fill: filled=${filled} still-missing=${fail}`);
  return tokens;
}

async function pageCollection(chain, item) {
  const key = alchemyKey();
  const host = ALCHEMY_HOSTS[chain];
  const slug = item.openseaSlug || null;
  const contract = (item.contract || "").toLowerCase();
  const bySlug = !!slug;
  let pageKey = null;
  const all = [];
  let pages = 0;

  while (true) {
    const params = new URLSearchParams({
      withMetadata: "true",
      limit: String(PAGE_SIZE),
    });
    if (bySlug) params.set("collectionSlug", slug);
    else params.set("contractAddress", contract);
    if (pageKey) params.set("pageKey", pageKey);

    const path = bySlug ? "getNFTsForCollection" : "getNFTsForContract";
    const url = `https://${host}/nft/v3/${key}/${path}?${params}`;
    let r;
    for (let attempt = 0; attempt < 5; attempt++) {
      r = await fetch(url, { headers: { accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      break;
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Alchemy ${chain} ${item.name} page ${pages} → ${r.status} ${t.slice(0, 120)}`);
    }
    const data = await r.json();
    const nfts = data.nfts || [];
    for (const n of nfts) {
      const tokenId = n.tokenId;
      const cAddr = (n.contract?.address || contract || "").toLowerCase();
      const imgUrl = pickImageUrl(n);
      all.push({
        tokenId,
        name: n.name || null,
        contract: cAddr,
        imgUrl,
      });
    }
    pages++;
    pageKey = data.pageKey || null;
    process.stdout.write(`\r  … ${item.name}: page ${pages}, tokens ${all.length}   `);
    if (!pageKey || nfts.length === 0) break;
    await sleep(PAGE_SLEEP_MS);
  }
  process.stdout.write("\n");
  return all;
}

function cachePath(chain, id) {
  return join(CACHE_DIR, `${chain}__${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}

async function bakeOne(chain, item) {
  const id = collectionId(item);
  const contract = (item.contract || "").toLowerCase();
  const outFile = join(PUBLIC_TOKENS, chain, `${id}.json`);
  mkdirSync(dirname(outFile), { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  const cp = cachePath(chain, id);
  let tokens;
  if (existsSync(cp) && process.env.FORCE_REFETCH !== "1") {
    console.log(`  · resume metadata cache for ${item.name}`);
    tokens = JSON.parse(readFileSync(cp, "utf8"));
  } else {
    console.log(`  → Alchemy page ${chain}/${item.name}`);
    const raw = await pageCollection(chain, item);
    writeFileSync(cp, JSON.stringify(raw));
    tokens = raw;
  }

  const missingBefore = tokens.filter((t) => !t.imgUrl).length;
  if (missingBefore > 0) {
    tokens = await fillMissingViaMetadata(chain, contract, tokens);
    writeFileSync(cp, JSON.stringify(tokens));
  }

  console.log(`  → upload images (${tokens.length}) concurrency=${UPLOAD_CONCURRENCY}`);
  let uploaded = 0;
  let skippedNoImg = 0;
  let failed = 0;
  let reused = 0;

  const baked = await mapPool(tokens, UPLOAD_CONCURRENCY, async (t) => {
    const opensea = marketplaceUrl(chain, t.contract || contract, t.tokenId);
    if (!t.imgUrl) {
      skippedNoImg++;
      return null;
    }
    // Prefer stable object key without guessing ext first — probe local progress marker
    const safeId = String(t.tokenId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const progressKey = join(CACHE_DIR, `img_${chain}_${id}_${safeId}.done`);
    if (existsSync(progressKey) && process.env.FORCE_REUPLOAD !== "1") {
      const prev = JSON.parse(readFileSync(progressKey, "utf8"));
      reused++;
      return {
        tokenId: t.tokenId,
        name: t.name,
        img: prev.publicUrl,
        opensea,
        contract: t.contract || contract,
      };
    }

    const dl = await downloadImage(t.imgUrl);
    if (!dl) {
      failed++;
      return null;
    }
    const objKey = `tokens/${chain}/${id}/${safeId}.${dl.ext}`;
    try {
      await r2Put(objKey, dl.buf, dl.contentType || `image/${dl.ext === "jpg" ? "jpeg" : dl.ext}`);
      const publicUrl = `${PUBLIC_BASE}/${objKey}`;
      writeFileSync(progressKey, JSON.stringify({ publicUrl, key: objKey }));
      uploaded++;
      if ((uploaded + reused) % 50 === 0) {
        process.stdout.write(`\r    progress up=${uploaded} reuse=${reused} fail=${failed} noimg=${skippedNoImg}   `);
      }
      return {
        tokenId: t.tokenId,
        name: t.name,
        img: publicUrl,
        opensea,
        contract: t.contract || contract,
      };
    } catch (e) {
      failed++;
      if (failed <= 5) console.warn(`\n    ! upload fail #${t.tokenId}: ${e.message}`);
      return null;
    }
  });

  process.stdout.write("\n");
  const list = baked.filter(Boolean);
  const payload = {
    chain,
    collectionId: id,
    name: item.name,
    contract,
    openseaSlug: item.openseaSlug || null,
    count: list.length,
    builtAt: new Date().toISOString(),
    tokens: list,
  };
  writeFileSync(outFile, JSON.stringify(payload));
  // Mirror JSON to R2
  try {
    await r2Put(
      `tokens/${chain}/${id}.json`,
      Buffer.from(JSON.stringify(payload)),
      "application/json",
    );
  } catch (e) {
    console.warn(`  ! R2 JSON mirror failed: ${e.message}`);
  }

  console.log(
    `  ✓ ${item.name}: baked ${list.length}/${tokens.length} (up=${uploaded} reuse=${reused} fail=${failed} noimg=${skippedNoImg})`,
  );
  return {
    chain,
    id,
    name: item.name,
    baked: list.length,
    total: tokens.length,
    uploaded,
    reused,
    failed,
    skippedNoImg,
  };
}

async function bakePfp(chain, col) {
  if (!col.pfp) return col;
  const id = col.id;
  const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
  const marker = join(CACHE_DIR, `pfp_${chain}_${safe}.done`);
  if (existsSync(marker) && process.env.FORCE_REUPLOAD !== "1") {
    const prev = JSON.parse(readFileSync(marker, "utf8"));
    return { ...col, pfp: prev.publicUrl };
  }
  const dl = await downloadImage(col.pfp);
  if (!dl) return col;
  const objKey = `pfps/${chain}/${safe}.${dl.ext}`;
  try {
    await r2Put(objKey, dl.buf, dl.contentType || `image/${dl.ext === "jpg" ? "jpeg" : dl.ext}`);
    const publicUrl = `${PUBLIC_BASE}/${objKey}`;
    writeFileSync(marker, JSON.stringify({ publicUrl }));
    return { ...col, pfp: publicUrl };
  } catch {
    return col;
  }
}

async function main() {
  if (!CF_TOKEN) throw new Error("CF_API_TOKEN required");
  alchemyKey(); // validate early, don't print
  mkdirSync(PUBLIC_TOKENS, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  const only = process.env.ONLY ? process.env.ONLY.toLowerCase() : null;
  const summary = [];

  const jobs = [
    ...ETHEREUM.map((it) => ({ chain: "ethereum", item: it })),
    ...APECHAIN.map((it) => ({ chain: "apechain", item: it })),
  ].filter(({ item }) => {
    if (item.contract === "0x0000000000000000000000000000000000000000") return false;
    if (!only) return true;
    const id = collectionId(item);
    return id.includes(only) || item.name.toLowerCase().includes(only);
  });

  console.log(`Baking ${jobs.length} collections → R2 ${BUCKET}`);
  console.log(`Public base: ${PUBLIC_BASE}`);

  for (const { chain, item } of jobs) {
    try {
      const s = await bakeOne(chain, item);
      summary.push(s);
    } catch (e) {
      console.error(`  ✗ FAILED ${item.name}: ${e.message}`);
      summary.push({
        chain,
        id: collectionId(item),
        name: item.name,
        baked: 0,
        total: 0,
        error: e.message,
      });
    }
    await sleep(2000);
  }

  // Update collections.json PFPs to R2
  if (existsSync(COLLECTIONS_JSON)) {
    console.log("→ Updating collections.json PFPs to R2");
    const cols = JSON.parse(readFileSync(COLLECTIONS_JSON, "utf8"));
    for (const chain of ["ethereum", "apechain"]) {
      cols[chain] = await Promise.all(
        (cols[chain] || []).map(async (c) => {
          // normalize id to lowercase for contracts
          const next = {
            ...c,
            id: c.openseaSlug || String(c.id).toLowerCase(),
            contract: c.contract ? String(c.contract).toLowerCase() : c.contract,
          };
          return bakePfp(chain, next);
        }),
      );
    }
    cols.builtAt = new Date().toISOString();
    cols.tokensBaked = true;
    writeFileSync(COLLECTIONS_JSON, JSON.stringify(cols, null, 2));
    console.log("  ✓ collections.json updated");
  }

  const reportPath = join(CACHE_DIR, "bake-summary.json");
  writeFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), summary, publicBase: PUBLIC_BASE }, null, 2));
  console.log("\n=== SUMMARY ===");
  for (const s of summary) {
    if (s.error) console.log(`FAIL ${s.chain}/${s.name}: ${s.error}`);
    else console.log(`${s.chain}/${s.name}: ${s.baked}/${s.total}`);
  }
  console.log(`Report: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

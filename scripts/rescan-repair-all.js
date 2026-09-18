#!/usr/bin/env node
/**
 * Rescan all curated collections: Alchemy expected vs bake, repair misses
 * with getNFTMetadata + multi-gateway image download → R2 → rewrite JSON.
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

const IPFS_GATEWAYS = [
  (cidPath) => `https://ipfs.io/ipfs/${cidPath}`,
  (cidPath) => `https://cloudflare-ipfs.com/ipfs/${cidPath}`,
  (cidPath) => `https://gateway.pinata.cloud/ipfs/${cidPath}`,
  (cidPath) => `https://nftstorage.link/ipfs/${cidPath}`,
  (cidPath) => `https://dweb.link/ipfs/${cidPath}`,
];

function alchemyKey() {
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY.trim();
  const p = "/home/box/.sainthood-bridge/alchemy_api_key";
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  throw new Error("ALCHEMY_API_KEY missing");
}

function collectionId(item) {
  return item.openseaSlug || String(item.contract).toLowerCase();
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
  if (c.includes("svg")) return "svg";
  const m = String(url || "").match(/\.(webp|png|jpe?g|gif|svg)(?:\?|$)/i);
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  return "jpg";
}

function pickImageCandidates(nft) {
  const img = nft?.image || {};
  const raw = [
    img.thumbnailUrl,
    img.cachedUrl,
    img.pngUrl,
    img.originalUrl,
    nft?.raw?.metadata?.image,
    nft?.raw?.metadata?.image_url,
    nft?.raw?.metadata?.image_data,
    nft?.tokenUri?.gateway,
    nft?.tokenUri?.raw,
  ].filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const u of raw) {
    if (typeof u !== "string") continue;
    if (u.startsWith("data:")) continue;
    const variants = expandUrl(u);
    for (const v of variants) {
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  return out;
}

function expandUrl(u) {
  const s = String(u).trim();
  if (!s) return [];
  const list = [s];
  let cidPath = null;
  if (s.startsWith("ipfs://")) {
    cidPath = s.slice(7).replace(/^ipfs\//, "");
  } else {
    const m = s.match(/\/ipfs\/([^?#]+)/i);
    if (m) cidPath = m[1];
  }
  if (cidPath) {
    for (const gw of IPFS_GATEWAYS) list.push(gw(cidPath));
  }
  // Alchemy NFT CDN sometimes needs original without size params
  if (s.includes("nft-cdn.alchemy.com") || s.includes("alchemy.com")) {
    list.push(s.replace(/\/(medium|small|thumb)(\?|$)/i, "/$2").replace(/\?.*$/, ""));
  }
  return [...new Set(list)];
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
  const t = setTimeout(() => ctrl.abort(), 28000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "image/*,*/*", "user-agent": "okinagalleria-rescan/1.0" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("text/html") || ct.includes("application/json")) return null;
    const ab = await r.arrayBuffer();
    if (!ab.byteLength || ab.byteLength > 6 * 1024 * 1024) return null;
    return { buf: Buffer.from(ab), contentType: ct, ext: extFromContentType(ct, url) };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function downloadWithFallbacks(urls) {
  for (const u of urls) {
    const dl = await downloadImage(u);
    if (dl) return { ...dl, sourceUrl: u };
  }
  return null;
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

async function getNFTMetadata(chain, contract, tokenId, refresh = false) {
  const key = alchemyKey();
  const host = ALCHEMY_HOSTS[chain];
  const url = `https://${host}/nft/v3/${key}/getNFTMetadata?contractAddress=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(tokenId)}&refreshCache=${refresh}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

async function getContractMetadata(chain, contract) {
  const key = alchemyKey();
  const host = ALCHEMY_HOSTS[chain];
  const url = `https://${host}/nft/v3/${key}/getContractMetadata?contractAddress=${encodeURIComponent(contract)}`;
  for (let a = 0; a < 4; a++) {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (r.status === 429 || r.status >= 500) { await sleep(800 * (a + 1)); continue; }
    if (!r.ok) return null;
    const d = await r.json();
    return d.totalSupply ?? d.contractMetadata?.totalSupply ?? null;
  }
  return null;
}

async function repairOne(chain, item) {
  const id = collectionId(item);
  const contract = (item.contract || "").toLowerCase();
  const cacheFile = join(CACHE_DIR, `${chain}__${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  const outFile = join(PUBLIC_TOKENS, chain, `${id}.json`);
  if (!existsSync(cacheFile) || !existsSync(outFile)) {
    console.log(`SKIP ${item.name}: missing cache or baked`);
    return null;
  }

  let cache = JSON.parse(readFileSync(cacheFile, "utf8"));
  const baked = JSON.parse(readFileSync(outFile, "utf8"));
  const have = new Map();
  for (const t of baked.tokens || []) {
    const ok = t.img && (String(t.img).includes("r2.dev") || String(t.img).startsWith(PUBLIC_BASE));
    if (ok) have.set(String(t.tokenId), t);
  }

  const need = cache.filter((t) => !have.has(String(t.tokenId)));
  const supply = contract && !item.openseaSlug ? await getContractMetadata(chain, contract) : null;
  const alchemyExpected = supply != null ? Number(supply) : cache.length;

  console.log(`\n=== ${item.name} (${chain}) ===`);
  console.log(`  alchemy_expected≈${alchemyExpected} cache=${cache.length} baked_ok=${have.size} need=${need.length}`);

  if (!need.length) {
    return {
      name: item.name,
      chain,
      id,
      alchemy_expected: alchemyExpected,
      cache: cache.length,
      baked_with_img: have.size,
      missing_fixed: 0,
      still_missing: 0,
      still_reasons: [],
    };
  }

  // Enrich metadata + candidates
  const enriched = [];
  await mapPool(need, META_CONCURRENCY, async (t) => {
    let candidates = t.imgUrl ? expandUrl(t.imgUrl) : [];
    let name = t.name;
    // Always try getNFTMetadata for better URLs
    let meta = await getNFTMetadata(chain, contract || t.contract, t.tokenId, false);
    if (meta) {
      const c = pickImageCandidates(meta);
      candidates = [...new Set([...c, ...candidates])];
      if (meta.name) name = meta.name;
    }
    if (!candidates.length) {
      meta = await getNFTMetadata(chain, contract || t.contract, t.tokenId, true);
      if (meta) {
        candidates = pickImageCandidates(meta);
        if (meta.name) name = meta.name;
      }
    }
    if (candidates[0]) t.imgUrl = candidates[0];
    enriched.push({
      tokenId: t.tokenId,
      name,
      contract: t.contract || contract,
      candidates,
    });
    await sleep(80);
  });
  writeFileSync(cacheFile, JSON.stringify(cache));

  let uploaded = 0;
  let reused = 0;
  let failed = 0;
  const added = [];
  const failReasons = [];

  await mapPool(enriched, UPLOAD_CONCURRENCY, async (t) => {
    const safeId = String(t.tokenId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const progressKey = join(CACHE_DIR, `img_${chain}_${id}_${safeId}.done`);
    if (existsSync(progressKey)) {
      try {
        const prev = JSON.parse(readFileSync(progressKey, "utf8"));
        // verify public URL looks sane
        if (prev.publicUrl) {
          reused++;
          added.push({
            tokenId: t.tokenId,
            name: t.name,
            img: prev.publicUrl,
            opensea: marketplaceUrl(chain, t.contract, t.tokenId),
            contract: t.contract,
          });
          return;
        }
      } catch {}
    }
    if (!t.candidates.length) {
      failed++;
      failReasons.push({ tokenId: t.tokenId, reason: "no_image_url" });
      return;
    }
    const dl = await downloadWithFallbacks(t.candidates);
    if (!dl) {
      failed++;
      failReasons.push({ tokenId: t.tokenId, reason: "download_failed", tried: t.candidates.length });
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
        opensea: marketplaceUrl(chain, t.contract, t.tokenId),
        contract: t.contract,
      });
      if ((uploaded + reused) % 25 === 0) {
        process.stdout.write(`\r    up=${uploaded} reuse=${reused} fail=${failed}   `);
      }
    } catch (e) {
      failed++;
      failReasons.push({ tokenId: t.tokenId, reason: `upload: ${e.message}` });
    }
  });
  process.stdout.write("\n");

  const merged = [...(baked.tokens || []).filter((t) => have.has(String(t.tokenId)) || (t.img && String(t.img).includes("r2"))), ...added];
  // Prefer have map + added
  const byId = new Map();
  for (const t of baked.tokens || []) {
    if (t.img && (String(t.img).includes("r2.dev") || String(t.img).startsWith(PUBLIC_BASE))) {
      byId.set(String(t.tokenId), t);
    }
  }
  for (const t of added) byId.set(String(t.tokenId), t);
  const dedup = [...byId.values()];
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
    builtAt: baked.builtAt,
    repairedAt: new Date().toISOString(),
    tokens: dedup,
  };
  writeFileSync(outFile, JSON.stringify(payload));
  try {
    await r2Put(`tokens/${chain}/${id}.json`, Buffer.from(JSON.stringify(payload)), "application/json");
  } catch (e) {
    console.warn("  ! R2 JSON mirror:", e.message);
  }

  const still = cache.length - dedup.length;
  console.log(`  ✓ now ${dedup.length}/${cache.length} (+${added.length} up=${uploaded} reuse=${reused} fail=${failed})`);

  return {
    name: item.name,
    chain,
    id,
    alchemy_expected: alchemyExpected,
    cache: cache.length,
    baked_with_img: dedup.length,
    missing_fixed: added.length,
    still_missing: Math.max(0, still),
    still_reasons: failReasons.slice(0, 40),
    failReasonsAll: failReasons,
  };
}

async function main() {
  if (!CF_TOKEN) throw new Error("CF_API_TOKEN required");
  alchemyKey();
  mkdirSync(CACHE_DIR, { recursive: true });
  const only = (process.env.ONLY || "").toLowerCase();
  const jobs = [
    ...ETHEREUM.map((it) => ({ chain: "ethereum", item: it })),
    ...APECHAIN.map((it) => ({ chain: "apechain", item: it })),
  ].filter(({ item }) => {
    if (!only) return true;
    const id = collectionId(item);
    return id.includes(only) || item.name.toLowerCase().includes(only) || (item.contract || "").toLowerCase().includes(only);
  });

  const summary = [];
  for (const { chain, item } of jobs) {
    try {
      const s = await repairOne(chain, item);
      if (s) summary.push(s);
    } catch (e) {
      console.error(`FAIL ${item.name}:`, e.message);
      summary.push({ name: item.name, chain, error: e.message });
    }
    await sleep(1000);
  }

  const reportPath = join(CACHE_DIR, "rescan-repair-summary.json");
  writeFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), summary }, null, 2));
  console.log("\n======== FINAL TABLE ========");
  console.log("collection | alchemy_expected | cache | baked_with_img | missing_fixed | still_missing");
  for (const s of summary) {
    if (s.error) {
      console.log(`${s.name} | ERROR ${s.error}`);
      continue;
    }
    console.log(
      `${s.name} | ${s.alchemy_expected} | ${s.cache} | ${s.baked_with_img} | ${s.missing_fixed} | ${s.still_missing}`,
    );
    if (s.still_missing && s.still_reasons?.length) {
      const byReason = {};
      for (const r of s.failReasonsAll || s.still_reasons) {
        byReason[r.reason] = (byReason[r.reason] || 0) + 1;
      }
      console.log(`  reasons: ${JSON.stringify(byReason)}`);
      console.log(`  sample: ${JSON.stringify(s.still_reasons.slice(0, 8))}`);
    }
  }
  console.log(`Report: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

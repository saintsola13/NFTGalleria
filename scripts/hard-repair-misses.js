#!/usr/bin/env node
/**
 * Hard-repair remaining bake misses:
 * - Rewrite *.ipfs.w3s.link / ipfs.io → Pinata / alchemy.mypinata
 * - Infer image from known collection root CIDs
 * - Fetch tokenUri metadata via Pinata when Alchemy has no image
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

/** Known image root CIDs (directory with {tokenId}.png) */
const KNOWN_IMAGE_ROOTS = {
  "apechain:0xa9a1d086623475595a02991664742e4a1cbafcb8":
    "bafybeicjhxcpe7fbdp5ggm6lmvlvdiz6sl6z3jxokwubmwjdmklvunv5ka",
  "apechain:0x0178a9d0b0cba1b2ede3afdb6dd021db24ff4240":
    "bafybeidmqi5bf47l5y3tzreyt34s435pgnjogq6xqtz4favmv2rdse6kpe",
};
const KNOWN_META_ROOTS = {
  "apechain:0xa9a1d086623475595a02991664742e4a1cbafcb8":
    "bafybeiejjw53sa7omz5ekvf6ns6b5brp4lyjijv4t2ixt2rzcrv2jujcvu",
  "apechain:0x0178a9d0b0cba1b2ede3afdb6dd021db24ff4240":
    "bafybeien7rtlzswia5z5ykjmrjkoyvtii7gmnmeldwhmqwznaxit5ewdfm",
};

const GATEWAYS = [
  (p) => `https://gateway.pinata.cloud/ipfs/${p}`,
  (p) => `https://alchemy.mypinata.cloud/ipfs/${p}`,
  (p) => `https://ipfs.io/ipfs/${p}`,
  (p) => `https://w3s.link/ipfs/${p}`,
  (p) => `https://nftstorage.link/ipfs/${p}`,
];

const META_CONCURRENCY = Number(process.env.META_CONCURRENCY || 2);
const UPLOAD_CONCURRENCY = Number(process.env.UPLOAD_CONCURRENCY || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alchemyKey() {
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY.trim();
  return readFileSync("/home/box/.sainthood-bridge/alchemy_api_key", "utf8").trim();
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
  const m = String(url || "").match(/\.(webp|png|jpe?g|gif)(?:\?|$)/i);
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  return "png";
}

/** Extract CID + optional path from any IPFS-ish URL */
function parseIpfs(u) {
  const s = String(u || "");
  // ipfs://CID/path
  let m = s.match(/^ipfs:\/\/(?:ipfs\/)?([^/?#]+)(?:\/([^?#]*))?/i);
  if (m) return { cid: m[1], path: m[2] || "" };
  // https://CID.ipfs.w3s.link/path or *.ipfs.*.link
  m = s.match(/^https?:\/\/([a-z0-9]{46,})\.ipfs\.[^/]+\/?(.*)$/i);
  if (m) return { cid: m[1], path: m[2] || "" };
  // /ipfs/CID/path
  m = s.match(/\/ipfs\/([^/?#]+)(?:\/([^?#]*))?/i);
  if (m) return { cid: m[1], path: m[2] || "" };
  return null;
}

function expandToGateways(urlOrCidPath) {
  const out = [];
  const seen = new Set();
  const add = (u) => {
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  };
  if (!urlOrCidPath) return out;
  const s = String(urlOrCidPath);
  add(s);
  const parsed = parseIpfs(s);
  if (parsed) {
    const p = parsed.path ? `${parsed.cid}/${parsed.path}` : parsed.cid;
    for (const gw of GATEWAYS) add(gw(p));
  } else if (/^bafy|Qm[a-zA-Z0-9]{40,}/.test(s)) {
    for (const gw of GATEWAYS) add(gw(s));
  }
  return out;
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
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "image/*,*/*", "user-agent": "okinagalleria-hard-repair/1.0" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("text/html") || ct.includes("text/plain") || ct.includes("application/json")) return null;
    const ab = await r.arrayBuffer();
    if (!ab.byteLength || ab.byteLength > 8 * 1024 * 1024) return null;
    // reject tiny error bodies
    if (ab.byteLength < 100) return null;
    return { buf: Buffer.from(ab), contentType: ct, ext: extFromContentType(ct, url) };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json,*/*", "user-agent": "okinagalleria-hard-repair/1.0" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    const text = await r.text();
    if (ct.includes("text/html")) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
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
    await sleep(150);
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

async function getNFTMetadata(chain, contract, tokenId) {
  const key = alchemyKey();
  const host = ALCHEMY_HOSTS[chain];
  const url = `https://${host}/nft/v3/${key}/getNFTMetadata?contractAddress=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(tokenId)}&refreshCache=false`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(500);
    }
  }
  return null;
}

function collectCandidates(chain, contract, tokenId, meta, cacheImgUrl) {
  const key = `${chain}:${contract.toLowerCase()}`;
  const urls = [];
  const addAll = (u) => {
    for (const x of expandToGateways(u)) urls.push(x);
  };

  if (meta?.image) {
    addAll(meta.image.thumbnailUrl);
    addAll(meta.image.cachedUrl);
    addAll(meta.image.pngUrl);
    addAll(meta.image.originalUrl);
  }
  addAll(meta?.raw?.metadata?.image);
  addAll(meta?.raw?.metadata?.image_url);
  addAll(cacheImgUrl);

  // tokenUri → may need fetch; also expand as IPFS
  if (meta?.tokenUri?.gateway) addAll(meta.tokenUri.gateway.replace(/\.json$/i, ".png"));
  if (meta?.tokenUri?.raw) {
    const p = parseIpfs(meta.tokenUri.raw);
    if (p) {
      // sibling image guess: same dir parent? usually meta is META_ROOT/id.json and image IMAGE_ROOT/id.png
    }
  }

  const imgRoot = KNOWN_IMAGE_ROOTS[key];
  if (imgRoot) {
    for (const ext of ["png", "jpg", "webp", "gif"]) {
      addAll(`${imgRoot}/${tokenId}.${ext}`);
    }
  }
  return [...new Set(urls.filter(Boolean))];
}

async function resolveFromTokenUri(chain, contract, tokenId, meta) {
  const key = `${chain}:${contract.toLowerCase()}`;
  const candidates = [];
  if (meta?.tokenUri?.gateway) candidates.push(...expandToGateways(meta.tokenUri.gateway));
  if (meta?.tokenUri?.raw) candidates.push(...expandToGateways(meta.tokenUri.raw));
  const metaRoot = KNOWN_META_ROOTS[key];
  if (metaRoot) {
    for (const gw of GATEWAYS) candidates.push(gw(`${metaRoot}/${tokenId}.json`));
  }
  for (const u of [...new Set(candidates)]) {
    const j = await fetchJson(u);
    if (j?.image || j?.image_url) {
      return { name: j.name, imageUrls: expandToGateways(j.image || j.image_url) };
    }
    await sleep(100);
  }
  return null;
}

async function repairOne(chain, item) {
  const id = collectionId(item);
  const contract = (item.contract || "").toLowerCase();
  const cacheFile = join(CACHE_DIR, `${chain}__${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  const outFile = join(PUBLIC_TOKENS, chain, `${id}.json`);
  if (!existsSync(cacheFile) || !existsSync(outFile)) return null;

  const cache = JSON.parse(readFileSync(cacheFile, "utf8"));
  const baked = JSON.parse(readFileSync(outFile, "utf8"));
  const have = new Set(
    (baked.tokens || [])
      .filter((t) => t.img && String(t.img).includes("r2.dev"))
      .map((t) => String(t.tokenId)),
  );
  const need = cache.filter((t) => !have.has(String(t.tokenId)));
  console.log(`\n=== HARD ${item.name}: need=${need.length} baked=${have.size}/${cache.length} ===`);
  if (!need.length) {
    return { name: item.name, chain, fixed: 0, still: 0, baked: have.size, cache: cache.length };
  }

  const added = [];
  const failReasons = [];
  let uploaded = 0;

  await mapPool(need, UPLOAD_CONCURRENCY, async (t) => {
    const safeId = String(t.tokenId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const progressKey = join(CACHE_DIR, `img_${chain}_${id}_${safeId}.done`);
    if (existsSync(progressKey)) {
      try {
        const prev = JSON.parse(readFileSync(progressKey, "utf8"));
        if (prev.publicUrl) {
          added.push({
            tokenId: t.tokenId,
            name: t.name,
            img: prev.publicUrl,
            opensea: marketplaceUrl(chain, t.contract || contract, t.tokenId),
            contract: t.contract || contract,
          });
          return;
        }
      } catch {}
    }

    const meta = await getNFTMetadata(chain, contract || t.contract, t.tokenId);
    let candidates = collectCandidates(chain, contract, t.tokenId, meta, t.imgUrl);
    let name = t.name || meta?.name || null;

    if (!candidates.length || candidates.every((u) => /w3s\.link|ipfs\.io/.test(u))) {
      // always add known roots even if we have candidates
    }
    // Ensure known root pinata URLs are first
    const imgRoot = KNOWN_IMAGE_ROOTS[`${chain}:${contract}`];
    if (imgRoot) {
      const preferred = [
        `https://gateway.pinata.cloud/ipfs/${imgRoot}/${t.tokenId}.png`,
        `https://alchemy.mypinata.cloud/ipfs/${imgRoot}/${t.tokenId}.png`,
      ];
      candidates = [...preferred, ...candidates.filter((u) => !preferred.includes(u))];
    }

    let dl = await downloadWithFallbacks(candidates);
    if (!dl) {
      const fromUri = await resolveFromTokenUri(chain, contract, t.tokenId, meta);
      if (fromUri) {
        if (fromUri.name) name = fromUri.name;
        dl = await downloadWithFallbacks(fromUri.imageUrls);
      }
    }
    if (!dl) {
      failReasons.push({ tokenId: t.tokenId, reason: "unrecoverable", tried: candidates.length });
      return;
    }

    const objKey = `tokens/${chain}/${id}/${safeId}.${dl.ext}`;
    try {
      await r2Put(objKey, dl.buf, dl.contentType || `image/${dl.ext === "jpg" ? "jpeg" : dl.ext}`);
      const publicUrl = `${PUBLIC_BASE}/${objKey}`;
      writeFileSync(progressKey, JSON.stringify({ publicUrl, key: objKey, source: dl.sourceUrl }));
      uploaded++;
      added.push({
        tokenId: t.tokenId,
        name,
        img: publicUrl,
        opensea: marketplaceUrl(chain, t.contract || contract, t.tokenId),
        contract: t.contract || contract,
      });
      if (uploaded % 10 === 0) process.stdout.write(`\r    up=${uploaded} fail=${failReasons.length}   `);
    } catch (e) {
      failReasons.push({ tokenId: t.tokenId, reason: `upload:${e.message}` });
    }
  });
  process.stdout.write("\n");

  const byId = new Map();
  for (const t of baked.tokens || []) {
    if (t.img && String(t.img).includes("r2.dev")) byId.set(String(t.tokenId), t);
  }
  for (const t of added) byId.set(String(t.tokenId), t);
  const dedup = [...byId.values()].sort((a, b) => {
    try {
      const ba = BigInt(a.tokenId), bb = BigInt(b.tokenId);
      return ba < bb ? -1 : ba > bb ? 1 : 0;
    } catch {
      return String(a.tokenId).localeCompare(String(b.tokenId));
    }
  });

  const payload = {
    ...baked,
    count: dedup.length,
    repairedAt: new Date().toISOString(),
    tokens: dedup,
  };
  writeFileSync(outFile, JSON.stringify(payload));
  try {
    await r2Put(`tokens/${chain}/${id}.json`, Buffer.from(JSON.stringify(payload)), "application/json");
  } catch (e) {
    console.warn("  ! R2 JSON:", e.message);
  }

  console.log(`  ✓ ${item.name}: ${dedup.length}/${cache.length} (+${added.length} up=${uploaded} fail=${failReasons.length})`);
  if (failReasons.length) {
    console.log(`  still sample:`, JSON.stringify(failReasons.slice(0, 8)));
  }
  return {
    name: item.name,
    chain,
    cache: cache.length,
    baked: dedup.length,
    fixed: added.length,
    still: failReasons.length,
    failReasons,
  };
}

async function main() {
  if (!CF_TOKEN) throw new Error("CF_API_TOKEN required");
  alchemyKey();
  mkdirSync(CACHE_DIR, { recursive: true });
  const only = (process.env.ONLY || "").toLowerCase();
  // Default: only collections that still have gaps
  const defaultTargets = ["steezy genesis", "chumpz", "forever undead"];
  const jobs = [
    ...ETHEREUM.map((it) => ({ chain: "ethereum", item: it })),
    ...APECHAIN.map((it) => ({ chain: "apechain", item: it })),
  ].filter(({ item }) => {
    const id = collectionId(item);
    const name = item.name.toLowerCase();
    if (only) return id.includes(only) || name.includes(only);
    return defaultTargets.some((t) => name.includes(t) || id.includes(t.replace(/\s+/g, "")));
  });

  const summary = [];
  for (const { chain, item } of jobs) {
    summary.push(await repairOne(chain, item));
    await sleep(800);
  }
  writeFileSync(join(CACHE_DIR, "hard-repair-summary.json"), JSON.stringify({ at: new Date().toISOString(), summary }, null, 2));
  console.log("\n=== HARD REPAIR DONE ===");
  for (const s of summary) {
    if (!s) continue;
    console.log(`${s.name}: baked=${s.baked}/${s.cache} fixed=${s.fixed} still=${s.still}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

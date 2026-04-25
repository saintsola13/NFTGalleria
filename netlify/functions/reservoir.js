// Netlify Function — multi-source NFT data proxy.
//
// ETH + ApeChain → Alchemy NFT API (key kept server-side)
// Solana       → Magic Eden v2 public API (no key required)
//
// Required env var: ALCHEMY_API_KEY  (only for ETH + Ape)
//
// Client request shapes (frontend talks to /api/reservoir/...):
//   GET /api/reservoir/<chain>/top?limit=25
//   GET /api/reservoir/<chain>/tokens?collection=<id>&limit=30
//
// Returns a normalized shape regardless of upstream.

const ALCHEMY_HOSTS = {
  ethereum: "eth-mainnet.g.alchemy.com",
  apechain: "apechain-mainnet.g.alchemy.com",
};

export default async (req) => {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("reservoir");
    const tail = idx >= 0 ? parts.slice(idx + 1) : parts;
    const chain = tail.shift();
    const action = tail.shift();

    if (!chain || !action) {
      return json({ error: "missing chain or action" }, 400);
    }

    if (action === "top") {
      const limit = clampInt(url.searchParams.get("limit"), 25, 1, 50);
      if (chain === "solana") return await topSolana(limit);
      if (chain === "ethereum" || chain === "apechain") return await topAlchemy(chain, limit);
      return json({ error: "unknown chain", chain }, 400);
    }

    if (action === "tokens") {
      const collection = url.searchParams.get("collection");
      const limit = clampInt(url.searchParams.get("limit"), 30, 1, 50);
      if (!collection) return json({ error: "missing collection" }, 400);
      if (chain === "solana") return await tokensSolana(collection, limit);
      if (chain === "ethereum" || chain === "apechain") return await tokensAlchemy(chain, collection, limit);
      return json({ error: "unknown chain", chain }, 400);
    }

    return json({ error: "unknown action", action }, 400);
  } catch (err) {
    return json({ error: "proxy failed", message: String(err?.message || err) }, 500);
  }
};

// ─── SOLANA via Magic Eden v2 ──────────────────────────────
async function topSolana(limit) {
  // Pull popular collections, sorted by 24h volume.
  const r = await fetch(
    `https://api-mainnet.magiceden.dev/v2/marketplace/popular_collections?limit=20&timeRange=1d`,
    { headers: { accept: "application/json" } },
  );
  if (!r.ok) {
    // Fallback to plain list
    const r2 = await fetch(
      `https://api-mainnet.magiceden.dev/v2/collections?offset=0&limit=20`,
      { headers: { accept: "application/json" } },
    );
    if (!r2.ok) return json({ collections: [] });
    const arr = await r2.json();
    const out = (arr || []).slice(0, limit).map(normSolanaCol);
    return cached(json({ collections: out }));
  }
  const arr = await r.json();
  const out = (arr || []).slice(0, limit).map(normSolanaCol);
  return cached(json({ collections: out }));
}

function normSolanaCol(c) {
  return {
    id: c.symbol,
    name: c.name,
    pfp: c.image,
    chain: "solana",
  };
}

async function tokensSolana(symbol, limit) {
  // ME requires offset+limit multiples of 20. Round up.
  const askLimit = Math.max(20, Math.ceil(limit / 20) * 20);
  const r = await fetch(
    `https://api-mainnet.magiceden.dev/v2/collections/${encodeURIComponent(symbol)}/listings?offset=0&limit=${askLimit}`,
    { headers: { accept: "application/json" } },
  );
  if (!r.ok) return json({ tokens: [] });
  const arr = await r.json();
  const tokens = (arr || []).slice(0, limit).map(t => ({
    id: t.tokenMint,
    tokenId: t.tokenMint ? t.tokenMint.slice(0, 6) : null,
    name: null,
    img: t.extra?.img || t.img || null,
  })).filter(t => t.img);
  return cached(json({ tokens }));
}

// ─── ETH + APECHAIN via Alchemy NFT API ────────────────────
async function topAlchemy(chain, limit) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return json({ error: "ALCHEMY_API_KEY not configured", collections: [] }, 500);
  const host = ALCHEMY_HOSTS[chain];
  // computeRarity / getTopNFTCollections — Alchemy has a "getTopNFTCollections" endpoint.
  // Endpoint: GET /nft/v3/{key}/getTopNFTCollections?period=24h
  const r = await fetch(
    `https://${host}/nft/v3/${key}/getTopNFTCollections?period=24h`,
    { headers: { accept: "application/json" } },
  );
  if (!r.ok) {
    const body = await r.text();
    return json({ error: "alchemy top failed", status: r.status, body: body.slice(0, 200), collections: [] }, 502);
  }
  const data = await r.json();
  const list = (data.collections || []).slice(0, limit);
  const out = list.map(c => ({
    id: c.address || c.contractAddress,
    name: c.name || c.collectionName || "Untitled",
    pfp: c.image?.cachedUrl || c.image?.originalUrl || c.imageUrl || c.collectionImage || null,
    chain,
  })).filter(c => c.id && c.name);
  return cached(json({ collections: out }));
}

async function tokensAlchemy(chain, contract, limit) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return json({ error: "ALCHEMY_API_KEY not configured", tokens: [] }, 500);
  const host = ALCHEMY_HOSTS[chain];
  const r = await fetch(
    `https://${host}/nft/v3/${key}/getNFTsForContract?contractAddress=${encodeURIComponent(contract)}&withMetadata=true&limit=${limit}`,
    { headers: { accept: "application/json" } },
  );
  if (!r.ok) {
    const body = await r.text();
    return json({ error: "alchemy tokens failed", status: r.status, body: body.slice(0, 200), tokens: [] }, 502);
  }
  const data = await r.json();
  const tokens = (data.nfts || []).map(n => ({
    id: `${contract}-${n.tokenId}`,
    tokenId: n.tokenId,
    name: n.name || null,
    img: n.image?.cachedUrl || n.image?.originalUrl || n.image?.thumbnailUrl || null,
  })).filter(t => t.img);
  return cached(json({ tokens }));
}

// ─── helpers ───────────────────────────────────────────────
function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cached(resp) {
  const r = new Response(resp.body, resp);
  r.headers.set("cache-control", "public, max-age=120, s-maxage=120");
  return r;
}

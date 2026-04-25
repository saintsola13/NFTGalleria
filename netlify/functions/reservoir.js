// Netlify Function — multi-source NFT data proxy.
//
// ETH + ApeChain → Alchemy NFT API (key kept server-side)
// Solana       → Magic Eden v2 public API (no key required)
//
// Required env var: ALCHEMY_API_KEY  (only for ETH + Ape)
//
// Client request shapes (frontend talks to /api/reservoir/...):
//   GET /api/reservoir/<chain>/collection?id=<contract|symbol>
//   GET /api/reservoir/<chain>/tokens?collection=<contract|symbol>&limit=30
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

    if (action === "collection") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "missing id" }, 400);
      if (chain === "solana") return await solanaCollection(id);
      if (chain === "ethereum" || chain === "apechain") return await alchemyCollection(chain, id);
      return json({ error: "unknown chain", chain }, 400);
    }

    if (action === "tokens") {
      const collection = url.searchParams.get("collection");
      const limit = clampInt(url.searchParams.get("limit"), 60, 1, 100);
      const pageKey = url.searchParams.get("pageKey") || null;
      if (!collection) return json({ error: "missing collection" }, 400);
      if (chain === "solana") return await tokensSolana(collection, limit);
      if (chain === "ethereum" || chain === "apechain") return await tokensAlchemy(chain, collection, limit, pageKey);
      return json({ error: "unknown chain", chain }, 400);
    }

    return json({ error: "unknown action", action }, 400);
  } catch (err) {
    return json({ error: "proxy failed", message: String(err?.message || err) }, 500);
  }
};

// ─── SOLANA via Magic Eden v2 ──────────────────────────────
async function solanaCollection(symbol) {
  const r = await fetch(
    `https://api-mainnet.magiceden.dev/v2/collections/${encodeURIComponent(symbol)}`,
    { headers: { accept: "application/json" } },
  );
  if (!r.ok) return json({ collection: null, status: r.status });
  const c = await r.json();
  return cached(json({ collection: {
    id: c.symbol,
    name: c.name,
    pfp: c.image,
    chain: "solana",
  }}));
}

async function tokensSolana(symbol, limit) {
  const askLimit = Math.max(20, Math.ceil(limit / 20) * 20);
  // listings only — fast and reliable. If a collection is sparse we'll just
  // show what's there.
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
async function alchemyCollection(chain, contract) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return json({ error: "ALCHEMY_API_KEY not configured", collection: null }, 500);
  const host = ALCHEMY_HOSTS[chain];

  // Alchemy v3 shape (top-level) for getContractMetadata:
  //   { address, name, symbol, totalSupply, tokenType, contractDeployer,
  //     openSeaMetadata: { collectionName, imageUrl, ... },
  //     ... }
  const r = await fetch(
    `https://${host}/nft/v3/${key}/getContractMetadata?contractAddress=${encodeURIComponent(contract)}`,
    { headers: { accept: "application/json" } },
  );
  if (!r.ok) {
    const body = await r.text();
    return json({ error: "alchemy meta failed", status: r.status, body: body.slice(0, 300), collection: null }, 502);
  }
  const c = await r.json();
  const os = c.openSeaMetadata || c.openSea || {};
  const name = os.collectionName || c.name || "Untitled";
  const pfp = os.imageUrl || c.image?.cachedUrl || c.image?.originalUrl || null;

  // If we couldn't get an image from contract metadata, fall back to fetching
  // the first NFT in the collection and using its image.
  let finalPfp = pfp;
  if (!finalPfp) {
    try {
      const r2 = await fetch(
        `https://${host}/nft/v3/${key}/getNFTsForContract?contractAddress=${encodeURIComponent(contract)}&withMetadata=true&limit=1`,
        { headers: { accept: "application/json" } },
      );
      if (r2.ok) {
        const d2 = await r2.json();
        const n0 = d2.nfts?.[0];
        finalPfp = n0?.image?.cachedUrl || n0?.image?.originalUrl || n0?.image?.thumbnailUrl || null;
      }
    } catch {}
  }

  return cached(json({ collection: {
    id: c.address || contract,
    name,
    pfp: finalPfp,
    chain,
  }}));
}

async function tokensAlchemy(chain, contract, limit, pageKey) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) return json({ error: "ALCHEMY_API_KEY not configured", tokens: [] }, 500);
  const host = ALCHEMY_HOSTS[chain];
  const params = new URLSearchParams({
    contractAddress: contract,
    withMetadata: "true",
    limit: String(limit),
  });
  if (pageKey) params.set("pageKey", pageKey);
  const r = await fetch(
    `https://${host}/nft/v3/${key}/getNFTsForContract?${params}`,
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
  return cached(json({
    tokens,
    pageKey: data.pageKey || null,
    totalSupply: data.contract?.totalSupply ? parseInt(data.contract.totalSupply) : null,
  }));
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
  // 1h on browser, 6h on Netlify edge — collection metadata barely changes
  // and Magic Eden rate-limits hard, so cache aggressively.
  r.headers.set("cache-control", "public, max-age=3600, s-maxage=21600");
  return r;
}

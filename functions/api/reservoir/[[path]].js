// Cloudflare Pages Function — Alchemy/ME proxy at /api/reservoir/<chain>/<action>
const ALCHEMY_HOSTS = {
  ethereum: "eth-mainnet.g.alchemy.com",
  apechain: "apechain-mainnet.g.alchemy.com",
};

export async function onRequest(context) {
  try {
    const { request, env, params } = context;
    const url = new URL(request.url);
    const parts = String(params.path || "").split("/").filter(Boolean);
    const chain = parts[0];
    const action = parts[1];
    if (!chain || !action) return json({ error: "missing chain or action" }, 400);

    if (action === "collection") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "missing id" }, 400);
      if (chain === "solana") return solanaCollection(id);
      if (chain === "ethereum" || chain === "apechain") return alchemyCollection(env, chain, id);
      return json({ error: "unknown chain", chain }, 400);
    }

    if (action === "tokens") {
      const collection = url.searchParams.get("collection");
      const limit = clampInt(url.searchParams.get("limit"), 60, 1, 100);
      const pageKey = url.searchParams.get("pageKey") || null;
      if (!collection) return json({ error: "missing collection" }, 400);
      if (chain === "solana") return tokensSolana(collection, limit);
      if (chain === "ethereum" || chain === "apechain") return tokensAlchemy(env, chain, collection, limit, pageKey);
      return json({ error: "unknown chain", chain }, 400);
    }

    return json({ error: "unknown action", action }, 400);
  } catch (err) {
    return json({ error: "proxy failed", message: String(err?.message || err) }, 500);
  }
}

async function solanaCollection(symbol) {
  const r = await fetch(`https://api-mainnet.magiceden.dev/v2/collections/${encodeURIComponent(symbol)}`, {
    headers: { accept: "application/json" },
  });
  if (!r.ok) return json({ collection: null, status: r.status });
  const c = await r.json();
  return cached(json({ collection: { id: c.symbol, name: c.name, pfp: c.image, chain: "solana" } }));
}

async function tokensSolana(symbol, limit) {
  const askLimit = Math.max(20, Math.ceil(limit / 20) * 20);
  const r = await fetch(
    `https://api-mainnet.magiceden.dev/v2/collections/${encodeURIComponent(symbol)}/listings?offset=0&limit=${askLimit}`,
    { headers: { accept: "application/json" } },
  );
  if (!r.ok) return json({ tokens: [] });
  const arr = await r.json();
  const tokens = (arr || [])
    .slice(0, limit)
    .map((t) => ({
      id: t.tokenMint,
      tokenId: t.tokenMint ? t.tokenMint.slice(0, 6) : null,
      name: null,
      img: t.extra?.img || t.img || null,
    }))
    .filter((t) => t.img);
  return cached(json({ tokens }));
}

async function alchemyCollection(env, chain, contract) {
  const key = env.ALCHEMY_API_KEY;
  if (!key) return json({ error: "ALCHEMY_API_KEY not configured", collection: null }, 500);
  const host = ALCHEMY_HOSTS[chain];
  const r = await fetch(
    `https://${host}/nft/v3/${key}/getContractMetadata?contractAddress=${encodeURIComponent(contract)}`,
    { headers: { accept: "application/json" } },
  );
  if (!r.ok) return json({ error: "alchemy meta failed", status: r.status, collection: null }, 502);
  const c = await r.json();
  const os = c.openSeaMetadata || c.openSea || {};
  let pfp = os.imageUrl || c.image?.cachedUrl || c.image?.originalUrl || null;
  if (!pfp) {
    try {
      const r2 = await fetch(
        `https://${host}/nft/v3/${key}/getNFTsForContract?contractAddress=${encodeURIComponent(contract)}&withMetadata=true&limit=1`,
        { headers: { accept: "application/json" } },
      );
      if (r2.ok) {
        const d2 = await r2.json();
        const n0 = d2.nfts?.[0];
        pfp = n0?.image?.cachedUrl || n0?.image?.originalUrl || n0?.image?.thumbnailUrl || null;
      }
    } catch {}
  }
  return cached(json({
    collection: {
      id: c.address || contract,
      name: os.collectionName || c.name || "Untitled",
      pfp,
      chain,
    },
  }));
}

async function tokensAlchemy(env, chain, contract, limit, pageKey) {
  const key = env.ALCHEMY_API_KEY;
  if (!key) return json({ error: "ALCHEMY_API_KEY not configured", tokens: [] }, 500);
  const host = ALCHEMY_HOSTS[chain];
  const params = new URLSearchParams({
    contractAddress: contract,
    withMetadata: "true",
    limit: String(limit),
  });
  if (pageKey) params.set("pageKey", pageKey);
  const r = await fetch(`https://${host}/nft/v3/${key}/getNFTsForContract?${params}`, {
    headers: { accept: "application/json" },
  });
  if (!r.ok) return json({ error: "alchemy tokens failed", status: r.status, tokens: [] }, 502);
  const data = await r.json();
  const tokens = (data.nfts || [])
    .map((n) => ({
      id: `${contract}-${n.tokenId}`,
      tokenId: n.tokenId,
      name: n.name || null,
      img: n.image?.cachedUrl || n.image?.originalUrl || n.image?.thumbnailUrl || null,
    }))
    .filter((t) => t.img);
  return cached(json({
    tokens,
    pageKey: data.pageKey || null,
    totalSupply: data.contract?.totalSupply ? parseInt(data.contract.totalSupply, 10) : null,
  }));
}

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
  r.headers.set("cache-control", "public, max-age=3600, s-maxage=21600");
  return r;
}

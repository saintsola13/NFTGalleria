// Netlify Function — proxies Reservoir API calls so the API key
// stays server-side and never ships to the browser.
//
// Required env var: RESERVOIR_API_KEY
//
// Request shape (from client):
//   GET /api/reservoir/<chain>/<reservoir-path>?<query>
//
// chain ∈ { ethereum, solana, apechain }

const BASES = {
  ethereum: "https://api.reservoir.tools",
  solana: "https://api-solana.reservoir.tools",
  apechain: "https://api-apechain.reservoir.tools",
};

export default async (req) => {
  try {
    const url = new URL(req.url);
    // Path is like /.netlify/functions/reservoir/ethereum/collections/v7
    // or /api/reservoir/ethereum/collections/v7 (via redirect)
    const parts = url.pathname.split("/").filter(Boolean);
    // Drop everything up to & including 'reservoir'
    const idx = parts.indexOf("reservoir");
    const tail = idx >= 0 ? parts.slice(idx + 1) : parts;
    const chain = tail.shift();
    const restPath = tail.join("/");

    if (!chain || !BASES[chain]) {
      return json({ error: "unknown chain", chain }, 400);
    }
    if (!restPath) {
      return json({ error: "missing reservoir path" }, 400);
    }

    const key = process.env.RESERVOIR_API_KEY;
    if (!key) {
      return json({ error: "RESERVOIR_API_KEY not configured" }, 500);
    }

    const upstream = `${BASES[chain]}/${restPath}${url.search}`;
    const r = await fetch(upstream, {
      headers: {
        accept: "application/json",
        "x-api-key": key,
      },
    });

    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") || "application/json",
        // Edge cache helps with marquee/grid bouncing
        "cache-control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (err) {
    return json({ error: "proxy failed", message: String(err) }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

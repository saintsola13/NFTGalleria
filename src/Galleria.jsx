import { useState, useEffect, useMemo } from "react";
import baked from "./data/collections.json";

const PROXY = "/api/reservoir";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const SOCIALS = [
  { handle: "@okinalabs", href: "https://x.com/okinalabs" },
  { handle: "@hmn5_NFT", href: "https://x.com/hmn5_NFT" },
  { handle: "@stzyapegang", href: "https://x.com/stzyapegang" },
  { handle: "@stzymfg", href: "https://x.com/stzymfg" },
];

function allCollections() {
  return [
    ...(baked.ethereum || []).map((c) => ({ ...c, chain: "ethereum" })),
    ...(baked.apechain || []).map((c) => ({ ...c, chain: "apechain" })),
  ].filter((c) => c.id && c.name);
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > CACHE_TTL_MS) return null;
    return v;
  } catch {
    return null;
  }
}
function cacheSet(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v }));
  } catch {}
}

async function fetchTokens(chain, collectionId, limit = 60, pageKey = null) {
  const k = `tok:${chain}:${collectionId}:${limit}:${pageKey || "first"}`;
  const c = cacheGet(k);
  if (c) return c;
  try {
    const params = new URLSearchParams({
      collection: collectionId,
      limit: String(limit),
    });
    if (pageKey) params.set("pageKey", pageKey);
    const r = await fetch(`${PROXY}/${chain}/tokens?${params}`);
    if (!r.ok) return { tokens: [], pageKey: null, totalSupply: null };
    const data = await r.json();
    const out = {
      tokens: (data.tokens || []).filter((t) => t.img),
      pageKey: data.pageKey || null,
      totalSupply: data.totalSupply || null,
    };
    cacheSet(k, out);
    return out;
  } catch {
    return { tokens: [], pageKey: null, totalSupply: null };
  }
}

function marketplaceUrl(chain, contract, tokenId) {
  if (!contract || tokenId == null) return null;
  if (chain === "ethereum") return `https://opensea.io/assets/ethereum/${contract}/${tokenId}`;
  if (chain === "apechain") return `https://opensea.io/assets/ape_chain/${contract}/${tokenId}`;
  return null;
}

function Marquee({ names }) {
  const list = useMemo(() => {
    const arr = names.length ? names : ["OKINA GALLERIA"];
    return [...arr, ...arr];
  }, [names]);
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {list.map((name, i) => (
          <span key={i} className="marquee-item">
            {name}
            <span className="marquee-sep">★</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function GlitchTitle({ text = "Okina Galleria", onClick }) {
  return (
    <button type="button" className="glitch-title" data-text={text} onClick={onClick} aria-label={text}>
      <span className="glitch-title-text">{text}</span>
    </button>
  );
}

function ImgWithFallback({ src, alt, className }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={`halftone ${className || ""}`} aria-label={alt} />;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function Galleria() {
  const collections = useMemo(() => allCollections(), []);
  const names = useMemo(() => collections.map((c) => c.name), [collections]);
  const [active, setActive] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageKey, setPageKey] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!active) {
      setTokens([]);
      setPageKey(null);
      return;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      const data = await fetchTokens(active.chain, active.id, 60);
      if (cancel) return;
      setTokens(data.tokens || []);
      setPageKey(data.pageKey || null);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [active]);

  async function loadMore() {
    if (!active || !pageKey || loadingMore) return;
    setLoadingMore(true);
    const data = await fetchTokens(active.chain, active.id, 60, pageKey);
    setTokens((prev) => [...prev, ...(data.tokens || [])]);
    setPageKey(data.pageKey || null);
    setLoadingMore(false);
  }

  return (
    <div className={`shell${active ? " is-open" : ""}`}>
      <div className="okina-bg" aria-hidden="true" />

      <header className="topbar">
        <Marquee names={names} />
      </header>

      <GlitchTitle onClick={() => setActive(null)} />

      <div className="workspace">
        {active ? (
          <main className="stage">
            <div className="stage-head">
              <button type="button" className="stage-back" onClick={() => setActive(null)}>
                ← collections
              </button>
              <h2 className="stage-title">{active.name}</h2>
            </div>

            {loading ? (
              <div className="stage-state">loading jpegs…</div>
            ) : tokens.length === 0 ? (
              <div className="stage-state">no tokens yet — alchemy key may be missing on Pages</div>
            ) : (
              <>
                <div className="token-grid">
                  {tokens.map((t) => {
                    const href = marketplaceUrl(active.chain, active.id, t.tokenId);
                    const inner = (
                      <>
                        <ImgWithFallback src={t.img} alt={t.name || `#${t.tokenId}`} className="token-img" />
                        <div className="token-cap">#{t.tokenId}</div>
                      </>
                    );
                    return href ? (
                      <a key={t.id} className="token-card" href={href} target="_blank" rel="noreferrer">
                        {inner}
                      </a>
                    ) : (
                      <div key={t.id} className="token-card">
                        {inner}
                      </div>
                    );
                  })}
                </div>
                {pageKey && (
                  <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "loading…" : "load more"}
                  </button>
                )}
              </>
            )}
          </main>
        ) : (
          <div className="stage stage-empty" aria-hidden="true" />
        )}

        <aside className="rail" aria-label="Collections">
          {collections.map((col) => {
            const selected = active?.id === col.id && active?.chain === col.chain;
            return (
              <button
                key={`${col.chain}:${col.id}`}
                type="button"
                className={`rail-card ${selected ? "is-active" : ""}`}
                onClick={() => setActive(col)}
              >
                <div className="rail-card-media">
                  <ImgWithFallback src={col.pfp} alt="" className="rail-card-img" />
                </div>
                <div className="rail-card-meta">
                  <div className="rail-card-name">{col.name}</div>
                  <div className="rail-card-chain">{col.chain === "apechain" ? "APE" : "ETH"}</div>
                </div>
              </button>
            );
          })}
        </aside>
      </div>

      <footer className="okina-banner">
        <img src="/okina-banner.jpg" alt="Okina — We are the sum of our curated experiences." className="okina-banner-img" />
        <div className="okina-banner-socials">
          {SOCIALS.map((s) => (
            <a key={s.handle} href={s.href} target="_blank" rel="noreferrer" className="okina-banner-link">
              {s.handle}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}

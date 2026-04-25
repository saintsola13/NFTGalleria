import { useState, useEffect, useMemo } from "react";

// ─────────────────────────────────────────────────────────────
//  NFT GALLERIA  —  Top 25 × 3 Chains
//  Curated as an art gallery. No floors. No prices. Just art.
//
//  Data: Reservoir (ETH / Solana / ApeChain) via Netlify Function
//  proxy at /api/reservoir/<chain>/<reservoir-path>
// ─────────────────────────────────────────────────────────────

const CHAINS = [
  { id: "ethereum", name: "ETHEREUM", tag: "ETH", color: "#00ff88", hot: "#ff2d6f" },
  { id: "solana",   name: "SOLANA",   tag: "SOL", color: "#b8ff00", hot: "#9945ff" },
  { id: "apechain", name: "APECHAIN", tag: "APE", color: "#ff6b00", hot: "#1a1aff" },
];

// Use the proxy. In dev Vite proxies it to the running netlify dev,
// in prod Netlify rewrites /api/reservoir/* -> /.netlify/functions/reservoir/*
const PROXY = "/api/reservoir";

// localStorage TTL for collection lists / token grids
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── tiny localStorage cache ────────────────────────────────
function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > CACHE_TTL_MS) return null;
    return v;
  } catch { return null; }
}
function cacheSet(key, v) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {}
}

// ─── Reservoir fetchers (proxied) ───────────────────────────
async function fetchTopCollections(chain, limit = 25) {
  const k = `top:${chain}:${limit}`;
  const c = cacheGet(k); if (c) return c;
  try {
    const r = await fetch(
      `${PROXY}/${chain}/collections/v7?sortBy=1DayVolume&limit=${limit}&includeTopBid=false`
    );
    if (!r.ok) return [];
    const data = await r.json();
    const out = (data.collections || [])
      .map(c => ({
        id: c.id,
        chain,
        name: c.name,
        pfp: c.image,
      }))
      .filter(c => c.id && c.name);
    cacheSet(k, out);
    return out;
  } catch { return []; }
}

async function fetchTokens(chain, collectionId, limit = 30) {
  const k = `tok:${chain}:${collectionId}:${limit}`;
  const c = cacheGet(k); if (c) return c;
  try {
    const r = await fetch(
      `${PROXY}/${chain}/tokens/v7?collection=${encodeURIComponent(collectionId)}&limit=${limit}&sortBy=tokenId`
    );
    if (!r.ok) return [];
    const data = await r.json();
    const out = (data.tokens || [])
      .map(t => ({
        id: t.token?.tokenId || t.token?.tokenAddress,
        tokenId: t.token?.tokenId,
        name: t.token?.name || null,
        img: t.token?.image || t.token?.imageSmall,
      }))
      .filter(t => t.img);
    cacheSet(k, out);
    return out;
  } catch { return []; }
}

// ─── Chain symbol SVGs ──────────────────────────────────────
const ChainSymbol = ({ chain }) => {
  if (chain === "ethereum") {
    return (
      <svg viewBox="0 0 256 417" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z"/>
        <path fill="currentColor" d="M127.962 0L0 212.32l127.962 75.639V154.158z" opacity="0.7"/>
        <path fill="currentColor" d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.6L256 236.587z"/>
        <path fill="currentColor" d="M127.962 416.905v-104.72L0 236.585z" opacity="0.7"/>
        <path fill="currentColor" d="M127.961 287.958l127.96-75.637-127.96-58.162z" opacity="0.4"/>
        <path fill="currentColor" d="M0 212.32l127.96 75.638v-133.8z" opacity="0.85"/>
      </svg>
    );
  }
  if (chain === "solana") {
    return (
      <svg viewBox="0 0 397 311" xmlns="http://www.w3.org/2000/svg">
        <path fill="currentColor" d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"/>
        <path fill="currentColor" d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"/>
        <path fill="currentColor" d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1L64.6 190c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.6z"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M50 10 C 30 10, 20 25, 20 40 C 15 42, 10 48, 10 55 C 10 62, 15 68, 22 70 C 20 80, 28 90, 38 90 L 62 90 C 72 90, 80 80, 78 70 C 85 68, 90 62, 90 55 C 90 48, 85 42, 80 40 C 80 25, 70 10, 50 10 Z M 35 45 C 38 42, 42 42, 45 45 C 45 50, 42 52, 38 52 C 35 50, 33 48, 35 45 Z M 55 45 C 58 42, 62 42, 65 45 C 67 48, 65 50, 62 52 C 58 52, 55 50, 55 45 Z M 40 65 L 60 65 C 58 72, 52 75, 50 75 C 48 75, 42 72, 40 65 Z"/>
    </svg>
  );
};

// ─── Halftone placeholder for failed images ─────────────────
function ImgWithFallback({ src, alt, className, style }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={`halftone ${className || ""}`} style={{ width: "100%", height: "100%", ...(style || {}) }} aria-label={alt} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}

// ─────────────────────────────────────────────────────────────
function Galleria() {
  const [view, setView] = useState({ screen: "home" });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  return (
    <div>
      <div className="paper" />

      <nav className="nav">
        <div className="wrap nav-inner">
          <button onClick={() => setView({ screen: "home" })} className="nav-logo">
            <span className="nav-logo-mark spin-slow" />
            <span className="f-big nav-title">NFT GALLERIA</span>
          </button>
          <div className="nav-status f-mono">
            <span className="dot pulse" />
            <span>ON-CHAIN // LIVE</span>
          </div>
        </div>
      </nav>

      {view.screen === "home" && (
        <HomeScreen mounted={mounted} onPick={(id) => setView({ screen: "chain", chain: id })} />
      )}
      {view.screen === "chain" && (
        <ChainScreen
          chainId={view.chain}
          onBack={() => setView({ screen: "home" })}
          onOpen={(col) => setView({ screen: "collection", chain: view.chain, col })}
        />
      )}
      {view.screen === "collection" && (
        <CollectionScreen
          collection={view.col}
          chainId={view.chain}
          onBack={() => setView({ screen: "chain", chain: view.chain })}
        />
      )}

      <footer className="footer">
        <div className="wrap footer-inner">
          <div className="footer-title">NFT GALLERIA ©</div>
          <div className="f-mono footer-meta">DATA: RESERVOIR</div>
          <div className="f-mono footer-meta">MMXXVI — TOP 25 × 3</div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function HomeScreen({ mounted, onPick }) {
  return (
    <main style={{ position: "relative", zIndex: 10, paddingBottom: "5rem" }}>
      <section className="hero">
        <div className={`wrap rise ${mounted ? "in" : ""}`}>
          <div style={{ position: "relative" }}>
            <h1 className="mega hero-title">
              <span style={{ display: "block" }}>NFT</span>
              <span className="italic">GALLE<span className="kick">R</span>IA</span>
            </h1>
            <div className="badge-est chunky sticker wobble f-big" style={{ transform: "rotate(14deg)" }}>
              TOP 25
            </div>
            <div className="badge-skate chunky sticker wobble f-mono" style={{ transform: "rotate(-8deg)" }}>
              ★ three chains · live ★
            </div>
          </div>
          <div className="hero-subrow f-mono">
            <span className="pill-black">ISSUE N° I</span>
            <span>—</span>
            <span>ETH / SOL / APE</span>
            <span>—</span>
            <span className="underline-hot">TOP 25 PER CHAIN</span>
            <span>—</span>
            <span className="pill-acid">LIVE DATA</span>
          </div>
        </div>
      </section>

      <section className="section-chains">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="eyebrow f-mono">§ 01 // PICK YR POISON</div>
              <div className="f-wild section-title">THE CHAINS</div>
            </div>
            <div className="eyebrow f-mono faded">↓ click to enter ↓</div>
          </div>
          <div className="chain-grid">
            {CHAINS.map((chain, i) => (
              <ChainCard key={chain.id} chain={chain} index={i} mounted={mounted} onClick={() => onPick(chain.id)} />
            ))}
          </div>
        </div>
      </section>

      <section className="quote-section">
        <div className="wrap">
          <div className="quote-grid">
            <div className="quote-col-main">
              <div className="quote-text f-big">
                "JPEGS ARE ART<br/>
                <span className="hot">AND THE GALLERY</span><br/>
                IS EVERYWHERE NOW."
              </div>
              <div className="quote-attr f-mono">— OVERHEARD, 3AM</div>
            </div>
            <div className="quote-col-card">
              <div className="about-card sticker rot-2">
                <div className="about-card-eyebrow f-mono">ABOUT THIS ISSUE</div>
                <div className="about-card-body f-mono">
                  Top 25 collections per chain, ranked by 24h volume —
                  pulled live from Reservoir. A gallery, not a marketplace.
                  Just the art.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ChainCard({ chain, index, mounted, onClick }) {
  const rot = ["rot-1", "rot-2", "rot-3"][index];
  return (
    <button
      onClick={onClick}
      className={`zine sticker chain-card ${rot} rise ${mounted ? "in" : ""}`}
      style={{ transitionDelay: `${200 + index * 120}ms` }}
    >
      <div className="tape" style={{ top: "-11px", left: "20px", transform: "rotate(-4deg)" }} />
      <div className="chain-card-tag">{chain.tag}</div>
      <div className="chain-card-img" style={{ background: chain.color }}>
        <div className="chain-glyph-svg" style={{ color: chain.hot }}>
          <ChainSymbol chain={chain.id} />
        </div>
      </div>
      <div className="chain-card-nameplate">
        <div className="chain-card-namerow">
          <div className="chain-card-name">{chain.name}</div>
          <div className="chain-card-num f-mono">№ 0{index + 1}</div>
        </div>
        <div className="chain-card-enter f-mono">
          <span className="sq" style={{ background: chain.hot }} />
          <span>TOP 25 · ENTER →</span>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
function ChainScreen({ chainId, onBack, onOpen }) {
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const chain = CHAINS.find(c => c.id === chainId);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const data = await fetchTopCollections(chainId, 25);
      if (cancel) return;
      setCols(data);
      setLoading(false);
      setTimeout(() => !cancel && setLoaded(true), 40);
    })();
    return () => { cancel = true; };
  }, [chainId]);

  return (
    <main className="fade-in" style={{ position: "relative", zIndex: 10, paddingBottom: "5rem" }}>
      <section className="chain-masthead" style={{ background: chain.color }}>
        <div className="wrap">
          <button onClick={onBack} className="back-btn f-mono hoverline">
            ← BACK TO CHAINS
          </button>
          <div className="chain-masthead-row">
            <div>
              <div className="chain-eyebrow f-mono">§ TOP 25 ON —</div>
              <h2 className="mega">{chain.name}</h2>
            </div>
            <div className="chain-counter">
              <div className="chain-counter-pill sticker">
                {chain.tag} · 25
              </div>
              <div className="chain-counter-label f-mono">
                {loading ? "loading..." : "top collections"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ position: "relative", paddingTop: "3rem" }}>
        <div className="wrap">
          {loading ? (
            <div className="state">
              <div className="dot-loader"><span/><span/><span/></div>
              <div className="state-body f-mono" style={{ textTransform: "uppercase", fontWeight: 700 }}>SUMMONING JPEGS</div>
            </div>
          ) : cols.length === 0 ? (
            <div className="state">
              <div className="state-title">No collections.</div>
              <div className="state-body f-mono">Reservoir didn't return anything for this chain right now. Try again in a sec.</div>
            </div>
          ) : (
            <div className="chain-grid-collections">
              {cols.map((c, i) => (
                <CollectionCard
                  key={c.id}
                  col={c}
                  index={i}
                  chain={chain}
                  loaded={loaded}
                  onClick={() => onOpen(c)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function CollectionCard({ col, index, chain, loaded, onClick }) {
  const rots = ["rot-1", "rot-2", "rot-3", "rot-4"];
  const rot = rots[index % 4];
  const colors = ["var(--hot)", "var(--acid)", "var(--electric)", "var(--orange)", "var(--purple)"];
  const bgColor = colors[index % colors.length];

  return (
    <button
      onClick={onClick}
      className={`zine sticker collection-card ${rot} rise ${loaded ? "in" : ""}`}
      style={{ transitionDelay: `${index * 30}ms` }}
    >
      <div className="collection-card-num f-big">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="collection-card-img" style={{ background: bgColor }}>
        <ImgWithFallback src={col.pfp} alt={col.name} />
      </div>
      <div className="collection-card-name">
        <div className="collection-card-title">{col.name}</div>
        <div className="collection-card-meta f-mono">
          <span>{chain.tag}</span>
          <span className="muted">view →</span>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
function CollectionScreen({ collection, chainId, onBack }) {
  const [pieces, setPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [focused, setFocused] = useState(null);
  const chain = CHAINS.find(c => c.id === chainId);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const data = await fetchTokens(chainId, collection.id, 30);
      if (cancel) return;
      setPieces(data);
      setLoading(false);
      setTimeout(() => !cancel && setLoaded(true), 40);
    })();
    return () => { cancel = true; };
  }, [chainId, collection.id]);

  return (
    <main className="fade-in" style={{ position: "relative", zIndex: 10, paddingBottom: "5rem" }}>
      <section className="collection-masthead" style={{ background: chain.color }}>
        <div className="wrap collection-masthead-inner">
          <button onClick={onBack} className="back-btn f-mono hoverline">
            ← BACK TO {chain.name}
          </button>
          <div className="collection-grid-head">
            <div className="collection-pfp-wrap">
              <div className="collection-pfp-card sticker rot-1">
                <div className="collection-pfp-inner">
                  <ImgWithFallback src={collection.pfp} alt={collection.name} />
                </div>
                <div className="collection-pfp-label f-mono">THE COLLECTION</div>
              </div>
            </div>
            <div className="collection-title-wrap">
              <div className="collection-title-eyebrow f-mono">
                § ON VIEW / {chain.name}
              </div>
              <h2 className="collection-title">{collection.name}</h2>
              <div className="collection-tags f-mono">
                <span className="tag tag-ink">{chain.tag}</span>
                {pieces.length > 0 && (
                  <span className="tag tag-white">{pieces.length} PIECES</span>
                )}
                <span className="tag tag-hot">LIVE FROM RESERVOIR</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pieces-section">
        <div className="wrap">
          {loading ? (
            <div className="state">
              <div className="dot-loader"><span/><span/><span/></div>
              <div className="state-body f-mono" style={{ textTransform: "uppercase", fontWeight: 700 }}>LOADING PIECES</div>
            </div>
          ) : pieces.length === 0 ? (
            <div className="state">
              <div className="state-body f-mono">No pieces on view rn. Try another collection.</div>
            </div>
          ) : (
            <div className="pieces-grid">
              {pieces.map((p, i) => (
                <Piece
                  key={p.id || i}
                  piece={p}
                  projectName={collection.name}
                  index={i}
                  loaded={loaded}
                  onClick={() => setFocused(p)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {focused && (
        <div className="lightbox pop" onClick={() => setFocused(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-card">
              <div className="lightbox-img">
                <ImgWithFallback src={focused.img} alt={focused.name || focused.tokenId} />
              </div>
              <div className="lightbox-meta">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="lightbox-title">{collection.name}</div>
                  <div className="lightbox-sub f-mono">
                    #{focused.tokenId || "—"} · {chain.name}
                  </div>
                </div>
                <button onClick={() => setFocused(null)} className="lightbox-close sticker">
                  ✕ CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Piece({ piece, projectName, index, loaded, onClick }) {
  const rotClass = ["rot-1", "rot-2", "rot-3", "rot-4", ""][index % 5];
  return (
    <button
      onClick={onClick}
      className={`polaroid ${rotClass} rise ${loaded ? "in" : ""}`}
      style={{ transitionDelay: `${index * 30}ms` }}
    >
      <div className="piece-img-wrap">
        <ImgWithFallback src={piece.img} alt={`${projectName} #${piece.tokenId || ""}`} />
      </div>
      <div className="piece-num">#{piece.tokenId || "—"}</div>
      <div className="piece-project f-mono">{projectName}</div>
    </button>
  );
}

export default Galleria;

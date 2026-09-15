import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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


const SOUND_KEY = "okina-sound-on";
const SOUND_SRC = "/okina-bg.mp3";

function SoundToggle() {
  const audioRef = useRef(null);
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.loop = true;
    el.volume = 0.55;
    if (on) {
      const play = el.play();
      if (play && typeof play.catch === "function") play.catch(() => setOn(false));
    } else {
      el.pause();
    }
    try {
      localStorage.setItem(SOUND_KEY, on ? "1" : "0");
    } catch {}
  }, [on]);

  const toggle = useCallback(() => {
    setOn((v) => !v);
  }, []);

  return (
    <>
      <audio ref={audioRef} src={SOUND_SRC} preload="metadata" playsInline />
      <button
        type="button"
        className={`sound-toggle${on ? " is-on" : ""}`}
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? "Sound on — tap to mute" : "Sound off — tap to play"}
        title={on ? "Sound on" : "Sound off"}
      >
        <span className="sound-toggle-icon" aria-hidden="true">
          {on ? "♪" : "🔇"}
        </span>
        <span className="sound-toggle-label">{on ? "SOUND ON" : "SOUND OFF"}</span>
      </button>
    </>
  );
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

function GlitchTitle({ onClick }) {
  return (
    <button type="button" className="glitch-title" onClick={onClick} aria-label="Okina Galleria">
      <img
        src="/okina-title.png"
        alt="Okina Galleria"
        className="glitch-title-img"
        draggable={false}
      />
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
  const [about, setAbout] = useState(false);

  useEffect(() => {
    if (!about) return;
    const onKey = (e) => { if (e.key === "Escape") setAbout(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [about]);

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

      <GlitchTitle onClick={() => setAbout(true)} />
      <SoundToggle />

      <div className="workspace">
        <aside className="rail" aria-label="Communities">
          <div className="rail-head">
            <span className="rail-kicker">Communities</span>
            <span className="rail-count">{collections.length}</span>
          </div>
          <div className="rail-list">
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
                    <div className="rail-card-chain">{col.chain === "apechain" ? "APECHAIN" : "ETHEREUM"}</div>
                  </div>
                  <span className="rail-card-chev" aria-hidden="true">›</span>
                </button>
              );
            })}
          </div>
        </aside>

        {active ? (
          <main className="stage">
            <div className="stage-head">
              <button type="button" className="stage-back" onClick={() => setActive(null)}>
                ← communities
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
                  {tokens.map((tok) => {
                    const href = marketplaceUrl(active.chain, tok.contract || active.contract || active.id, tok.tokenId);
                    const inner = (
                      <>
                        <ImgWithFallback src={tok.img} alt={tok.name || `#${tok.tokenId}`} className="token-img" />
                        <div className="token-cap">#{tok.tokenId}</div>
                      </>
                    );
                    return href ? (
                      <a key={tok.id} className="token-card" href={href} target="_blank" rel="noreferrer">
                        {inner}
                      </a>
                    ) : (
                      <div key={tok.id} className="token-card">
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
      </div>

      {about && (
        <div className="about-overlay" role="dialog" aria-modal="true" aria-label="About Okina">
          <button type="button" className="about-backdrop" aria-label="Close" onClick={() => setAbout(false)} />
          <div className="about-panel">
            <button type="button" className="about-close" onClick={() => setAbout(false)}>
              ✕ close
            </button>
            <div className="about-banner">
              <img
                src="/okina-banner.jpg"
                alt="Okina — We are the sum of our curated experiences."
                className="about-banner-img"
              />
            </div>
            <div className="about-socials" aria-label="Okina on X">
              {SOCIALS.map((s) => (
                <a key={s.handle} href={s.href} target="_blank" rel="noreferrer" className="about-social-tile">
                  <span className="about-social-x" aria-hidden="true">𝕏</span>
                  <span className="about-social-handle">{s.handle}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

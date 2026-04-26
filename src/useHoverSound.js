// useHoverSound — a soft click/tap sound on hover for any interactive element.
// Uses a single shared AudioContext + procedural sound (no audio file needed).
// Throttled per-element so rapid mouse movement doesn't spam.

import { useEffect } from "react";

let audioCtx = null;
function getCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return null; }
  }
  // Resume if suspended (browsers block audio until user interaction)
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Soft "tick" sound — short, low-volume, gallery-appropriate
function playTick() {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // High-pitched soft click using a short sine burst with envelope
  osc.type = "sine";
  osc.frequency.setValueAtTime(2400, now);
  osc.frequency.exponentialRampToValueAtTime(1800, now + 0.04);

  // Quick attack, fast decay — barely audible "tick"
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.06);
}

// Selectors that count as "interactive"
const HOVER_SELECTORS = [
  "button",
  "a[href]",
  "[role='button']",
  ".chain-card",
  ".collection-card",
  ".piece",
  ".load-more",
  ".back-btn",
  ".lightbox-close",
  ".nav-logo",
];

const HOVER_SELECTOR = HOVER_SELECTORS.join(", ");

// Track last-hovered element + throttle to avoid double-fires
let lastHoverTarget = null;
let lastPlayedAt = 0;
const MIN_INTERVAL_MS = 30;

export function useHoverSound() {
  useEffect(() => {
    function onMouseOver(e) {
      const target = e.target.closest(HOVER_SELECTOR);
      if (!target || target === lastHoverTarget) return;

      const now = performance.now();
      if (now - lastPlayedAt < MIN_INTERVAL_MS) return;

      lastHoverTarget = target;
      lastPlayedAt = now;
      playTick();
    }

    function onMouseOut(e) {
      // Reset when leaving an interactive element so re-entering plays again
      const target = e.target.closest(HOVER_SELECTOR);
      if (target === lastHoverTarget) {
        lastHoverTarget = null;
      }
    }

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);

    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, []);
}

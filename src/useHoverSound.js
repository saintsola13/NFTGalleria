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

// Soft muted "thock" — low-frequency, low-pass filtered, gentle envelope.
// Goes for a felt-pad / muted-keyboard tap rather than a UI chirp.
function playTick() {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  // Low triangle wave — woody, soft
  osc.type = "triangle";
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(280, now + 0.06);

  // Low-pass filter to kill the brightness
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, now);
  filter.Q.value = 0.5;

  // Gentle attack, mellow decay — felt pad tap vibe
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.025, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.1);
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

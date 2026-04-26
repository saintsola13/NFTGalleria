// useSwipeNav — mobile-friendly horizontal swipe gestures.
// Right swipe  → onSwipeRight (typically: go back)
// Left swipe   → onSwipeLeft  (typically: next item)
//
// Only fires for clearly horizontal swipes that exceed thresholds.
// Ignores swipes starting on form fields, buttons, or scrollable image areas
// to avoid hijacking native scroll/click intents.

import { useEffect } from "react";

const MIN_DISTANCE = 70;        // pixels: must travel at least this far
const MAX_VERTICAL = 60;        // pixels: max vertical drift to count as horizontal
const MAX_DURATION = 600;       // ms: must complete within this window
const EDGE_BUFFER = 16;         // pixels: ignore swipes too close to top/bottom edges

const IGNORE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function useSwipeNav({ onSwipeRight, onSwipeLeft } = {}) {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let active = false;

    function onTouchStart(e) {
      if (e.touches.length !== 1) { active = false; return; }
      const t = e.touches[0];
      const target = e.target;

      // Don't hijack form inputs
      if (target && IGNORE_TAGS.has(target.tagName)) {
        active = false;
        return;
      }

      // Don't capture if swipe begins inside the lightbox image (let pinch/zoom flow)
      if (target && target.closest && target.closest(".lightbox-img")) {
        active = false;
        return;
      }

      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
      active = true;
    }

    function onTouchEnd(e) {
      if (!active) return;
      active = false;

      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startTime;

      if (dt > MAX_DURATION) return;
      if (Math.abs(dy) > MAX_VERTICAL) return;
      if (Math.abs(dx) < MIN_DISTANCE) return;

      if (dx > 0) {
        onSwipeRight && onSwipeRight();
      } else {
        onSwipeLeft && onSwipeLeft();
      }
    }

    function onTouchCancel() { active = false; }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [onSwipeRight, onSwipeLeft]);
}

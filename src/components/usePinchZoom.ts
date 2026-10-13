"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "marginalia.coverWidth";
export const MIN_COVER = 64;
export const MAX_COVER = 340;

const clamp = (w: number) => Math.min(MAX_COVER, Math.max(MIN_COVER, w));

function defaultWidth() {
  if (typeof window === "undefined") return 150;
  return window.innerWidth < 640 ? 140 : 160;
}

/**
 * Pinch (touch) or trackpad-pinch (ctrl+wheel) anywhere on the page resizes the shelf's covers.
 * Returns the current cover width in px. Disabled while a panel or dialog is open.
 */
export function usePinchZoom(enabled: boolean): number {
  const [width, setWidth] = useState<number>(defaultWidth);
  const widthRef = useRef(width);
  widthRef.current = width;
  const pinch = useRef<{ dist: number; width: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore saved zoom.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      if (saved) setWidth(clamp(saved));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const update = useCallback((w: number) => {
    const next = clamp(w);
    setWidth(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(KEY, String(Math.round(next)));
      } catch {
        /* ignore */
      }
    }, 300);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch.current = { dist: dist(e.touches), width: widthRef.current };
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return;
      e.preventDefault(); // keep the browser from zooming the page
      update(pinch.current.width * (dist(e.touches) / pinch.current.dist));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
    };
    // Trackpad pinch arrives as ctrl+wheel in Chrome, Edge and Firefox.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      update(widthRef.current * Math.exp(-e.deltaY * 0.01));
    };
    // Safari's own gesture events.
    let gestureStart = 0;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = widthRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const scale = (e as Event & { scale?: number }).scale ?? 1;
      if (!pinch.current) update(gestureStart * scale);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("gesturestart", onGestureStart, { passive: false } as AddEventListenerOptions);
    window.addEventListener("gesturechange", onGestureChange, { passive: false } as AddEventListenerOptions);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("gesturestart", onGestureStart);
      window.removeEventListener("gesturechange", onGestureChange);
    };
  }, [enabled, update]);

  return width;
}

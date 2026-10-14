"use client";

import { useSyncExternalStore } from "react";

/**
 * Overlays (book panel, dialogs) live in the URL so the browser's Back/Forward buttons
 * (and swipe-back on phones) open and close them, refresh keeps them open, and books can be bookmarked.
 *   ?book=<id>           book panel
 *   ?add=scan|shelf|search   add dialogs
 *   ?discover=1          taste profile
 *   ?collection=<name>   "Discover more" for a collection
 */
export type NavKey = "book" | "add" | "discover" | "collection";
export type Nav = Partial<Record<NavKey, string>>;

const KEYS: NavKey[] = ["book", "add", "discover", "collection"];
const EVENT = "marginalia:nav";
const MARK = "marginaliaDepth";

let cache: { search: string; nav: Nav } = { search: "\u0000", nav: {} };

function read(): Nav {
  if (typeof window === "undefined") return {};
  const search = window.location.search;
  if (search !== cache.search) {
    const p = new URLSearchParams(search);
    const nav: Nav = {};
    for (const k of KEYS) {
      const v = p.get(k);
      if (v) nav[k] = v;
    }
    cache = { search, nav };
  }
  return cache.nav;
}

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useNav(): Nav {
  return useSyncExternalStore(subscribe, read, () => ({}));
}

function urlWith(patch: Partial<Record<NavKey, string | null>>): string {
  const p = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") p.delete(k);
    else p.set(k, v);
  }
  const qs = p.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
}

/** How many overlay steps we've pushed on top of the page the visitor arrived at. */
function depth(): number {
  return (window.history.state?.[MARK] as number | undefined) ?? 0;
}

/** Open something: adds a history entry so Back closes it. `replace` swaps the current entry instead. */
export function navOpen(patch: Partial<Record<NavKey, string | null>>, opts: { replace?: boolean } = {}) {
  const url = urlWith(patch);
  if (opts.replace) window.history.replaceState({ ...window.history.state, [MARK]: depth() }, "", url);
  else window.history.pushState({ ...window.history.state, [MARK]: depth() + 1 }, "", url);
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Close something (✕, Esc, backdrop). If we opened it, step back so Back/Forward stay in step;
 * if the page was loaded with it open (refresh, bookmark), just remove it from the URL.
 */
export function navClose(key: NavKey) {
  if (!read()[key]) return;
  if (depth() > 0) window.history.back();
  else navOpen({ [key]: null }, { replace: true });
}

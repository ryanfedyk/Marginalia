"use client";

import type { FirebaseWebConfig } from "./firebase-config";
import type { BookMetadata, Collection, CriticQuote, Recommendation, ShelfCandidate, TasteProfile } from "./types";

const COOLDOWN_KEY = "marginalia.aiCooldownUntil";
let cooldownUntil = 0;

/**
 * After Gemini says the plan limit is reached, automatic AI features (critic quotes, collections,
 * similar books) pause for a while so they don't keep spending the allowance. Buttons still work.
 */
export function aiCoolingDown(): boolean {
  if (!cooldownUntil && typeof sessionStorage !== "undefined") {
    try {
      cooldownUntil = Number(sessionStorage.getItem(COOLDOWN_KEY)) || 0;
    } catch {
      /* ignore */
    }
  }
  return Date.now() < cooldownUntil;
}

function startCooldown(minutes: number) {
  cooldownUntil = Date.now() + minutes * 60_000;
  try {
    sessionStorage.setItem(COOLDOWN_KEY, String(cooldownUntil));
  } catch {
    /* ignore */
  }
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) startCooldown((data as { code?: string }).code === "quota" ? 15 : 2);
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function lookupIsbn(isbn: string): Promise<BookMetadata> {
  return (await json<{ book: BookMetadata }>(await fetch(`/api/lookup?isbn=${encodeURIComponent(isbn)}`))).book;
}

export type Suggestion = BookMetadata & { thumbUrl?: string };

export async function suggest(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal });
  return (await json<{ suggestions: Suggestion[] }>(res)).suggestions;
}

export async function resolveTitle(title: string, author?: string): Promise<BookMetadata> {
  const q = new URLSearchParams({ title });
  if (author) q.set("author", author);
  const { book } = await json<{ book: BookMetadata | null }>(await fetch(`/api/resolve?${q}`));
  if (!book) throw new Error("No match found.");
  return book;
}

export async function readShelf(image: string, mediaType: string): Promise<ShelfCandidate[]> {
  const res = await fetch("/api/shelf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, mediaType }),
  });
  return (await json<{ books: ShelfCandidate[] }>(res)).books;
}

export async function discover(
  books: { title: string; author: string; status: string; rating?: number; notes: string[] }[],
): Promise<Omit<TasteProfile, "generatedAt" | "basis">> {
  const res = await fetch("/api/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ books }),
  });
  return (await json<{ profile: Omit<TasteProfile, "generatedAt" | "basis"> }>(res)).profile;
}

/** Stream text from the Companion, calling onChunk with the accumulated response. */
export async function streamCompanion(
  payload: unknown,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/companion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) await json(res);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onChunk(text);
  }
  return text;
}

export async function fetchPraise(title: string, authors: string[]): Promise<CriticQuote[]> {
  const res = await fetch("/api/praise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, authors }),
  });
  return (await json<{ quotes: CriticQuote[] }>(res)).quotes;
}

export async function fetchSimilar(payload: {
  title: string;
  authors: string[];
  rating?: number;
  owned: string[];
  favourites: string[];
}): Promise<Recommendation[]> {
  const res = await fetch("/api/similar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await json<{ books: Recommendation[] }>(res)).books;
}

export async function drawCollections(
  books: { id: string; title: string; author: string; status: string; rating?: number }[],
): Promise<Collection[]> {
  const res = await fetch("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ books }),
  });
  return (await json<{ collections: Collection[] }>(res)).collections;
}

export async function fetchCollectionRecs(payload: {
  name: string;
  blurb: string;
  books: string[];
  owned: string[];
  favourites: string[];
}): Promise<Recommendation[]> {
  const res = await fetch("/api/collection-recs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await json<{ books: Recommendation[] }>(res)).books;
}

export async function fetchUpNext(payload: unknown): Promise<{ index: number; why: string }[]> {
  const res = await fetch("/api/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await json<{ picks: { index: number; why: string }[] }>(res)).picks;
}

export async function aiStatus(): Promise<{ ai: boolean; model: string; firebase: FirebaseWebConfig | null }> {
  return json(await fetch("/api/status"));
}

/** Downscale a photo in the browser so uploads are fast and fit the model's image limits. */
export async function prepareImage(file: File, maxEdge = 2000): Promise<{ data: string; mediaType: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const preview = canvas.toDataURL("image/jpeg", 0.88);
  return { data: preview.split(",")[1], mediaType: "image/jpeg", preview };
}

/** Marketplace search links for a recommendation. */
export function marketplaceLinks(title: string, author: string, isbn?: string) {
  const q = encodeURIComponent(`${title} ${author}`.trim());
  return [
    { label: "Bookshop.org", href: isbn ? `https://bookshop.org/book/${isbn}` : `https://bookshop.org/search?keywords=${q}` },
    { label: "Amazon", href: `https://www.amazon.com/s?k=${isbn ?? q}&i=stripbooks` },
    { label: "AbeBooks", href: isbn ? `https://www.abebooks.com/servlet/SearchResults?isbn=${isbn}` : `https://www.abebooks.com/servlet/SearchResults?kn=${q}` },
    { label: "Library", href: `https://www.worldcat.org/search?q=${isbn ?? q}` },
  ];
}

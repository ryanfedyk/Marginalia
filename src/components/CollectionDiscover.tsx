"use client";

import { useEffect, useState } from "react";
import { fetchCollectionRecs } from "@/lib/client";
import { useLibrary } from "@/lib/store";
import type { Book, Recommendation } from "@/lib/types";
import { RecommendationItem } from "./DiscoveryPanel";

/** Picks for rows that aren't saved collections (e.g. "The Ones You Loved"), kept for this visit. */
const transient = new Map<string, Recommendation[]>();

export function CollectionDiscover({
  name,
  blurb,
  books,
  cached,
  aiReady,
}: {
  name: string;
  blurb: string;
  books: Book[];
  /** True for AI-drawn collections, whose picks are saved with the collection. */
  cached: boolean;
  aiReady: boolean | null;
}) {
  const saved = useLibrary((s) => s.collections?.items.find((c) => c.name === name)?.recs?.items);
  const setCollectionRecs = useLibrary((s) => s.setCollectionRecs);
  const [items, setItems] = useState<Recommendation[] | undefined>(cached ? saved : transient.get(name));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached && saved) setItems(saved);
  }, [cached, saved]);

  async function load() {
    const all = useLibrary.getState().books;
    setLoading(true);
    setError(null);
    try {
      const recs = await fetchCollectionRecs({
        name,
        blurb,
        books: books.map((b) => `${b.title} — ${b.authors[0] ?? ""}`),
        owned: all.map((b) => `${b.title} — ${b.authors[0] ?? ""}`),
        favourites: all.filter((b) => (b.rating ?? 0) >= 4).map((b) => `${b.title} — ${b.authors[0] ?? ""}`),
      });
      setItems(recs);
      if (cached) setCollectionRecs(name, { items: recs, fetchedAt: new Date().toISOString() });
      else transient.set(name, recs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Opening the dialog is the request: load straight away if there's nothing saved yet.
  useEffect(() => {
    if (!items && aiReady) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <p className="-mt-1 text-sm text-muted">
        {blurb ? `${blurb} ` : ""}Books you don’t own yet that belong here.
      </p>
      {aiReady === false && <p className="mt-4 text-xs text-muted">Needs GEMINI_API_KEY on the server.</p>}
      {loading && !items?.length && (
        <ul className="mt-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-5 border-b border-rule py-6 last:border-0">
              <div className="aspect-[2/3] w-20 animate-pulse rounded-[3px] bg-paper-3" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 w-1/2 animate-pulse rounded bg-paper-3" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-paper-3" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-paper-3" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-4 text-sm text-accent">
          {error}{" "}
          <button className="text-ink underline underline-offset-4" onClick={load}>
            Try again
          </button>
        </p>
      )}
      {items && items.length > 0 && (
        <>
          <ul className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
            {items.map((r) => (
              <RecommendationItem key={`${r.title}|${r.author}`} rec={r} />
            ))}
          </ul>
          <button
            className="mt-4 text-xs text-faint underline-offset-4 hover:text-ink hover:underline"
            disabled={loading}
            onClick={load}
          >
            {loading ? "Finding more…" : "Show me different ones"}
          </button>
        </>
      )}
      {items && items.length === 0 && !loading && <p className="mt-6 text-sm text-faint">Nothing new to suggest for this one yet.</p>}
    </div>
  );
}

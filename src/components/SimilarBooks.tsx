"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSimilar } from "@/lib/client";
import { useLibrary } from "@/lib/store";
import type { Book } from "@/lib/types";
import { RecommendationItem } from "./DiscoveryPanel";

export function SimilarBooks({ book, aiReady }: { book: Book; aiReady: boolean | null }) {
  const setSimilar = useLibrary((s) => s.setSimilar);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef<string | null>(null);

  async function load() {
    const books = useLibrary.getState().books;
    setLoading(true);
    setError(null);
    try {
      const items = await fetchSimilar({
        title: book.title,
        authors: book.authors,
        rating: book.rating,
        owned: books.map((b) => `${b.title} — ${b.authors[0] ?? ""}`),
        favourites: books
          .filter((b) => (b.rating ?? 0) >= 4 && b.id !== book.id)
          .map((b) => `${b.title} — ${b.authors[0] ?? ""}`),
      });
      setSimilar(book.id, { items, fetchedAt: new Date().toISOString(), rating: book.rating });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch on first view, and again if the reader's rating has changed since.
  const stale = !book.similar || book.similar.rating !== book.rating;
  const key = `${book.id}:${book.rating ?? 0}`;
  useEffect(() => {
    if (!aiReady || !stale || requested.current === key) return;
    requested.current = key;
    const t = setTimeout(load, 600); // let a quick run of star taps settle
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiReady, stale, key]);

  const items = book.similar?.items ?? [];

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Similar books</p>
        {items.length > 0 && !loading && (
          <button className="text-[11px] text-faint underline-offset-4 hover:text-ink hover:underline" onClick={load}>
            Refresh
          </button>
        )}
      </div>
      {aiReady === false && <p className="mt-3 text-xs text-muted">Needs GEMINI_API_KEY on the server.</p>}
      {loading && items.length === 0 && (
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
        <p className="mt-3 text-sm text-accent">
          {error}{" "}
          <button className="text-ink underline underline-offset-4" onClick={load}>
            Try again
          </button>
        </p>
      )}
      {items.length > 0 && (
        <ul className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
          {items.map((r) => (
            <RecommendationItem key={`${r.title}|${r.author}`} rec={r} />
          ))}
        </ul>
      )}
      {!loading && !error && book.similar && items.length === 0 && (
        <p className="mt-3 text-sm text-faint">Nothing close enough to suggest yet.</p>
      )}
    </section>
  );
}

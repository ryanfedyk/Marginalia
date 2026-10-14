"use client";

import { useEffect, useState } from "react";
import { aiCoolingDown, fetchPraise } from "@/lib/client";
import { useLibrary } from "@/lib/store";
import type { Book, CriticQuote } from "@/lib/types";
import { BookCover } from "./BookCover";

const STALE_MS = 1000 * 60 * 60 * 24 * 30;
const inflight = new Set<string>();
/** Don't retry a failed lookup on every render; wait a while. */
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 30 * 60_000;

/** The books in hand, set apart from the shelf, each with a critic's line that changes every visit. */
export function ReadingNow({ books, aiReady, onOpen }: { books: Book[]; aiReady: boolean | null; onOpen: (id: string) => void }) {
  const setPraise = useLibrary((s) => s.setPraise);
  const [, rerender] = useState(0);

  // Look up critics' quotes once per book (refreshed monthly).
  useEffect(() => {
    if (!aiReady || aiCoolingDown()) return;
    for (const b of books) {
      const fresh = b.praise && Date.now() - new Date(b.praise.fetchedAt).getTime() < STALE_MS;
      if (fresh || inflight.has(b.id)) continue;
      if (Date.now() - (failedAt.get(b.id) ?? 0) < RETRY_AFTER_MS) continue;
      inflight.add(b.id);
      fetchPraise(b.title, b.authors)
        .then((quotes) => setPraise(b.id, { quotes, fetchedAt: new Date().toISOString() }))
        .catch(() => failedAt.set(b.id, Date.now()))
        .finally(() => {
          inflight.delete(b.id);
          rerender((n) => n + 1);
        });
      rerender((n) => n + 1);
    }
  }, [books, aiReady, setPraise]);

  if (!books.length) return null;
  const solo = books.length === 1;

  return (
    <section className="animate-rise-in mb-16 sm:mb-20">
      <p className="eyebrow mb-5">Currently reading</p>
      <ul className={`grid gap-5 ${solo ? "" : "lg:grid-cols-2"}`}>
        {books.map((b) => (
          <li key={b.id}>
            <button
              onClick={() => onOpen(b.id)}
              className="group flex w-full gap-5 rounded-3xl border border-rule bg-paper-2/70 p-5 text-left transition hover:border-[#d6d3cc] hover:bg-paper-2 sm:gap-8 sm:p-8"
            >
              <div className={`shrink-0 transition duration-500 group-hover:-translate-y-1 ${solo ? "w-28 sm:w-40" : "w-24 sm:w-32"}`}>
                <BookCover title={b.title} author={b.authors[0]} src={b.coverUrl} size="md" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className={`font-serif leading-tight text-ink-2 ${solo ? "text-2xl sm:text-[30px]" : "text-xl sm:text-2xl"}`}>{b.title}</p>
                <p className="mt-1 text-sm text-muted">{b.authors.join(", ")}</p>
                {b.progress && <p className="mt-1 text-xs text-faint">At {b.progress}</p>}
                <Praise book={b} large={solo} loading={Boolean(aiReady) && !b.praise && inflight.has(b.id)} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Praise({ book, large, loading }: { book: Book; large: boolean; loading: boolean }) {
  const quotes = book.praise?.quotes ?? [];
  const [quote, setQuote] = useState<CriticQuote | null>(null);

  // A different quote each time the library is opened.
  useEffect(() => {
    if (!quotes.length) return setQuote(null);
    const key = `marginalia.praise.${book.id}`;
    let last = -1;
    try {
      last = Number(localStorage.getItem(key) ?? -1);
    } catch {
      /* ignore */
    }
    let i = Math.floor(Math.random() * quotes.length);
    if (quotes.length > 1 && i === last) i = (i + 1) % quotes.length;
    try {
      localStorage.setItem(key, String(i));
    } catch {
      /* ignore */
    }
    setQuote(quotes[i]);
    // Only re-pick when the set of quotes changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.praise?.fetchedAt]);

  if (loading) {
    return (
      <div className="mt-auto space-y-2 pt-6" aria-hidden>
        <div className="h-3 w-11/12 animate-pulse rounded bg-rule/70" />
        <div className="h-3 w-8/12 animate-pulse rounded bg-rule/70" />
      </div>
    );
  }
  if (!quote) {
    const n = book.notes.length;
    return n ? <p className="mt-auto pt-6 text-xs text-faint">{n} {n === 1 ? "note" : "notes"} in the margins</p> : null;
  }
  const by = [quote.critic, quote.publication].filter(Boolean);
  return (
    <figure key={quote.quote} className="animate-fade-in mt-auto pt-6">
      <blockquote
        className={`font-serif italic leading-relaxed text-ink/85 ${large ? "text-[17px] sm:text-[19px] line-clamp-6" : "text-[15px] line-clamp-5"}`}
      >
        “{quote.quote}”
      </blockquote>
      {by.length > 0 && (
        <figcaption className="mt-2 text-[11px] tracking-wide text-muted">
          — {quote.critic}
          {quote.critic && quote.publication ? ", " : ""}
          {quote.publication && <span className="italic">{quote.publication}</span>}
        </figcaption>
      )}
    </figure>
  );
}

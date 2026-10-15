"use client";

import { useEffect, useRef, useState } from "react";
import { aiCoolingDown, fetchUpNext } from "@/lib/client";
import { ago } from "@/lib/flashback";
import { upNextFingerprint, useLibrary } from "@/lib/store";
import type { Book } from "@/lib/types";
import { BookCover } from "./BookCover";

const entry = (b: Book) => ({
  title: b.title,
  author: b.authors.join(", "),
  rating: b.rating,
  notes: b.notes.map((n) => n.body),
});

/** Top of the Want-to-read view: which of these to pick up next, and why. */
export function UpNext({ books, aiReady, onOpen }: { books: Book[]; aiReady: boolean | null; onOpen: (id: string) => void }) {
  const upNext = useLibrary((s) => s.upNext);
  const setUpNext = useLibrary((s) => s.setUpNext);
  const updateBook = useLibrary((s) => s.updateBook);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef<string | null>(null);

  const want = books.filter((b) => b.status === "want");
  const fp = upNextFingerprint(books);
  const stale = !upNext || upNext.fingerprint !== fp;

  async function load() {
    const all = useLibrary.getState().books;
    const wantNow = all.filter((b) => b.status === "want");
    const fingerprint = upNextFingerprint(all);
    setLoading(true);
    setError(null);
    try {
      const picks = await fetchUpNext({
        want: wantNow.map((b) => ({ ...entry(b), waiting: `added ${ago(b.addedAt)}` })),
        reading: all.filter((b) => b.status === "reading").map((b) => ({ ...entry(b), waiting: b.progress ? `at ${b.progress}` : undefined })),
        recent: all
          .filter((b) => b.status === "finished")
          .sort((a, b) => (b.finishedAt ?? b.updatedAt).localeCompare(a.finishedAt ?? a.updatedAt))
          .slice(0, 10)
          .map(entry),
        favourites: all.filter((b) => (b.rating ?? 0) >= 4).map((b) => `${b.title} — ${b.authors[0] ?? ""}`),
      });
      setUpNext({
        picks: picks.map((p) => ({ bookId: wantNow[p.index]?.id, why: p.why })).filter((p) => p.bookId),
        fingerprint,
        generatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Refresh when the pile, current reading or ratings change (debounced; one request).
  useEffect(() => {
    if (!aiReady || want.length < 2 || !stale || requested.current === fp || aiCoolingDown()) return;
    const t = setTimeout(() => {
      requested.current = fp;
      void load();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiReady, want.length, stale, fp]);

  if (want.length < 2) return null;

  const byId = new Map(want.map((b) => [b.id, b]));
  const picks = (upNext?.picks ?? []).flatMap((p) => (byId.has(p.bookId) ? [{ book: byId.get(p.bookId)!, why: p.why }] : []));

  return (
    <section className="animate-rise-in mb-14 sm:mb-16" aria-label="Up next">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <p className="eyebrow">Up next</p>
        {picks.length > 0 && (
          <button className="text-[11px] text-faint underline-offset-4 hover:text-ink hover:underline" disabled={loading} onClick={load}>
            {loading ? "Rethinking…" : "Rethink"}
          </button>
        )}
      </div>

      {aiReady === false && <p className="text-xs text-muted">Suggestions need GEMINI_API_KEY on the server.</p>}

      {picks.length === 0 && (loading || (aiReady && !error)) && (
        <ul className="grid gap-4 md:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-4 rounded-2xl border border-rule p-4">
              <div className="aspect-[2/3] w-16 animate-pulse rounded-[3px] bg-paper-3" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 w-3/4 animate-pulse rounded bg-paper-3" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-paper-3" />
                <div className="h-3 w-full animate-pulse rounded bg-paper-3" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && picks.length === 0 && (
        <p className="text-sm text-accent">
          {error}{" "}
          <button className="text-ink underline underline-offset-4" onClick={load}>
            Try again
          </button>
        </p>
      )}

      {picks.length > 0 && (
        <ol className={`grid gap-4 transition-opacity md:grid-cols-3 ${loading ? "opacity-50" : ""}`}>
          {picks.map(({ book, why }, i) => (
            <li key={book.id} className="flex gap-4 rounded-2xl border border-rule bg-paper-2/60 p-4 sm:p-5">
              <button onClick={() => onOpen(book.id)} className="w-16 shrink-0 self-start sm:w-20" aria-label={`Open ${book.title}`}>
                <BookCover title={book.title} src={book.coverUrl} size="sm" />
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[10px] tabular-nums text-faint">{i + 1}</span>
                <button onClick={() => onOpen(book.id)} className="text-left">
                  <p className="font-serif text-[17px] leading-snug text-ink-2 line-clamp-2">{book.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">{book.authors[0]}</p>
                </button>
                <p className="mt-2 text-[13px] leading-relaxed text-ink/80">{why}</p>
                <button
                  className="btn btn-ghost mt-auto h-8 self-start px-3 text-xs"
                  style={{ marginTop: "0.9rem" }}
                  onClick={() => updateBook(book.id, { status: "reading" })}
                >
                  Start reading
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

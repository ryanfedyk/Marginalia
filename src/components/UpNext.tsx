"use client";

import { useEffect, useRef, useState } from "react";
import { aiCoolingDown, fetchUpNext } from "@/lib/client";
import { ago } from "@/lib/flashback";
import { upNextFingerprint, useLibrary } from "@/lib/store";
import type { Book } from "@/lib/types";
import { BookCover } from "./BookCover";
import { todayContext } from "@/lib/season";

const entry = (b: Book) => ({
  title: b.title,
  author: b.authors.join(", "),
  pages: b.pageCount,
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
  const [shown, setShown] = useState(0);

  const want = books.filter((b) => b.status === "want");
  const when = todayContext();
  // Picks also refresh when the month turns, so the season can play its part.
  const fp = `${upNextFingerprint(books)}:${when.month}`;
  const stale = !upNext || upNext.fingerprint !== fp;

  async function load() {
    const all = useLibrary.getState().books;
    const wantNow = all.filter((b) => b.status === "want");
    const ctx = todayContext();
    const fingerprint = `${upNextFingerprint(all)}:${ctx.month}`;
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
        today: ctx.today,
        season: ctx.season,
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
  const current = picks.length ? picks[shown % picks.length] : null;

  // "Another suggestion" walks the ranked picks we already have; only after the last does it ask again.
  const another = () => {
    if (shown + 1 < picks.length) setShown(shown + 1);
    else {
      setShown(0);
      void load();
    }
  };

  return (
    <section className="animate-rise-in mb-12 border-l-2 border-rule pl-5 sm:mb-14 sm:pl-6" aria-label="Up next">
      <p className="eyebrow mb-3">Up next</p>

      {aiReady === false && <p className="text-xs text-muted">Suggestions need GEMINI_API_KEY on the server.</p>}

      {!current && (loading || (aiReady && !error)) && (
        <div className="flex gap-4" aria-hidden>
          <div className="aspect-[2/3] w-12 animate-pulse rounded-[3px] bg-paper-3" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-48 animate-pulse rounded bg-paper-3" />
            <div className="h-3 w-full max-w-md animate-pulse rounded bg-paper-3" />
          </div>
        </div>
      )}

      {error && !current && (
        <p className="text-sm text-accent">
          {error}{" "}
          <button className="text-ink underline underline-offset-4" onClick={load}>
            Try again
          </button>
        </p>
      )}

      {current && (
        <div key={current.book.id} className={`animate-fade-in flex gap-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
          <button onClick={() => onOpen(current.book.id)} className="w-12 shrink-0 self-start" aria-label={`Open ${current.book.title}`}>
            <BookCover title={current.book.title} src={current.book.coverUrl} size="xs" />
          </button>
          <div className="min-w-0 max-w-2xl">
            <button onClick={() => onOpen(current.book.id)} className="text-left">
              <span className="font-serif text-[17px] leading-snug text-ink-2">{current.book.title}</span>
              <span className="text-sm text-muted"> · {current.book.authors[0]}</span>
            </button>
            <p className="mt-1 text-[13px] leading-relaxed text-ink/80">{current.why}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-faint">
              <button className="text-ink underline-offset-4 hover:underline" onClick={() => updateBook(current.book.id, { status: "reading" })}>
                Start reading
              </button>
              <span aria-hidden>·</span>
              <button className="underline-offset-4 hover:text-ink hover:underline" disabled={loading} onClick={another}>
                {loading ? "Thinking…" : "Another suggestion"}
              </button>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { navClose, navOpen, useNav } from "@/lib/nav";
import { aiCoolingDown, drawCollections } from "@/lib/client";
import { useLibrary } from "@/lib/store";
import type { Book } from "@/lib/types";
import { BookCover } from "./BookCover";
import { CollectionDiscover } from "./CollectionDiscover";
import { Dialog } from "./Dialog";

interface Row {
  key: string;
  name: string;
  blurb: string;
  books: Book[];
  /** Offer "Discover more"; `saved` means picks are stored with the collection. */
  discover?: "saved" | "transient";
}

let drawing = false;

/** Netflix-style rows: AI-named collections plus a few rows computed from the reader's own data. */
export function CollectionsView({
  books,
  coverWidth,
  aiReady,
  onOpen,
}: {
  books: Book[];
  coverWidth: number;
  aiReady: boolean | null;
  onOpen: (id: string) => void;
}) {
  const collections = useLibrary((s) => s.collections);
  const setCollections = useLibrary((s) => s.setCollections);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draw() {
    if (drawing) return;
    drawing = true;
    setLoading(true);
    setError(null);
    try {
      const all = useLibrary.getState().books;
      const items = await drawCollections(
        all.map((b) => ({ id: b.id, title: b.title, author: b.authors.join(", "), status: b.status, rating: b.rating })),
      );
      setCollections({ items, generatedAt: new Date().toISOString(), basisIds: all.map((b) => b.id) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      drawing = false;
      setLoading(false);
    }
  }

  // Draw automatically the first time.
  useEffect(() => {
    if (aiReady && !collections && books.length >= 4 && !drawing && !aiCoolingDown()) void draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiReady, collections, books.length]);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(books.map((b) => [b.id, b]));
    const basis = new Set(collections?.basisIds ?? []);
    const out: Row[] = [];

    const fresh = collections ? books.filter((b) => !basis.has(b.id)).sort((a, b) => b.addedAt.localeCompare(a.addedAt)) : [];
    if (fresh.length) out.push({ key: "fresh", name: "Fresh on the Shelf", blurb: "Added since your collections were last drawn.", books: fresh });

    const ai = (collections?.items ?? [])
      .map((c, i) => ({
        key: `c${i}`,
        name: c.name,
        blurb: c.blurb,
        books: c.bookIds.map((id) => byId.get(id)).filter((b): b is Book => Boolean(b)),
        discover: "saved" as const,
      }))
      .filter((r) => r.books.length >= 2);

    const loved = books.filter((b) => (b.rating ?? 0) >= 5);
    const lovedRow: Row | null =
      loved.length >= 2
        ? { key: "loved", name: "The Ones You Loved", blurb: "Every book you gave five stars.", books: loved, discover: "transient" }
        : null;

    // Favourites sit just below the first couple of curated rows.
    out.push(...ai.slice(0, 2));
    if (lovedRow) out.push(lovedRow);
    out.push(...ai.slice(2));

    if (collections) {
      const placed = new Set(out.flatMap((r) => r.books.map((b) => b.id)));
      const rest = books.filter((b) => !placed.has(b.id));
      if (rest.length) out.push({ key: "rest", name: "Still Finding Their Place", blurb: "Books that don’t fit a collection yet.", books: rest });
    }
    return out;
  }, [books, collections]);

  // "Discover more" is a history step too: ?collection=<name>
  const nav = useNav();
  const discovering = nav.collection ? (rows.find((r) => r.name === nav.collection && r.discover) ?? null) : null;
  const setDiscovering = (r: Row) => navOpen({ collection: r.name });

  const newCount = collections ? books.filter((b) => !collections.basisIds.includes(b.id)).length : 0;
  const worthRedrawing = newCount >= Math.max(3, Math.round((collections?.basisIds.length ?? 0) * 0.15));

  if (!collections) {
    return (
      <div>
        {loading || (aiReady && books.length >= 4 && !error) ? (
          <>
            <p className="mb-10 animate-pulse font-serif text-[15px] italic text-faint">Drawing your collections…</p>
            {[0, 1].map((i) => (
              <div key={i} className="mb-14" aria-hidden>
                <div className="mb-5 h-5 w-56 animate-pulse rounded bg-paper-3" />
                <div className="flex gap-6 overflow-hidden">
                  {[0, 1, 2, 3, 4, 5].map((j) => (
                    <div key={j} className="aspect-[2/3] shrink-0 animate-pulse rounded-[3px] bg-paper-3" style={{ width: coverWidth }} />
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <p className="py-16 text-center text-sm text-faint">
            {aiReady === false ? "Collections need GEMINI_API_KEY on the server." : "Add a few more books and Marginalia will group them into collections."}
          </p>
        )}
        {error && (
          <p className="text-sm text-accent">
            {error}{" "}
            <button className="underline underline-offset-4" onClick={draw}>Try again</button>
          </p>
        )}
      </div>
    );
  }

  const drawnOn = new Date(collections.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const redrawButton = (label: string, className: string) => (
    <button className={className} disabled={loading || aiReady === false} onClick={draw}>
      {loading ? "Redrawing…" : label}
    </button>
  );

  return (
    <div>
      {worthRedrawing && !loading ? (
        <div className="animate-fade-in mb-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-paper-2/70 px-5 py-4">
          <p className="text-sm text-muted">
            <span className="text-ink">{newCount} books</span> have arrived since these collections were drawn.
          </p>
          {redrawButton("Redraw collections", "btn btn-primary h-9 px-4 text-xs")}
        </div>
      ) : (
        <div className="-mt-4 mb-8 flex items-center justify-end gap-3 text-[11px] text-faint">
          <span>Drawn {drawnOn}</span>
          {redrawButton("Redraw", "underline-offset-4 hover:text-ink hover:underline")}
        </div>
      )}
      {error && <p className="-mt-6 mb-8 text-right text-xs text-accent">{error}</p>}
      {loading && <p className="mb-8 animate-pulse font-serif text-[15px] italic text-faint">Redrawing your collections…</p>}
      <div className={`transition-opacity duration-300 ${loading ? "opacity-40" : ""}`}>
        {rows.map((r, i) => (
          <CollectionRow key={r.key} row={r} coverWidth={coverWidth} onOpen={onOpen} onDiscover={setDiscovering} index={i} />
        ))}
      </div>
      <Dialog open={Boolean(discovering)} onClose={() => navClose("collection")} eyebrow="Discover more" title={discovering?.name ?? ""} wide>
        {discovering && (
          <CollectionDiscover
            key={discovering.key}
            name={discovering.name}
            blurb={discovering.blurb}
            books={discovering.books}
            cached={discovering.discover === "saved"}
            aiReady={aiReady}
          />
        )}
      </Dialog>
    </div>
  );
}

function CollectionRow({
  row,
  coverWidth,
  onOpen,
  onDiscover,
  index,
}: {
  row: Row;
  coverWidth: number;
  onOpen: (id: string) => void;
  onDiscover: (row: Row) => void;
  index: number;
}) {
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const width = Math.min(260, Math.max(84, coverWidth));
  const gap = Math.round(Math.min(32, Math.max(12, width * 0.16)));

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
  };
  useEffect(measure, [row.books.length, width]);

  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <section className="animate-rise-in group/row mb-12 sm:mb-14" style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}>
      <header className="mb-4 flex items-baseline gap-3">
        <h2 className="font-serif text-[21px] leading-tight text-ink-2 sm:text-[23px]">{row.name}</h2>
        <span className="text-[11px] tabular-nums text-faint">{row.books.length}</span>
        {row.discover && (
          <button
            onClick={() => onDiscover(row)}
            className="ml-auto shrink-0 text-xs text-muted underline-offset-4 transition hover:text-ink hover:underline"
          >
            Discover more →
          </button>
        )}
      </header>
      {row.blurb && <p className="-mt-3 mb-5 text-xs text-muted">{row.blurb}</p>}
      <div className="relative">
        <ul
          ref={scroller}
          onScroll={measure}
          className="no-scrollbar -mx-5 flex snap-x snap-mandatory overflow-x-auto scroll-px-5 px-5 pt-1 pb-6 sm:-mx-10 sm:scroll-px-10 sm:px-10 lg:-mx-14 lg:scroll-px-14 lg:px-14"
          style={{ gap }}
        >
          {row.books.map((b) => (
            <li key={b.id} className="shrink-0 snap-start" style={{ width }}>
              <button onClick={() => onOpen(b.id)} className="group block w-full text-left" aria-label={`${b.title} by ${b.authors.join(", ")}`}>
                <div className="transition duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-1.5 [&>div]:transition-shadow [&>div]:duration-500 group-hover:[&>div]:shadow-cover-lift">
                  <BookCover title={b.title} author={b.authors[0]} src={b.coverUrl} />
                </div>
                {width >= 100 && (
                  <>
                    <p className="mt-3 line-clamp-2 font-serif text-[14px] leading-snug text-ink-2">{b.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-faint">{b.authors[0] ?? ""}</p>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
        {!edges.start && <ArrowButton side="left" onClick={() => scrollBy(-1)} />}
        {!edges.end && <ArrowButton side="right" onClick={() => scrollBy(1)} />}
      </div>
    </section>
  );
}

function ArrowButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      className={`absolute top-[30%] hidden size-10 items-center justify-center rounded-full border border-rule bg-paper/95 text-ink opacity-0 shadow-cover backdrop-blur transition group-hover/row:opacity-100 hover:bg-paper sm:flex ${side === "left" ? "-left-3" : "-right-3"}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={side === "left" ? "M14.5 6l-6 6 6 6" : "M9.5 6l6 6-6 6"} />
      </svg>
    </button>
  );
}

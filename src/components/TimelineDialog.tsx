"use client";

import { useMemo } from "react";
import { buildTimeline, type YearOfReading } from "@/lib/timeline";
import type { Book } from "@/lib/types";
import { BookCover } from "./BookCover";
import { Dialog } from "./Dialog";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PILE_MAX = 6;

/** Your reading life: each year a row of months, each month a little pile of the covers finished in it. */
export function TimelineDialog({ open, onClose, books, onOpenBook }: { open: boolean; onClose: () => void; books: Book[]; onOpenBook: (id: string) => void }) {
  const { years, undated } = useMemo(() => buildTimeline(books), [books]);
  const total = years.reduce((n, y) => n + y.count, 0);

  return (
    <Dialog open={open} onClose={onClose} eyebrow="Timeline" title="Your reading life" wide>
      {years.length === 0 ? (
        <p className="py-6 text-sm leading-relaxed text-muted">
          Your timeline starts here. Each time you mark a book <span className="text-ink">Finished</span>, it takes its place in the month you
          finished it, and the years fill in as you read.
        </p>
      ) : (
        <p className="-mt-1 text-sm text-muted">
          {total} {total === 1 ? "book" : "books"} across {years.length} {years.length === 1 ? "year" : "years"}.
        </p>
      )}

      {years.map((y) => (
        <YearRow key={y.year} y={y} onOpenBook={onOpenBook} />
      ))}

      {undated.length > 0 && (
        <section className="mt-12 border-t border-rule pt-8">
          <h3 className="font-serif text-lg text-ink-2">Before Marginalia</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {undated.length} finished {undated.length === 1 ? "book has" : "books have"} no date yet. Open one and set when you finished it to place it on
            the timeline.
          </p>
          <ul className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2">
            {undated.map((b) => (
              <li key={b.id} className="w-9 shrink-0">
                <button onClick={() => onOpenBook(b.id)} title={`${b.title}: set a finish date`} aria-label={`${b.title}: set a finish date`} className="block w-full opacity-70 transition hover:opacity-100">
                  <BookCover title={b.title} src={b.coverUrl} size="xs" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  );
}

function YearRow({ y, onOpenBook }: { y: YearOfReading; onOpenBook: (id: string) => void }) {
  const now = new Date();
  const isCurrent = y.year === now.getFullYear();
  const facts = [
    `${y.count} ${y.count === 1 ? "book" : "books"}`,
    y.pages ? `${y.pages.toLocaleString()} pages` : null,
    y.topAuthor ? `most read: ${y.topAuthor.name} (${y.topAuthor.count})` : null,
  ].filter(Boolean);

  return (
    <section className="mt-10" aria-label={`${y.year}: ${facts.join(", ")}`}>
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-serif text-[28px] leading-none text-ink-2 tabular-nums">{y.year}</h3>
        <p className="text-xs text-muted">{facts.join(" · ")}</p>
      </header>

      <ol className="grid grid-cols-12 items-end gap-1 sm:gap-2">
        {y.months.map((list, m) => {
          const future = isCurrent && m > now.getMonth();
          const shown = list.slice(-PILE_MAX);
          return (
            <li key={m} className="flex flex-col items-center" aria-label={`${MONTH_NAMES[m]}: ${list.length ? list.map((b) => b.title).join(", ") : "none"}`}>
              {/* The pile: covers overlap, newest on top. */}
              <div className="flex min-h-12 w-full flex-col items-center justify-end">
                {list.length > PILE_MAX && <span className="mb-1 text-[9px] text-faint tabular-nums">+{list.length - PILE_MAX}</span>}
                {shown.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => onOpenBook(b.id)}
                    title={`${b.title}, finished ${MONTH_NAMES[m]} ${y.year}`}
                    aria-label={`${b.title}, finished ${MONTH_NAMES[m]} ${y.year}`}
                    className="relative w-full max-w-[44px] transition duration-300 hover:z-10 hover:-translate-y-1"
                    style={{ marginTop: i === 0 ? 0 : "-72%", zIndex: i }}
                  >
                    <BookCover title={b.title} src={b.coverUrl} size="xs" className="ring-2 ring-paper" />
                  </button>
                ))}
              </div>
              <span className={`mt-2 border-t pt-1.5 text-center text-[10px] w-full ${future ? "border-rule/50 text-faint/50" : "border-rule text-faint"}`}>
                {MONTHS[m]}
              </span>
            </li>
          );
        })}
      </ol>

      {y.favourite && (
        <button onClick={() => onOpenBook(y.favourite!.id)} className="mt-4 flex items-center gap-3 text-left">
          <span className="w-6 shrink-0">
            <BookCover title={y.favourite.title} src={y.favourite.coverUrl} size="xs" />
          </span>
          <span className="text-xs text-muted">
            Favourite of the year: <span className="font-serif text-[14px] italic text-ink">{y.favourite.title}</span>{" "}
            <span className="text-faint">{"★".repeat(y.favourite.rating ?? 0)}</span>
          </span>
        </button>
      )}
    </section>
  );
}

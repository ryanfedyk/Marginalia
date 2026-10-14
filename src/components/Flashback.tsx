"use client";

import { useEffect, useState } from "react";
import { pickFlashback, type Flashback as FB } from "@/lib/flashback";
import type { Book } from "@/lib/types";
import { NOTE_LABELS } from "@/lib/types";

const KEY = "marginalia.flashback.last";

/** One note brought back from the margins: a different one on each visit. Quiet by design. */
export function Flashback({ books, onOpenBook, onOpenAll }: { books: Book[]; onOpenBook: (id: string) => void; onOpenAll: () => void }) {
  const [fb, setFb] = useState<FB | null>(null);
  const noteCount = books.reduce((n, b) => n + b.notes.length, 0);

  const pick = (avoid?: string | null) => {
    let last = avoid;
    if (last === undefined) {
      try {
        last = localStorage.getItem(KEY);
      } catch {
        last = null;
      }
    }
    const next = pickFlashback(books, last);
    setFb(next);
    try {
      if (next) localStorage.setItem(KEY, next.note.id);
    } catch {
      /* ignore */
    }
  };

  // Pick once per visit (and again if notes appear for the first time).
  useEffect(() => {
    if (!fb && noteCount) pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteCount]);

  if (!fb) return null;
  const { note, book, when, onThisDay } = fb;
  const isQuote = note.kind === "quote";
  const text = isQuote ? `“${note.body.replace(/^[“"]|[”"]$/g, "")}”` : note.body;

  return (
    <section className="animate-fade-in mb-14 border-l-2 border-rule pl-5 sm:mb-16 sm:pl-6" aria-label="From your margins">
      <p className="eyebrow mb-3">{onThisDay ? when : "From your margins"}</p>
      <button onClick={() => onOpenBook(book.id)} className="block max-w-3xl text-left" title={`Open ${book.title}`}>
        <p
          key={note.id}
          className={`animate-fade-in line-clamp-4 leading-relaxed text-ink/85 ${isQuote ? "font-serif text-[18px] italic sm:text-[20px]" : "text-[15px]"}`}
        >
          {text}
        </p>
      </button>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint">
        <span>
          {NOTE_LABELS[note.kind]} · <span className="italic">{book.title}</span>
          {note.locator ? ` · ${note.locator}` : ""}
          {onThisDay ? "" : ` · ${when}`}
        </span>
        <span aria-hidden>·</span>
        <button className="underline-offset-4 hover:text-ink hover:underline" onClick={() => pick(note.id)}>
          Another
        </button>
        <span aria-hidden>·</span>
        <button className="underline-offset-4 hover:text-ink hover:underline" onClick={onOpenAll}>
          All marginalia ({noteCount})
        </button>
      </p>
    </section>
  );
}

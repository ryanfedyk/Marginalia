"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLibrary } from "@/lib/store";
import { STATUS_LABELS, type ReadingStatus } from "@/lib/types";
import { BookCover } from "./BookCover";
import { CompanionTab } from "./CompanionTab";
import { DiscoveryPanel } from "./DiscoveryPanel";
import { MarginaliaTab } from "./MarginaliaTab";
import { Rating } from "./Rating";
import { SimilarBooks } from "./SimilarBooks";
import { useEscape } from "./Dialog";
import { CloseIcon } from "./icons";

type Tab = "marginalia" | "companion" | "discovery";
const TABS: { id: Tab; label: string }[] = [
  { id: "marginalia", label: "Marginalia" },
  { id: "companion", label: "Companion" },
  { id: "discovery", label: "Discovery" },
];

export function BookPanel({ bookId, onClose, aiReady }: { bookId: string | null; onClose: () => void; aiReady: boolean | null }) {
  const book = useLibrary((s) => s.books.find((b) => b.id === bookId));
  const { updateBook, removeBook } = useLibrary();
  const [tab, setTab] = useState<Tab>("marginalia");
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEscape(Boolean(book), onClose);

  // Every book opens on Marginalia; nothing from the previous book's tabs carries over
  // (and Discovery doesn't fire Gemini requests just because it was the last tab used).
  useEffect(() => {
    setTab("marginalia");
    setConfirmRemove(false);
    document.getElementById("book-panel-scroll")?.scrollTo({ top: 0 });
  }, [bookId]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!book) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [book]);

  if (!book || typeof document === "undefined") return null;

  const year = book.publishedDate?.match(/\d{4}/)?.[0];
  const meta = [book.publisher, year, book.pageCount ? `${book.pageCount} pages` : null].filter(Boolean).join(" · ");

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="animate-fade-in absolute inset-0 bg-[#1a1a1a]/15" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        className="animate-slide-in absolute inset-y-0 right-0 flex w-full max-w-[640px] flex-col bg-paper shadow-sheet"
      >
        <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2 sm:px-8">
          <button onClick={onClose} className="-ml-2 rounded-full p-2 text-muted hover:bg-paper-2 hover:text-ink" aria-label="Close">
            <CloseIcon />
          </button>
          {confirmRemove ? (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted">Remove from library?</span>
              <button className="text-accent" onClick={() => { removeBook(book.id); onClose(); }}>Remove</button>
              <button className="text-muted hover:text-ink" onClick={() => setConfirmRemove(false)}>Keep</button>
            </div>
          ) : (
            <button className="text-xs text-faint hover:text-ink" onClick={() => setConfirmRemove(true)}>Remove</button>
          )}
        </div>

        <div id="book-panel-scroll" className="flex-1 overflow-y-auto px-5 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-10">
          <header className="flex flex-col items-center pt-4 pb-8 text-center">
            <div className="w-40 sm:w-44">
              <BookCover title={book.title} author={book.authors[0]} src={book.coverUrl} size="lg" />
            </div>
            <h1 className="mt-8 font-serif text-[28px] leading-[1.15] tracking-[-0.01em] text-ink-2 text-balance sm:text-[32px]">
              {book.title}
            </h1>
            {book.subtitle && <p className="mt-2 font-serif text-[17px] italic text-muted text-balance">{book.subtitle}</p>}
            <p className="mt-3 text-[15px] text-ink">{book.authors.join(", ") || "Unknown author"}</p>
            {meta && <p className="mt-1.5 text-xs text-faint">{meta}</p>}

            <div className="mt-6 flex flex-wrap justify-center gap-1 rounded-full border border-rule p-1">
              {(Object.keys(STATUS_LABELS) as ReadingStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => updateBook(book.id, { status: s })}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${book.status === s ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Rating value={book.rating} onChange={(rating) => updateBook(book.id, { rating })} />
            </div>
          </header>

          <nav className="sticky top-0 z-10 -mx-5 flex gap-7 border-b border-rule bg-paper/95 px-5 backdrop-blur sm:-mx-10 sm:px-10">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative py-4 font-serif text-[17px] transition ${tab === t.id ? "text-ink-2" : "text-faint hover:text-muted"}`}
              >
                {t.label}
                {t.id === "marginalia" && book.notes.length > 0 && (
                  <span className="ml-1.5 align-top font-sans text-[10px] tabular-nums text-faint">{book.notes.length}</span>
                )}
                {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-px bg-ink" />}
              </button>
            ))}
          </nav>

          <div key={`${book.id}:${tab}`} className="animate-fade-in pt-8">
            {tab === "marginalia" && <MarginaliaTab book={book} />}
            {tab === "companion" && <CompanionTab book={book} aiReady={aiReady} />}
            {tab === "discovery" && (
              <>
                <SimilarBooks book={book} aiReady={aiReady} />
                <div className="my-12 h-px bg-rule" />
                <DiscoveryPanel aiReady={aiReady} />
              </>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

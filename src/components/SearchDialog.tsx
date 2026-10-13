"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { BookCover } from "./BookCover";
import { SearchIcon } from "./icons";
import { suggest, type Suggestion } from "@/lib/client";
import { useLibrary } from "@/lib/store";
import type { BookMetadata } from "@/lib/types";

/** Bold the part of the title the reader has typed, the way search engines do. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-ink-2">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

export function SearchDialog({ open, onClose, onOpenBook }: { open: boolean; onClose: () => void; onOpenBook: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const { addBook, findDuplicate } = useLibrary();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setPicked(null);
      setError(null);
      setSearched("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Live suggestions: debounce keystrokes and cancel stale requests.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setSearched("");
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const s = await suggest(q, ctrl.signal);
        setResults(s);
        setActive(0);
        setSearched(q);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Search is unavailable right now.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      setPicked(results[active]);
    }
  }

  const toMeta = ({ thumbUrl: _thumb, ...m }: Suggestion): BookMetadata => m;

  return (
    <Dialog open={open} onClose={onClose} eyebrow="Add a book" title="Search">
      {picked ? (
        <Picked
          book={picked}
          duplicate={Boolean(findDuplicate(picked))}
          onBack={() => {
            setPicked(null);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          onAdd={() => {
            const { book } = addBook(toMeta(picked));
            onOpenBook(book.id);
          }}
        />
      ) : (
        <div className="min-h-[50dvh] sm:min-h-[420px]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
            <input
              ref={inputRef}
              className="field pl-10"
              placeholder="Title, author or ISBN"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="search-suggestions"
              aria-activedescendant={results.length ? `suggestion-${active}` : undefined}
            />
            {loading && (
              <span className="absolute top-1/2 right-3.5 size-3.5 -translate-y-1/2 animate-spin rounded-full border border-faint border-t-transparent" />
            )}
          </div>

          {results.length > 0 && (
            <ul id="search-suggestions" role="listbox" className={`mt-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
              {results.map((r, i) => {
                const owned = Boolean(findDuplicate(r));
                return (
                  <li key={`${r.title}|${r.authors[0]}|${i}`} id={`suggestion-${i}`} role="option" aria-selected={i === active}>
                    <button
                      onMouseEnter={() => setActive(i)}
                      onClick={() => setPicked(r)}
                      className={`flex w-full items-center gap-4 rounded-xl px-2 py-2.5 text-left transition ${i === active ? "bg-paper-2" : ""}`}
                    >
                      <div className="w-9 shrink-0">
                        <BookCover title={r.title} src={r.thumbUrl} size="xs" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-serif text-[15px] text-muted">
                          <Highlight text={r.title} query={searched} />
                        </p>
                        <p className="truncate text-xs text-faint">
                          {[r.authors.slice(0, 2).join(", "), r.publishedDate?.match(/\d{4}/)?.[0]].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {owned && <span className="shrink-0 text-[11px] text-accent">On your shelf</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && searched && results.length === 0 && !error && (
            <p className="mt-8 text-center text-sm text-faint">No books found for “{searched}”.</p>
          )}
          {error && <p className="mt-4 text-sm text-accent">{error}</p>}
          {!query.trim() && (
            <p className="mt-8 text-center font-serif text-[15px] italic text-faint">Start typing — suggestions appear as you go.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}

function Picked({ book, duplicate, onAdd, onBack }: { book: Suggestion; duplicate: boolean; onAdd: () => void; onBack: () => void }) {
  const year = book.publishedDate?.match(/\d{4}/)?.[0];
  return (
    <div className="animate-rise-in">
      <button onClick={onBack} className="mb-6 text-xs text-muted hover:text-ink">← Back to results</button>
      <div className="flex items-center gap-6">
        <div className="w-28 shrink-0">
          <BookCover title={book.title} author={book.authors[0]} src={book.coverUrl ?? book.thumbUrl} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-xl leading-snug text-ink-2">{book.title}</p>
          {book.subtitle && <p className="mt-0.5 font-serif text-sm italic text-muted">{book.subtitle}</p>}
          <p className="mt-1 text-sm text-muted">{book.authors.join(", ") || "Unknown author"}</p>
          <p className="mt-1 text-xs text-faint">
            {[book.publisher, year, book.pageCount ? `${book.pageCount} pages` : null].filter(Boolean).join(" · ")}
          </p>
          <button className="btn btn-primary mt-5" onClick={onAdd}>
            {duplicate ? "Open it" : "Add to library"}
          </button>
        </div>
      </div>
    </div>
  );
}

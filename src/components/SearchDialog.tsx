"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { BookCover } from "./BookCover";
import { lookupIsbn, resolveTitle } from "@/lib/client";
import { toIsbn13 } from "@/lib/isbn";
import { useLibrary } from "@/lib/store";
import type { BookMetadata } from "@/lib/types";

export function SearchDialog({ open, onClose, onOpenBook }: { open: boolean; onClose: () => void; onOpenBook: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [result, setResult] = useState<BookMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addBook, findDuplicate } = useLibrary();

  useEffect(() => {
    if (open) {
      setTitle("");
      setAuthor("");
      setResult(null);
      setError(null);
    }
  }, [open]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const isbn = toIsbn13(title);
      setResult(isbn ? await lookupIsbn(isbn) : await resolveTitle(title.trim(), author.trim() || undefined));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const dup = result ? findDuplicate(result) : undefined;

  return (
    <Dialog open={open} onClose={onClose} eyebrow="Add a book" title="Find by title or ISBN">
      <form onSubmit={search} className="space-y-3">
        <input className="field" placeholder="Title or ISBN" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <input className="field" placeholder="Author (optional)" value={author} onChange={(e) => setAuthor(e.target.value)} />
        <button className="btn btn-primary w-full" disabled={!title.trim() || loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p className="mt-4 text-sm text-accent">{error}</p>}
      {result && (
        <div className="animate-rise-in mt-6 flex items-center gap-5 border-t border-rule pt-6">
          <div className="w-20 shrink-0">
            <BookCover title={result.title} author={result.authors[0]} src={result.coverUrl} size="sm" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-lg leading-snug text-ink-2">{result.title}</p>
            <p className="mt-0.5 text-sm text-muted">{result.authors.join(", ") || "Unknown author"}</p>
            <button
              className="btn btn-primary mt-3 h-9 px-4 text-xs"
              onClick={() => {
                const { book } = addBook(result);
                onOpenBook(book.id);
              }}
            >
              {dup ? "Open it" : "Add to library"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

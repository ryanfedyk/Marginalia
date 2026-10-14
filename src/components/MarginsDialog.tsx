"use client";

import { useMemo, useState } from "react";
import { ago } from "@/lib/flashback";
import { NOTE_LABELS, type Book, type NoteKind } from "@/lib/types";
import { Dialog } from "./Dialog";

/** A commonplace book: every note, quote and reaction across the library. */
export function MarginsDialog({ open, onClose, books, onOpenBook }: { open: boolean; onClose: () => void; books: Book[]; onOpenBook: (id: string) => void }) {
  const [kind, setKind] = useState<NoteKind | "all">("all");
  const [q, setQ] = useState("");

  const all = useMemo(
    () =>
      books
        .flatMap((book) => book.notes.map((note) => ({ note, book })))
        .sort((a, b) => b.note.createdAt.localeCompare(a.note.createdAt)),
    [books],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const { note } of all) c[note.kind] = (c[note.kind] ?? 0) + 1;
    return c;
  }, [all]);

  const needle = q.trim().toLowerCase();
  const shown = all.filter(
    ({ note, book }) =>
      (kind === "all" || note.kind === kind) &&
      (!needle || note.body.toLowerCase().includes(needle) || book.title.toLowerCase().includes(needle) || book.authors.some((a) => a.toLowerCase().includes(needle))),
  );

  return (
    <Dialog open={open} onClose={onClose} eyebrow="Commonplace book" title="All your marginalia" wide>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {(["all", "quote", "takeaway", "reaction", "note"] as const).map((k) =>
          k !== "all" && !counts[k] ? null : (
            <button key={k} onClick={() => setKind(k)} className={kind === k ? "text-ink" : "text-faint hover:text-muted"}>
              {k === "all" ? "Everything" : `${NOTE_LABELS[k]}s`} <span className="tabular-nums">{counts[k]}</span>
            </button>
          ),
        )}
      </div>
      <input
        className="field mt-4"
        placeholder="Search your notes, or a book or author"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <ul className="mt-4">
        {shown.map(({ note, book }) => (
          <li key={note.id} className="border-b border-rule py-5 last:border-0">
            <p
              className={`whitespace-pre-wrap leading-relaxed text-ink ${note.kind === "quote" ? "border-l-2 border-rule pl-4 font-serif text-[17px] italic" : "text-[15px]"}`}
            >
              {note.kind === "quote" ? `“${note.body.replace(/^[“"]|[”"]$/g, "")}”` : note.body}
            </p>
            <p className="mt-2 text-[11px] text-faint">
              <span className="eyebrow !text-[10px]">{NOTE_LABELS[note.kind]}</span> ·{" "}
              <button className="italic underline-offset-4 hover:text-ink hover:underline" onClick={() => onOpenBook(book.id)}>
                {book.title}
              </button>
              {book.authors[0] ? `, ${book.authors[0]}` : ""}
              {note.locator ? ` · ${note.locator}` : ""} · {ago(note.createdAt)}
            </p>
          </li>
        ))}
      </ul>
      {!all.length && <p className="mt-10 text-center font-serif text-[15px] italic text-faint">No notes yet. Open a book and write in its margins.</p>}
      {all.length > 0 && !shown.length && <p className="mt-10 text-center text-sm text-faint">Nothing matches.</p>}
    </Dialog>
  );
}

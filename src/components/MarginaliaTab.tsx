"use client";

import { useState } from "react";
import { useLibrary } from "@/lib/store";
import { NOTE_LABELS, type Book, type Note, type NoteKind } from "@/lib/types";
import { TrashIcon } from "./icons";

const KINDS = Object.keys(NOTE_LABELS) as NoteKind[];
const PLACEHOLDER: Record<NoteKind, string> = {
  note: "A thought in the margin…",
  takeaway: "What you want to remember from this…",
  quote: "Copy the line exactly as written…",
  reaction: "How it made you feel…",
};

export function MarginaliaTab({ book }: { book: Book }) {
  const { addNote, removeNote, updateNote } = useLibrary();
  const [kind, setKind] = useState<NoteKind>("note");
  const [body, setBody] = useState("");
  const [locator, setLocator] = useState("");
  const [filter, setFilter] = useState<NoteKind | "all">("all");

  const notes = filter === "all" ? book.notes : book.notes.filter((n) => n.kind === filter);

  function save() {
    if (!body.trim()) return;
    addNote(book.id, { kind, body: body.trim(), locator: locator.trim() || undefined });
    setBody("");
    setLocator("");
  }

  return (
    <div>
      <div className="rounded-2xl border border-rule bg-paper p-4 focus-within:border-[#cfccc5]">
        <div className="mb-2 flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1 text-xs transition ${kind === k ? "bg-ink text-paper" : "text-muted hover:bg-paper-2 hover:text-ink"}`}
            >
              {NOTE_LABELS[k]}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          }}
          placeholder={PLACEHOLDER[kind]}
          rows={3}
          className={`w-full resize-none bg-transparent px-1 py-2 text-[15px] leading-relaxed placeholder:text-faint focus:outline-none ${kind === "quote" ? "font-serif italic text-[16px]" : ""}`}
        />
        <div className="flex items-center gap-2">
          <input
            value={locator}
            onChange={(e) => setLocator(e.target.value)}
            placeholder="p. 112"
            className="w-24 rounded-md bg-paper-2 px-2 py-1.5 text-xs placeholder:text-faint focus:outline-none"
          />
          <span className="flex-1" />
          <button className="btn btn-primary h-8 px-4 text-xs" disabled={!body.trim()} onClick={save}>
            Keep
          </button>
        </div>
      </div>

      {book.notes.length > 0 && (
        <div className="mt-8 mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {(["all", ...KINDS] as const).map((k) => {
            const count = k === "all" ? book.notes.length : book.notes.filter((n) => n.kind === k).length;
            if (k !== "all" && !count) return null;
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={filter === k ? "text-ink" : "text-faint hover:text-muted"}
              >
                {k === "all" ? "All" : NOTE_LABELS[k]} <span className="tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <ul className="space-y-1">
        {notes.map((n) => (
          <NoteItem
            key={n.id}
            note={n}
            onDelete={() => removeNote(book.id, n.id)}
            onSave={(b) => updateNote(book.id, n.id, { body: b })}
          />
        ))}
      </ul>

      {book.notes.length === 0 && (
        <p className="mt-10 text-center font-serif text-[15px] italic text-faint">
          The margins are still clean.
        </p>
      )}
    </div>
  );
}

function NoteItem({ note, onDelete, onSave }: { note: Note; onDelete: () => void; onSave: (body: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const date = new Date(note.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <li className="group animate-fade-in border-b border-rule py-5 last:border-0">
      <div className="mb-2 flex items-center gap-2 text-[11px] text-faint">
        <span className="eyebrow !text-[10px]">{NOTE_LABELS[note.kind]}</span>
        {note.locator && <span>· {note.locator}</span>}
        <span>· {date}</span>
        <span className="flex-1" />
        <button
          onClick={onDelete}
          className="opacity-0 transition group-hover:opacity-100 focus:opacity-100 hover:text-ink"
          aria-label="Delete note"
        >
          <TrashIcon />
        </button>
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft.trim() && draft !== note.body) onSave(draft.trim());
            else setDraft(note.body);
          }}
          rows={Math.max(2, draft.split("\n").length)}
          className="w-full resize-none rounded-md bg-paper-2 p-2 text-[15px] leading-relaxed focus:outline-none"
        />
      ) : (
        <p
          onClick={() => setEditing(true)}
          className={`cursor-text whitespace-pre-wrap leading-relaxed text-ink ${
            note.kind === "quote"
              ? "border-l-2 border-rule pl-4 font-serif text-[17px] italic"
              : "text-[15px]"
          }`}
        >
          {note.kind === "quote" ? `“${note.body.replace(/^[“"]|[”"]$/g, "")}”` : note.body}
        </p>
      )}
    </li>
  );
}

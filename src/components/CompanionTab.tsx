"use client";

import { useRef, useState } from "react";
import { streamCompanion } from "@/lib/client";
import { useLibrary } from "@/lib/store";
import type { Book, CompanionMode } from "@/lib/types";
import { Markdown } from "./Markdown";
import { TrashIcon } from "./icons";

const MODES: { id: CompanionMode; label: string; hint: string }[] = [
  { id: "catchup", label: "Catch me up", hint: "Returning after a break? Get re-oriented up to where you are." },
  { id: "recap", label: "Chapter recap", hint: "A clear recap of a chapter you’ve just read." },
  { id: "untangle", label: "Untangle a passage", hint: "Paste a dense passage; get it unpacked plainly." },
];

export function CompanionTab({ book, aiReady }: { book: Book; aiReady: boolean | null }) {
  const { addCompanion, removeCompanion, updateBook } = useLibrary();
  const [mode, setMode] = useState<CompanionMode>("catchup");
  const [chapter, setChapter] = useState("");
  const [passage, setPassage] = useState("");
  const [question, setQuestion] = useState("");
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const canAsk =
    aiReady !== false &&
    live === null &&
    (mode === "catchup" || (mode === "recap" && chapter.trim()) || (mode === "untangle" && passage.trim()));

  async function ask() {
    setError(null);
    setLive("");
    abort.current = new AbortController();
    const prompt =
      mode === "recap" ? chapter.trim() : mode === "untangle" ? passage.trim() : book.progress?.trim() || "Start";
    try {
      const text = await streamCompanion(
        {
          mode,
          book: { title: book.title, authors: book.authors, publishedDate: book.publishedDate },
          progress: book.progress,
          chapter,
          passage,
          question,
        },
        setLive,
        abort.current.signal,
      );
      if (text.trim()) addCompanion(book.id, { mode, prompt, response: text });
      setPassage("");
      setQuestion("");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message || "The companion is unavailable.");
    } finally {
      setLive(null);
    }
  }

  return (
    <div>
      {aiReady === false && (
        <p className="mb-6 rounded-xl bg-paper-2 px-4 py-3 text-xs leading-relaxed text-muted">
          The Companion needs an Anthropic API key on the server (<code>ANTHROPIC_API_KEY</code>).
        </p>
      )}

      <label className="mb-6 block">
        <span className="eyebrow">Where you are</span>
        <input
          className="mt-2 w-full border-b border-rule bg-transparent pb-2 font-serif text-[17px] placeholder:text-faint focus:border-[#b9b5ad] focus:outline-none"
          placeholder="e.g. Chapter 9, or page 140"
          value={book.progress ?? ""}
          onChange={(e) => updateBook(book.id, { progress: e.target.value })}
        />
        <span className="mt-1.5 block text-[11px] text-faint">The Companion never looks past this point.</span>
      </label>

      <div className="grid grid-cols-3 gap-1 rounded-full bg-paper-2 p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-full px-2 py-2 text-xs transition ${mode === m.id ? "bg-paper text-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-muted hover:text-ink"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">{MODES.find((m) => m.id === mode)!.hint}</p>

      <div className="mt-4 space-y-3">
        {mode === "recap" && (
          <input className="field" placeholder="Which chapter? e.g. Chapter 12" value={chapter} onChange={(e) => setChapter(e.target.value)} />
        )}
        {mode === "untangle" && (
          <textarea
            className="field min-h-36 font-serif text-[15px] leading-relaxed"
            placeholder="Paste the passage here…"
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
          />
        )}
        <input
          className="field"
          placeholder="Anything specific you want to know? (optional)"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={!canAsk} onClick={ask}>
            {live !== null ? "Thinking…" : MODES.find((m) => m.id === mode)!.label}
          </button>
          {live !== null && (
            <button className="btn btn-ghost" onClick={() => abort.current?.abort()}>Stop</button>
          )}
        </div>
        {error && <p className="text-sm text-accent">{error}</p>}
      </div>

      {live !== null && (
        <article className="prose-companion animate-fade-in mt-8 border-t border-rule pt-6 text-[15px] leading-relaxed text-ink">
          {live ? <Markdown text={live} /> : <p className="animate-pulse text-muted">Opening the book…</p>}
        </article>
      )}

      <div className="mt-8 space-y-1">
        {book.companion.map((c) => (
          <details key={c.id} className="group border-t border-rule py-4" open={c === book.companion[0] && live === null}>
            <summary className="flex cursor-pointer list-none items-center gap-3 text-sm">
              <span className="eyebrow !text-[10px]">{MODES.find((m) => m.id === c.mode)?.label}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{c.mode === "untangle" ? `“${c.prompt.slice(0, 60)}…”` : c.prompt}</span>
              <span className="text-[11px] text-faint">
                {new Date(c.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  removeCompanion(book.id, c.id);
                }}
                className="text-faint opacity-0 transition group-hover:opacity-100 hover:text-ink"
                aria-label="Delete"
              >
                <TrashIcon />
              </button>
            </summary>
            <div className="prose-companion mt-4 text-[15px] leading-relaxed text-ink">
              <Markdown text={c.response} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { BookCover } from "./BookCover";
import { CameraIcon, CheckIcon } from "./icons";
import { prepareImage, readShelf, resolveTitle } from "@/lib/client";
import { useLibrary } from "@/lib/store";
import { STATUS_LABELS, type BookMetadata, type ReadingStatus, type ShelfCandidate } from "@/lib/types";

interface Row {
  candidate: ShelfCandidate;
  meta?: BookMetadata;
  state: "resolving" | "ready" | "unresolved";
  selected: boolean;
  duplicate: boolean;
}

type Step = "pick" | "reading" | "review" | "done";

export function ShelfDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [batchStatus, setBatchStatus] = useState<ReadingStatus>("want");
  const fileRef = useRef<HTMLInputElement>(null);
  const { addBook, findDuplicate } = useLibrary();

  useEffect(() => {
    if (open) {
      setStep("pick");
      setPreview(null);
      setRows([]);
      setError(null);
    }
  }, [open]);

  async function onFile(file?: File) {
    if (!file) return;
    setError(null);
    try {
      const img = await prepareImage(file);
      setPreview(img.preview);
      setStep("reading");
      const found = await readShelf(img.data, img.mediaType);
      if (!found.length) {
        setError("No spines were legible in that photo. Try a straighter, closer, well-lit shot.");
        setStep("pick");
        return;
      }
      const initial: Row[] = found.map((c) => ({ candidate: c, state: "resolving", selected: true, duplicate: false }));
      setRows(initial);
      setStep("review");
      resolveAll(found);
    } catch (e) {
      setError((e as Error).message);
      setStep("pick");
    }
  }

  /** Resolve canonical metadata a few at a time so covers trickle in. */
  async function resolveAll(list: ShelfCandidate[]) {
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        const c = list[i];
        let meta: BookMetadata | undefined;
        try {
          meta = await resolveTitle(c.title, c.author || undefined);
        } catch {
          meta = undefined;
        }
        const dup = Boolean(findDuplicate(meta ?? { title: c.title, authors: [c.author], source: "manual" }));
        setRows((rs) =>
          rs.map((r, j) =>
            j === i ? { ...r, meta, state: meta ? "ready" : "unresolved", duplicate: dup, selected: r.selected && !dup } : r,
          ),
        );
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  const toggle = (i: number) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, selected: !r.selected } : r)));
  const selected = rows.filter((r) => r.selected && !r.duplicate);
  const pending = rows.some((r) => r.state === "resolving");

  function commit() {
    let n = 0;
    for (const r of selected) {
      const meta: BookMetadata = r.meta ?? {
        title: r.candidate.title,
        authors: r.candidate.author ? [r.candidate.author] : [],
        source: "manual",
      };
      if (!addBook(meta, batchStatus).duplicate) n++;
    }
    setAddedCount(n);
    setStep("done");
  }

  return (
    <Dialog open={open} onClose={onClose} eyebrow="Bulk onboarding" title="Photograph a shelf" wide>
      {step === "pick" && (
        <div className="animate-fade-in">
          <p className="-mt-1 mb-6 text-sm leading-relaxed text-muted">
            Take one photo of a shelf, spines facing out. Gemini reads every title it can, then you choose what to keep.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="group flex aspect-[16/9] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#d6d3cc] bg-paper-2 text-muted transition hover:border-[#b9b5ad] hover:text-ink"
          >
            <CameraIcon className="size-7" />
            <span className="text-sm">Take or choose a photo</span>
            <span className="text-xs text-faint">Straight-on, good light, one shelf at a time works best</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {error && <p className="mt-4 text-sm text-accent">{error}</p>}
        </div>
      )}

      {step === "reading" && (
        <div className="animate-fade-in">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your shelf" className="w-full rounded-2xl opacity-60 saturate-50" />
          )}
          <p className="mt-5 animate-pulse text-center text-sm text-muted">Reading the spines…</p>
        </div>
      )}

      {step === "review" && (
        <div className="animate-fade-in">
          <div className="mb-4 flex items-baseline justify-between">
            <p className="text-sm text-muted">
              Found <span className="text-ink">{rows.length}</span> {rows.length === 1 ? "book" : "books"}. Untick any that are wrong.
            </p>
            <button
              className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
              onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: !r.duplicate && selected.length === 0 })))}
            >
              {selected.length ? "Select none" : "Select all"}
            </button>
          </div>
          <ul className="divide-y divide-rule border-y border-rule">
            {rows.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() => !r.duplicate && toggle(i)}
                  className={`flex w-full items-center gap-4 py-3 text-left transition ${r.selected ? "" : "opacity-45"}`}
                  disabled={r.duplicate}
                >
                  <div className="w-10 shrink-0">
                    <BookCover title={r.meta?.title ?? r.candidate.title} src={r.meta?.coverUrl} size="xs" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-[15px] text-ink-2">{r.meta?.title ?? r.candidate.title}</p>
                    <p className="truncate text-xs text-muted">
                      {r.meta?.authors.join(", ") || r.candidate.author || "Unknown author"}
                      {r.state === "resolving" && " · matching…"}
                      {r.state === "unresolved" && " · no catalogue match"}
                      {r.duplicate && " · already shelved"}
                    </p>
                  </div>
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${r.selected && !r.duplicate ? "border-ink bg-ink text-paper" : "border-[#cfccc5]"}`}
                  >
                    {r.selected && !r.duplicate && <CheckIcon className="size-3" />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-5 flex items-center gap-3 text-sm text-muted">
            Shelve as
            <select
              value={batchStatus}
              onChange={(e) => setBatchStatus(e.target.value as ReadingStatus)}
              className="rounded-lg border border-rule bg-paper px-2 py-1.5 text-sm text-ink"
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button className="btn btn-ghost" onClick={() => setStep("pick")}>Another photo</button>
            <button className="btn btn-primary" disabled={!selected.length || pending} onClick={commit}>
              {pending ? "Matching…" : `Add ${selected.length} to library`}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="animate-fade-in py-6 text-center">
          <p className="font-serif text-xl text-ink-2">
            {addedCount} {addedCount === 1 ? "book" : "books"} shelved.
          </p>
          <p className="mt-2 text-sm text-muted">Marked “{STATUS_LABELS[batchStatus]}” — change any from its page.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button className="btn btn-ghost" onClick={() => setStep("pick")}>Photograph another shelf</button>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

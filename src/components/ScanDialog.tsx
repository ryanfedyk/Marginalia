"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { BookCover } from "./BookCover";
import { lookupIsbn } from "@/lib/client";
import { isBookBarcode, toIsbn13 } from "@/lib/isbn";
import { useLibrary } from "@/lib/store";
import { STATUS_LABELS, type BookMetadata, type ReadingStatus } from "@/lib/types";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts: { formats: string[] }): BarcodeDetectorLike;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

type Phase =
  | { kind: "scanning" }
  | { kind: "looking"; isbn: string }
  | { kind: "found"; book: BookMetadata; duplicate: boolean }
  | { kind: "error"; message: string; isbn?: string };

const SCANNER_ID = "marginalia-html5-qrcode";

export function ScanDialog({ open, onClose, onOpenBook }: { open: boolean; onClose: () => void; onOpenBook: (id: string) => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "scanning" });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const { addBook, findDuplicate } = useLibrary();
  const busy = useRef(false);

  const handleCode = useCallback(
    async (code: string) => {
      const isbn = toIsbn13(code);
      if (busy.current || !isbn) return;
      busy.current = true;
      navigator.vibrate?.(12);
      setPhase({ kind: "looking", isbn });
      try {
        const book = await lookupIsbn(isbn);
        setPhase({ kind: "found", book, duplicate: Boolean(findDuplicate(book)) });
      } catch (e) {
        setPhase({ kind: "error", message: (e as Error).message, isbn });
      }
    },
    [findDuplicate],
  );

  const resume = () => {
    busy.current = false;
    setPhase({ kind: "scanning" });
  };

  // Reset when reopened.
  useEffect(() => {
    if (open) {
      busy.current = false;
      setPhase({ kind: "scanning" });
      setAdded([]);
      setCameraError(null);
    }
  }, [open]);

  const scanning = open && phase.kind === "scanning";

  const add = (book: BookMetadata, status: ReadingStatus) => {
    const res = addBook(book, status);
    setAdded((a) => [book.title, ...a]);
    if (res.duplicate) onOpenBook(res.book.id);
    resume();
  };

  return (
    <Dialog open={open} onClose={onClose} eyebrow="Add a book" title="Scan the barcode">
      <p className="-mt-1 mb-5 text-sm leading-relaxed text-muted">
        Hold the back cover up to the camera. Marginalia reads the ISBN and fetches the canonical cover — never a photo.
      </p>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#121212]">
        {scanning && <Camera onCode={handleCode} onError={setCameraError} />}
        {phase.kind !== "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center bg-paper-2 p-6">
            {phase.kind === "looking" && (
              <p className="animate-pulse text-sm text-muted">Looking up {phase.isbn}…</p>
            )}
            {phase.kind === "found" && <FoundCard book={phase.book} duplicate={phase.duplicate} onAdd={add} onSkip={resume} />}
            {phase.kind === "error" && (
              <div className="text-center">
                <p className="text-sm text-ink">{phase.message}</p>
                <button className="btn btn-ghost mt-4" onClick={resume}>Scan again</button>
              </div>
            )}
          </div>
        )}
        {scanning && cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-paper-2 p-8 text-center text-sm leading-relaxed text-muted">
            {cameraError}
          </div>
        )}
      </div>

      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const isbn = toIsbn13(manual);
          if (!isbn) return setPhase({ kind: "error", message: "That ISBN doesn’t check out — try again?" });
          busy.current = false;
          setManual("");
          handleCode(isbn);
        }}
      >
        <input
          className="field"
          inputMode="numeric"
          placeholder="Or type the ISBN"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <button className="btn btn-ghost shrink-0" disabled={!manual.trim()}>Look up</button>
      </form>

      {added.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Added {added.length} {added.length === 1 ? "book" : "books"} — {added.slice(0, 3).join(", ")}
          {added.length > 3 ? "…" : ""}
        </p>
      )}
    </Dialog>
  );
}

function FoundCard({
  book,
  duplicate,
  onAdd,
  onSkip,
}: {
  book: BookMetadata;
  duplicate: boolean;
  onAdd: (b: BookMetadata, s: ReadingStatus) => void;
  onSkip: () => void;
}) {
  const [status, setStatus] = useState<ReadingStatus>("want");
  return (
    <div className="animate-rise-in flex w-full max-w-sm items-center gap-5">
      <div className="w-24 shrink-0">
        <BookCover title={book.title} author={book.authors[0]} src={book.coverUrl} size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-lg leading-snug text-ink-2 line-clamp-3">{book.title}</p>
        <p className="mt-1 text-sm text-muted line-clamp-1">{book.authors.join(", ") || "Unknown author"}</p>
        {duplicate ? (
          <p className="mt-3 text-xs text-accent">Already on your shelf.</p>
        ) : (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ReadingStatus)}
            className="mt-3 w-full rounded-lg border border-rule bg-paper px-2 py-1.5 text-xs"
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary h-9 px-4 text-xs" onClick={() => onAdd(book, status)}>
            {duplicate ? "Open it" : "Add to library"}
          </button>
          <button className="btn h-9 px-3 text-xs text-muted hover:text-ink" onClick={onSkip}>Skip</button>
        </div>
      </div>
    </div>
  );
}

/** Live camera: native BarcodeDetector when available, html5-qrcode otherwise. */
function Camera({ onCode, onError }: { onCode: (code: string) => void; onError: (msg: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"native" | "fallback" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const BD = window.BarcodeDetector;
      const native = BD ? (await BD.getSupportedFormats().catch((): string[] => [])).includes("ean_13") : false;
      if (!cancelled) setMode(native ? "native" : "fallback");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Native path.
  useEffect(() => {
    if (mode !== "native") return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const detector = new window.BarcodeDetector!({ formats: ["ean_13"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stopped) return;
          try {
            if (v.readyState >= 2) {
              const codes = await detector.detect(v);
              const hit = codes.find((c) => isBookBarcode(c.rawValue));
              if (hit) return onCode(hit.rawValue);
            }
          } catch {
            /* transient detect failures are fine */
          }
          timer = setTimeout(tick, 180);
        };
        tick();
      } catch (e) {
        onError(cameraMessage(e));
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [mode, onCode, onError]);

  // html5-qrcode path (Safari < 17, Firefox).
  useEffect(() => {
    if (mode !== "fallback") return;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (stopped) return;
        scanner = new Html5Qrcode(SCANNER_ID, {
          formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13],
          verbose: false,
        });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.8), height: Math.floor(h * 0.45) }) },
          (text) => isBookBarcode(text) && onCode(text),
          () => {},
        );
        if (stopped) scanner.stop().catch(() => {});
      } catch (e) {
        onError(cameraMessage(e));
      }
    })();
    return () => {
      stopped = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [mode, onCode, onError]);

  return (
    <>
      {mode === "native" && <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />}
      {mode === "fallback" && <div id={SCANNER_ID} className="absolute inset-0 [&_video]:!size-full [&_video]:object-cover" />}
      {/* Reticle */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-[42%] w-[78%] rounded-xl border border-white/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]">
          <div className="animate-scanline absolute inset-x-4 top-1/2 h-px bg-white/80" />
        </div>
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] tracking-wide text-white/70">
        Align the barcode inside the frame
      </p>
    </>
  );
}

function cameraMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError") return "Camera access was declined. Allow it in your browser settings, or type the ISBN below.";
  if (name === "NotFoundError") return "No camera found on this device. Type the ISBN below instead.";
  if (typeof window !== "undefined" && !window.isSecureContext)
    return "The camera needs a secure (https) connection. Type the ISBN below instead.";
  return "The camera couldn’t start. Type the ISBN below instead.";
}

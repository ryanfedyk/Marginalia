"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { aiStatus } from "@/lib/client";
import { useHydrated, useLibrary } from "@/lib/store";
import { STATUS_LABELS, type Book, type ReadingStatus } from "@/lib/types";
import { BookCover } from "./BookCover";
import { BookPanel } from "./BookPanel";
import { Dialog } from "./Dialog";
import { DiscoveryPanel } from "./DiscoveryPanel";
import { ScanDialog } from "./ScanDialog";
import { SearchDialog } from "./SearchDialog";
import { ShelfDialog } from "./ShelfDialog";
import { BarcodeIcon, PlusIcon, SearchIcon, ShelfIcon } from "./icons";

type Filter = ReadingStatus | "all";
type Modal = "scan" | "shelf" | "search" | "discover" | null;

export function Library() {
  const hydrated = useHydrated();
  const books = useLibrary((s) => s.books);
  const importLibrary = useLibrary((s) => s.importLibrary);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [menu, setMenu] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    aiStatus().then((s) => setAiReady(s.ai)).catch(() => setAiReady(false));
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: books.length, want: 0, reading: 0, finished: 0, paused: 0 };
    for (const b of books) c[b.status]++;
    return c;
  }, [books]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books
      .filter((b) => filter === "all" || b.status === filter)
      .filter((b) => !q || b.title.toLowerCase().includes(q) || b.authors.some((a) => a.toLowerCase().includes(q)))
      .sort((a, b) => {
        // Books in progress lead; otherwise newest first.
        if (filter === "all" && (a.status === "reading") !== (b.status === "reading")) return a.status === "reading" ? -1 : 1;
        return b.addedAt.localeCompare(a.addedAt);
      });
  }, [books, filter, query]);

  const openModal = (m: Modal) => {
    setMenu(false);
    setModal(m);
  };
  const openBook = (id: string) => {
    setModal(null);
    setOpenId(id);
  };

  function exportLibrary() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), books }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `marginalia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onImport(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const n = importLibrary((data.books ?? data) as Book[]);
      alert(`Imported ${n} ${n === 1 ? "book" : "books"}.`);
    } catch {
      alert("That file couldn’t be read as a Marginalia library.");
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] px-5 sm:px-10 lg:px-14">
      <header className="flex items-end justify-between gap-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10 sm:pt-16 sm:pb-14">
        <div>
          <h1 className="font-serif text-[40px] leading-none tracking-[-0.02em] text-ink-2 italic sm:text-[52px]">Marginalia</h1>
          <p className="mt-3 text-sm text-muted">
            {hydrated && books.length > 0
              ? `${books.length} ${books.length === 1 ? "volume" : "volumes"}${counts.reading ? ` · ${counts.reading} in hand` : ""}`
              : "A quiet home for your books"}
          </p>
        </div>

        <div className="relative">
          <button className="btn btn-primary" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            <PlusIcon /> <span className="hidden sm:inline">Add books</span>
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
              <div className="animate-sheet-up absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-rule bg-paper p-1.5 shadow-sheet">
                <MenuItem icon={<BarcodeIcon />} label="Scan a barcode" hint="One book, via camera" onClick={() => openModal("scan")} />
                <MenuItem icon={<ShelfIcon />} label="Photograph a shelf" hint="Many books at once" onClick={() => openModal("shelf")} />
                <MenuItem icon={<SearchIcon />} label="Search" hint="By title, author or ISBN" onClick={() => openModal("search")} />
              </div>
            </>
          )}
        </div>
      </header>

      {hydrated && books.length > 0 && (
        <nav className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-rule pb-4 sm:mb-14">
          {(["all", "reading", "want", "finished", "paused"] as Filter[]).map((f) =>
            f !== "all" && !counts[f] ? null : (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-sm transition ${filter === f ? "text-ink" : "text-faint hover:text-muted"}`}
              >
                {f === "all" ? "All" : STATUS_LABELS[f]}
                <span className="ml-1.5 text-[11px] tabular-nums text-faint">{counts[f]}</span>
              </button>
            ),
          )}
          <span className="flex-1" />
          {books.length > 12 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find on shelf"
              className="w-40 border-b border-transparent bg-transparent py-0.5 text-sm placeholder:text-faint focus:border-rule focus:outline-none"
            />
          )}
          <button className="text-sm text-muted hover:text-ink" onClick={() => setModal("discover")}>
            Discover
          </button>
        </nav>
      )}

      {!hydrated ? null : books.length === 0 ? (
        <EmptyState onPick={openModal} />
      ) : (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 sm:gap-x-10 sm:gap-y-16 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((b, i) => (
            <li key={b.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 18) * 28}ms` }}>
              <button onClick={() => setOpenId(b.id)} className="group block w-full text-left" aria-label={`${b.title} by ${b.authors.join(", ")}`}>
                <div className="transition duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-1.5 [&>div]:transition-shadow [&>div]:duration-500 group-hover:[&>div]:shadow-cover-lift">
                  <BookCover title={b.title} author={b.authors[0]} src={b.coverUrl} />
                </div>
                <p className="mt-4 line-clamp-2 font-serif text-[15px] leading-snug text-ink-2">{b.title}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-faint">{b.authors[0] ?? ""}</p>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className="col-span-full py-20 text-center text-sm text-faint">Nothing here yet.</li>}
        </ul>
      )}

      {hydrated && books.length > 0 && (
        <footer className="mt-28 flex flex-wrap items-center justify-between gap-4 border-t border-rule py-8 text-xs text-faint">
          <span>Your library lives in this browser.</span>
          <div className="flex gap-5">
            <button className="hover:text-ink" onClick={exportLibrary}>Export</button>
            <button className="hover:text-ink" onClick={() => importRef.current?.click()}>Import</button>
            <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </footer>
      )}

      <ScanDialog open={modal === "scan"} onClose={() => setModal(null)} onOpenBook={openBook} />
      <ShelfDialog open={modal === "shelf"} onClose={() => setModal(null)} />
      <SearchDialog open={modal === "search"} onClose={() => setModal(null)} onOpenBook={openBook} />
      <Dialog open={modal === "discover"} onClose={() => setModal(null)} eyebrow="Discovery" title="Taste & next reads" wide>
        <DiscoveryPanel aiReady={aiReady} />
      </Dialog>
      <BookPanel bookId={openId} onClose={() => setOpenId(null)} aiReady={aiReady} />
    </div>
  );
}

function MenuItem({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-paper-2">
      <span className="text-muted">{icon}</span>
      <span>
        <span className="block text-sm text-ink">{label}</span>
        <span className="block text-xs text-faint">{hint}</span>
      </span>
    </button>
  );
}

function EmptyState({ onPick }: { onPick: (m: Modal) => void }) {
  const options = [
    { m: "scan" as const, icon: <BarcodeIcon className="size-6" />, title: "Scan a barcode", body: "Point your camera at the back cover." },
    { m: "shelf" as const, icon: <ShelfIcon className="size-6" />, title: "Photograph a shelf", body: "Catalogue a whole row of spines at once." },
    { m: "search" as const, icon: <SearchIcon className="size-6" />, title: "Search", body: "Find a book by its title or ISBN." },
  ];
  return (
    <section className="animate-rise-in mx-auto max-w-3xl py-10 text-center sm:py-16">
      <p className="mx-auto max-w-md font-serif text-[26px] leading-snug text-ink-2 sm:text-[30px]">
        Begin with the books already on your shelves.
      </p>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">
        Marginalia keeps a calm record of what you own, what you’re reading, and the thoughts you leave in the margins.
      </p>
      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o.m}
            onClick={() => onPick(o.m)}
            className="group rounded-2xl border border-rule bg-paper p-6 text-left transition hover:-translate-y-0.5 hover:border-[#d6d3cc] hover:shadow-cover"
          >
            <span className="text-muted transition group-hover:text-ink">{o.icon}</span>
            <p className="mt-6 font-serif text-lg text-ink-2">{o.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{o.body}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

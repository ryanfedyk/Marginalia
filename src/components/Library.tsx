"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { aiStatus } from "@/lib/client";
import { useHydrated, useLibrary } from "@/lib/store";
import { STATUS_LABELS, type Book, type ReadingStatus } from "@/lib/types";
import { navClose, navOpen, useNav } from "@/lib/nav";
import { initAccount, useAccount } from "@/lib/sync";
import { AccountButton } from "./AccountButton";
import { BookCover } from "./BookCover";
import { BookPanel } from "./BookPanel";
import { CollectionsView } from "./CollectionsView";
import { Dialog } from "./Dialog";
import { DiscoveryPanel } from "./DiscoveryPanel";
import { ScanDialog } from "./ScanDialog";
import { ReadingNow } from "./ReadingNow";
import { Flashback } from "./Flashback";
import { MarginsDialog } from "./MarginsDialog";
import { TimelineDialog } from "./TimelineDialog";
import { UpNext } from "./UpNext";
import { ShelfSearch } from "./ShelfSearch";
import { authorKey, titleKey } from "@/lib/flashback";
import { SearchDialog } from "./SearchDialog";
import { ShelfDialog } from "./ShelfDialog";
import { BarcodeIcon, PlusIcon, SearchIcon, ShelfIcon } from "./icons";
import { usePinchZoom } from "./usePinchZoom";

type Filter = ReadingStatus | "all";
type Modal = "scan" | "shelf" | "search" | "discover" | null;

export function Library() {
  const hydrated = useHydrated();
  const books = useLibrary((s) => s.books);
  const importLibrary = useLibrary((s) => s.importLibrary);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // Open book and dialogs live in the URL, so Back/Forward work (see lib/nav.ts).
  const nav = useNav();
  const openId = hydrated && nav.book && books.some((b) => b.id === nav.book) ? nav.book : null;
  const modal: Modal =
    nav.add === "scan" || nav.add === "shelf" || nav.add === "search" ? nav.add : nav.discover ? "discover" : null;
  const setOpenId = (id: string) => navOpen({ book: id });
  const closeModal = () => navClose(modal === "discover" ? "discover" : "add");
  const [menu, setMenu] = useState(false);
  const [viewPref, setViewPref] = useState<"shelf" | "collections" | null>(null);
  const [sort, setSort] = useState<"recent" | "title" | "author">("recent");
  const chooseSort = (v: "recent" | "title" | "author") => {
    setSort(v);
    try {
      localStorage.setItem("marginalia.sort", v);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    try {
      const so = localStorage.getItem("marginalia.sort");
      if (so === "recent" || so === "title" || so === "author") setSort(so);
      const v = localStorage.getItem("marginalia.view");
      if (v === "shelf" || v === "collections") setViewPref(v);
    } catch {
      /* ignore */
    }
  }, []);
  const chooseView = (v: "shelf" | "collections") => {
    setViewPref(v);
    try {
      localStorage.setItem("marginalia.view", v);
    } catch {
      /* ignore */
    }
  };
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    aiStatus()
      .then((s) => {
        setAiReady(s.ai);
        initAccount(s.firebase);
      })
      .catch(() => {
        setAiReady(false);
        initAccount(null);
      });
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: books.length, want: 0, reading: 0, finished: 0, paused: 0 };
    for (const b of books) c[b.status]++;
    return c;
  }, [books]);

  const account = useAccount();
  const coverWidth = usePinchZoom(!openId && !modal && !menu && !nav.margins && !nav.collection && !nav.timeline);
  const q = query.trim().toLowerCase();
  // On the main view, books in hand get their own section above the shelf.
  const showReading = filter === "all" && !q;
  const reading = useMemo(
    () => books.filter((b) => b.status === "reading").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [books],
  );

  const thisYear = new Date().getFullYear();
  const finishedThisYear = books.filter(
    (b) => b.status === "finished" && b.finishedAt && new Date(b.finishedAt).getFullYear() === thisYear,
  ).length;
  const canCollect = books.length >= 4;
  const view = viewPref ?? (books.length >= 6 ? "collections" : "shelf");
  const showCollections = showReading && canCollect && view === "collections";

  const visible = useMemo(() => {
    return books
      .filter((b) => (filter === "all" ? !(showReading && b.status === "reading") : b.status === filter))
      .filter((b) => !q || b.title.toLowerCase().includes(q) || b.authors.some((a) => a.toLowerCase().includes(q)))
      .sort((a, b) => {
        if (sort === "title") return titleKey(a.title).localeCompare(titleKey(b.title)) || authorKey(a.authors[0]).localeCompare(authorKey(b.authors[0]));
        if (sort === "author") return authorKey(a.authors[0]).localeCompare(authorKey(b.authors[0])) || titleKey(a.title).localeCompare(titleKey(b.title));
        if (filter === "all" && (a.status === "reading") !== (b.status === "reading")) return a.status === "reading" ? -1 : 1;
        return b.addedAt.localeCompare(a.addedAt);
      });
  }, [books, filter, q, showReading, sort]);

  const openModal = (m: Modal) => {
    setMenu(false);
    if (m) navOpen(m === "discover" ? { discover: "1" } : { add: m });
  };
  // From an add dialog straight to the book: the book takes the dialog's place in history.
  const openBook = (id: string) => {
    navOpen({ add: null, book: id }, { replace: true });
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
            {hydrated && books.length > 0 ? (
              <>
                {`${books.length} ${books.length === 1 ? "volume" : "volumes"}${counts.reading ? ` · ${counts.reading} in hand` : ""}`}
                {counts.finished > 0 && (
                  <>
                    {" · "}
                    <button
                      onClick={() => navOpen({ timeline: "1" })}
                      className="underline decoration-rule underline-offset-4 transition hover:text-ink hover:decoration-current"
                    >
                      {finishedThisYear ? `${finishedThisYear} finished this year` : "your reading life"}
                    </button>
                  </>
                )}
              </>
            ) : (
              "A quiet home for your books"
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <AccountButton />
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
        </div>
      </header>

      {hydrated && books.length > 0 && (
        <nav className="mb-10 flex flex-col gap-4 border-b border-rule pb-4 sm:mb-14 lg:flex-row lg:items-center lg:justify-between">
          {/* Status filters: one row that scrolls sideways on small screens instead of wrapping. */}
          <div className="no-scrollbar -mx-5 flex gap-6 overflow-x-auto px-5 sm:-mx-10 sm:px-10 lg:mx-0 lg:px-0">
            {(["all", "reading", "want", "finished", "paused"] as Filter[]).map((f) =>
              f !== "all" && !counts[f] ? null : (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 whitespace-nowrap text-sm transition ${filter === f ? "text-ink" : "text-faint hover:text-muted"}`}
                >
                  {f === "all" ? "All" : STATUS_LABELS[f]}
                  <span className="ml-1.5 text-[11px] tabular-nums text-faint">{counts[f]}</span>
                </button>
              ),
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            {books.length >= 6 && <ShelfSearch value={query} onChange={setQuery} />}
            {canCollect && filter === "all" && !q && (
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-rule p-0.5 text-xs">
                {(["shelf", "collections"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => chooseView(v)}
                    className={`rounded-full px-3 py-1 capitalize transition ${view === v ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
            <button className="shrink-0 text-sm text-muted hover:text-ink" onClick={() => openModal("discover")}>
              Discover
            </button>
          </div>
        </nav>
      )}

      {!hydrated ? null : books.length === 0 ? (
        <EmptyState onPick={openModal} />
      ) : (
        <>
        {showReading && <ReadingNow books={reading} aiReady={aiReady} onOpen={setOpenId} />}
        {filter === "want" && !q && <UpNext books={books} aiReady={aiReady} onOpen={setOpenId} />}
        {showReading && <Flashback books={books} onOpenBook={setOpenId} onOpenAll={() => navOpen({ margins: "1" })} />}
        {showCollections ? (
          <CollectionsView books={books} coverWidth={coverWidth} aiReady={aiReady} onOpen={setOpenId} />
        ) : (
        <>
        {visible.length > 1 && (
          <div className="mb-8 flex items-center justify-between gap-4">
            <p className="eyebrow">{showReading && reading.length > 0 ? "On the shelf" : ""}</p>
            <div className="flex items-center gap-3 text-xs" role="radiogroup" aria-label="Sort books">
              <span className="text-faint">Sort</span>
              {(["recent", "title", "author"] as const).map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={sort === v}
                  onClick={() => chooseSort(v)}
                  className={`capitalize transition ${sort === v ? "text-ink underline decoration-rule underline-offset-[6px]" : "text-faint hover:text-muted"}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
        <ul
          data-shelf
          className="grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(min(${coverWidth}px, 100%), 1fr))`,
            columnGap: `${Math.round(Math.min(40, Math.max(12, coverWidth * 0.18)))}px`,
            rowGap: `${Math.round(coverWidth < 100 ? coverWidth * 0.22 : 24 + coverWidth * 0.18)}px`,
          }}
        >
          {visible.map((b, i) => (
            <li key={b.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 18) * 28}ms` }}>
              <button onClick={() => setOpenId(b.id)} className="group block w-full text-left" aria-label={`${b.title} by ${b.authors.join(", ")}`}>
                <div className="transition duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-1.5 [&>div]:transition-shadow [&>div]:duration-500 group-hover:[&>div]:shadow-cover-lift">
                  <BookCover title={b.title} author={b.authors[0]} src={b.coverUrl} />
                </div>
                {coverWidth >= 100 && (
                  <>
                    <p className="mt-4 line-clamp-2 font-serif text-[15px] leading-snug text-ink-2">{b.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-faint">{b.authors[0] ?? ""}</p>
                  </>
                )}
              </button>
            </li>
          ))}
          {visible.length === 0 && !(showReading && reading.length) && (
            <li className="col-span-full py-20 text-center text-sm text-faint">Nothing here yet.</li>
          )}
        </ul>
        </>
        )}
        </>
      )}

      {hydrated && books.length > 0 && (
        <footer className="mt-28 flex flex-wrap items-center justify-between gap-4 border-t border-rule py-8 text-xs text-faint">
          <span>
            {account.status === "signedIn"
              ? `Saved to ${account.user?.email ?? "your account"}.`
              : account.status === "signedOut"
                ? "Your library lives in this browser. Sign in to keep it in the cloud."
                : "Your library lives in this browser."}
            <span className="hidden sm:inline"> Pinch to resize the shelf.</span>
          </span>
          <div className="flex gap-5">
            <button className="hover:text-ink" onClick={exportLibrary}>Export</button>
            <button className="hover:text-ink" onClick={() => importRef.current?.click()}>Import</button>
            <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </footer>
      )}

      <ScanDialog open={modal === "scan"} onClose={closeModal} onOpenBook={openBook} />
      <ShelfDialog open={modal === "shelf"} onClose={closeModal} />
      <SearchDialog open={modal === "search"} onClose={closeModal} onOpenBook={openBook} />
      <Dialog open={modal === "discover"} onClose={closeModal} eyebrow="Discovery" title="Taste & next reads" wide>
        <DiscoveryPanel aiReady={aiReady} />
      </Dialog>
      <TimelineDialog
        open={Boolean(nav.timeline)}
        onClose={() => navClose("timeline")}
        books={books}
        onOpenBook={(id) => navOpen({ timeline: null, book: id }, { replace: true })}
      />
      <MarginsDialog
        open={Boolean(nav.margins)}
        onClose={() => navClose("margins")}
        books={books}
        onOpenBook={(id) => navOpen({ margins: null, book: id }, { replace: true })}
      />
      <BookPanel bookId={openId} onClose={() => navClose("book")} aiReady={aiReady} />
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

"use client";

import { useEffect, useState } from "react";
import { discover, marketplaceLinks, resolveTitle } from "@/lib/client";
import { libraryFingerprint, useLibrary } from "@/lib/store";
import type { BookMetadata, Recommendation } from "@/lib/types";
import { BookCover } from "./BookCover";
import { ArrowIcon, CheckIcon, PlusIcon, SparkIcon } from "./icons";

export function DiscoveryPanel({ aiReady }: { aiReady: boolean | null }) {
  const { books, profile, setProfile } = useLibrary();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const p = await discover(
        books.map((b) => ({
          title: b.title,
          author: b.authors.join(", "),
          status: b.status,
          rating: b.rating,
          notes: b.notes.map((n) => `${n.kind}: ${n.body}`),
        })),
      );
      setProfile({
        ...p,
        generatedAt: new Date().toISOString(),
        basis: books.length,
        fingerprint: libraryFingerprint(books),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const stale =
    profile &&
    (profile.fingerprint ? profile.fingerprint !== libraryFingerprint(books) : profile.basis !== books.length);

  if (!profile) {
    return (
      <div className="py-6 text-center">
        <SparkIcon className="mx-auto size-6 text-faint" />
        <p className="mx-auto mt-4 max-w-xs font-serif text-lg leading-snug text-ink-2">
          A reading of your shelves — and what might belong on them next.
        </p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          Built from the {books.length} {books.length === 1 ? "book" : "books"} you own and the notes you’ve left in them.
        </p>
        <button className="btn btn-primary mt-6" disabled={loading || !books.length || aiReady === false} onClick={generate}>
          {loading ? "Reading your shelves…" : "Draw my taste profile"}
        </button>
        {aiReady === false && <p className="mt-4 text-xs text-muted">Needs GEMINI_API_KEY on the server.</p>}
        {error && <p className="mt-4 text-sm text-accent">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <section>
        <p className="eyebrow">Your taste</p>
        <p className="mt-3 font-serif text-[19px] leading-[1.5] text-ink-2">{profile.summary}</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {profile.threads.map((t) => (
            <li key={t} className="rounded-full border border-rule px-3 py-1 text-xs text-muted">{t}</li>
          ))}
        </ul>
        <div className="mt-4 flex items-center gap-3 text-[11px] text-faint">
          <span>
            Drawn {new Date(profile.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} from{" "}
            {profile.basis} books{stale ? " · your library or ratings have changed since" : ""}
          </span>
          <button className="underline underline-offset-4 hover:text-ink" disabled={loading} onClick={generate}>
            {loading ? "Redrawing…" : "Redraw"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-accent">{error}</p>}
      </section>

      <section className="mt-10">
        <p className="eyebrow mb-1">What to read next</p>
        <ul>
          {profile.recommendations.map((r) => (
            <RecommendationItem key={`${r.title}|${r.author}`} rec={r} />
          ))}
        </ul>
      </section>
    </div>
  );
}

const resolved = new Map<string, BookMetadata | null>();

export function RecommendationItem({ rec }: { rec: Recommendation }) {
  const key = `${rec.title}|${rec.author}`;
  const [meta, setMeta] = useState<BookMetadata | null | undefined>(resolved.get(key));
  const { addBook, findDuplicate } = useLibrary();

  useEffect(() => {
    if (resolved.has(key)) return;
    let live = true;
    resolveTitle(rec.title, rec.author)
      .then((m) => m)
      .catch(() => null)
      .then((m) => {
        resolved.set(key, m);
        if (live) setMeta(m);
      });
    return () => {
      live = false;
    };
  }, [key, rec.title, rec.author]);

  const asMeta: BookMetadata = meta ?? { title: rec.title, authors: [rec.author], source: "manual" };
  const owned = Boolean(findDuplicate(asMeta));

  return (
    <li className="animate-fade-in flex gap-5 border-b border-rule py-6 last:border-0">
      <div className="w-20 shrink-0">
        <BookCover title={rec.title} author={rec.author} src={meta?.coverUrl} size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-[17px] leading-snug text-ink-2">{rec.title}</p>
        <p className="text-sm text-muted">{rec.author}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink/80">{rec.why}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          {marketplaceLinks(rec.title, rec.author, meta?.isbn13).map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              {l.label}
              <ArrowIcon className="size-3" />
            </a>
          ))}
          <button
            disabled={owned}
            onClick={() => addBook(asMeta, "want")}
            className="inline-flex items-center gap-1 text-ink disabled:text-faint"
          >
            {owned ? <CheckIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
            {owned ? "On your shelf" : "Want to read"}
          </button>
        </div>
      </div>
    </li>
  );
}

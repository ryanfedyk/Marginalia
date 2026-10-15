"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Book, BookMetadata, Collection, Collections, UpNext, CompanionEntry, Note, ReadingStatus, TasteProfile } from "./types";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
const now = () => new Date().toISOString();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

interface LibraryState {
  books: Book[];
  profile: TasteProfile | null;
  collections: Collections | null;
  upNext: UpNext | null;
  /** Firebase uid this local library belongs to (null = never synced / signed out). */
  ownerUid: string | null;
  /** Returns the existing book if it's already shelved. */
  findDuplicate: (meta: BookMetadata) => Book | undefined;
  addBook: (meta: BookMetadata, status?: ReadingStatus) => { book: Book; duplicate: boolean };
  removeBook: (id: string) => void;
  updateBook: (
    id: string,
    patch: Partial<Pick<Book, "status" | "progress" | "title" | "authors" | "coverUrl" | "rating" | "finishedAt" | "startedAt">>,
  ) => void;
  setSimilar: (bookId: string, similar: NonNullable<Book["similar"]>) => void;
  addNote: (bookId: string, note: Omit<Note, "id" | "createdAt" | "updatedAt">) => void;
  updateNote: (bookId: string, noteId: string, patch: Partial<Pick<Note, "body" | "kind" | "locator">>) => void;
  removeNote: (bookId: string, noteId: string) => void;
  addCompanion: (bookId: string, entry: Omit<CompanionEntry, "id" | "createdAt">) => void;
  removeCompanion: (bookId: string, entryId: string) => void;
  setProfile: (p: TasteProfile | null) => void;
  setCollections: (c: Collections | null) => void;
  setUpNext: (u: UpNext | null) => void;
  setCollectionRecs: (name: string, recs: NonNullable<Collection["recs"]>) => void;
  importLibrary: (books: Book[]) => number;
  setPraise: (bookId: string, praise: NonNullable<Book["praise"]>) => void;
  /** Cloud sync: apply remote state without touching timestamps. */
  applyRemote: (upserts: Book[], deletedIds: string[]) => void;
  setOwner: (uid: string | null) => void;
  resetLocal: () => void;
}

function touch(books: Book[], id: string, fn: (b: Book) => Book): Book[] {
  return books.map((b) => (b.id === id ? { ...fn(b), updatedAt: now() } : b));
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      profile: null,
      collections: null,
      upNext: null,
      ownerUid: null,

      findDuplicate: (meta) =>
        get().books.find(
          (b) =>
            (meta.isbn13 && b.isbn13 === meta.isbn13) ||
            (norm(b.title) === norm(meta.title) && norm(b.authors[0] ?? "") === norm(meta.authors[0] ?? "")),
        ),

      addBook: (meta, status = "want") => {
        const existing = get().findDuplicate(meta);
        if (existing) return { book: existing, duplicate: true };
        const book: Book = {
          ...meta,
          id: uid(),
          status,
          notes: [],
          companion: [],
          addedAt: now(),
          updatedAt: now(),
        };
        set((s) => ({ books: [book, ...s.books] }));
        return { book, duplicate: false };
      },

      removeBook: (id) => set((s) => ({ books: s.books.filter((b) => b.id !== id) })),

      updateBook: (id, patch) =>
        set((s) => ({
          books: touch(s.books, id, (b) => {
            const next = { ...b, ...patch };
            // Dates follow status changes made in the app, so the timeline builds itself.
            if (patch.status && patch.status !== b.status) {
              if (patch.status === "reading" && !b.startedAt) next.startedAt = now();
              if (patch.status === "finished" && !("finishedAt" in patch)) next.finishedAt = now();
              if (patch.status !== "finished" && b.status === "finished") next.finishedAt = undefined;
            }
            return next;
          }),
        })),

      addNote: (bookId, note) =>
        set((s) => ({
          books: touch(s.books, bookId, (b) => ({
            ...b,
            notes: [{ ...note, id: uid(), createdAt: now(), updatedAt: now() }, ...b.notes],
          })),
        })),

      updateNote: (bookId, noteId, patch) =>
        set((s) => ({
          books: touch(s.books, bookId, (b) => ({
            ...b,
            notes: b.notes.map((n) => (n.id === noteId ? { ...n, ...patch, updatedAt: now() } : n)),
          })),
        })),

      removeNote: (bookId, noteId) =>
        set((s) => ({
          books: touch(s.books, bookId, (b) => ({ ...b, notes: b.notes.filter((n) => n.id !== noteId) })),
        })),

      addCompanion: (bookId, entry) =>
        set((s) => ({
          books: touch(s.books, bookId, (b) => ({
            ...b,
            companion: [{ ...entry, id: uid(), createdAt: now() }, ...b.companion],
          })),
        })),

      removeCompanion: (bookId, entryId) =>
        set((s) => ({
          books: touch(s.books, bookId, (b) => ({ ...b, companion: b.companion.filter((c) => c.id !== entryId) })),
        })),

      setProfile: (profile) => set({ profile }),
      setCollections: (collections) => set({ collections }),
      setUpNext: (upNext) => set({ upNext }),
      setCollectionRecs: (name, recs) =>
        set((s) =>
          s.collections
            ? {
                collections: {
                  ...s.collections,
                  updatedAt: now(),
                  items: s.collections.items.map((c) => (c.name === name ? { ...c, recs } : c)),
                },
              }
            : {},
        ),

      importLibrary: (incoming) => {
        let added = 0;
        for (const b of incoming) {
          if (!b?.title || get().findDuplicate(b)) continue;
          set((s) => ({
            books: [...s.books, { ...b, notes: b.notes ?? [], companion: b.companion ?? [], id: b.id || uid() }],
          }));
          added++;
        }
        return added;
      },

      setSimilar: (bookId, similar) => set((s) => ({ books: touch(s.books, bookId, (b) => ({ ...b, similar })) })),

      setPraise: (bookId, praise) => set((s) => ({ books: touch(s.books, bookId, (b) => ({ ...b, praise })) })),

      applyRemote: (upserts, deletedIds) =>
        set((s) => {
          const gone = new Set(deletedIds);
          const byId = new Map(s.books.filter((b) => !gone.has(b.id)).map((b) => [b.id, b]));
          for (const b of upserts) byId.set(b.id, { ...b, notes: b.notes ?? [], companion: b.companion ?? [] });
          // Preserve local order; new remote books go first.
          const order = s.books.map((b) => b.id).filter((id) => byId.has(id));
          const fresh = upserts.map((b) => b.id).filter((id) => !order.includes(id));
          return { books: [...fresh, ...order].map((id) => byId.get(id)!) };
        }),

      setOwner: (ownerUid) => set({ ownerUid }),

      resetLocal: () => set({ books: [], profile: null, collections: null, upNext: null, ownerUid: null }),
    }),
    {
      name: "marginalia.library.v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

/** True once zustand has rehydrated from localStorage (avoids empty-state flash). */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useLibrary.persist.hasHydrated()) setHydrated(true);
    return useLibrary.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}

/** Changes whenever what we know about the reader's taste changes (books, statuses, ratings). */
export function libraryFingerprint(books: Book[]): string {
  const sig = books
    .map((b) => `${b.id}:${b.status}:${b.rating ?? 0}`)
    .sort()
    .join("|");
  let h = 0;
  for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
  return `${books.length}-${(h >>> 0).toString(36)}`;
}

/** What "Up next" depends on: the want-to-read pile, what's being read, and ratings. */
export function upNextFingerprint(books: Book[]): string {
  const sig = books
    .filter((b) => b.status === "want" || b.status === "reading" || b.rating)
    .map((b) => `${b.id}:${b.status}:${b.rating ?? 0}`)
    .sort()
    .join("|");
  let h = 0;
  for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

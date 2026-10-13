"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Book, BookMetadata, CompanionEntry, Note, ReadingStatus, TasteProfile } from "./types";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
const now = () => new Date().toISOString();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

interface LibraryState {
  books: Book[];
  profile: TasteProfile | null;
  /** Returns the existing book if it's already shelved. */
  findDuplicate: (meta: BookMetadata) => Book | undefined;
  addBook: (meta: BookMetadata, status?: ReadingStatus) => { book: Book; duplicate: boolean };
  removeBook: (id: string) => void;
  updateBook: (id: string, patch: Partial<Pick<Book, "status" | "progress" | "title" | "authors" | "coverUrl">>) => void;
  addNote: (bookId: string, note: Omit<Note, "id" | "createdAt" | "updatedAt">) => void;
  updateNote: (bookId: string, noteId: string, patch: Partial<Pick<Note, "body" | "kind" | "locator">>) => void;
  removeNote: (bookId: string, noteId: string) => void;
  addCompanion: (bookId: string, entry: Omit<CompanionEntry, "id" | "createdAt">) => void;
  removeCompanion: (bookId: string, entryId: string) => void;
  setProfile: (p: TasteProfile | null) => void;
  importLibrary: (books: Book[]) => number;
}

function touch(books: Book[], id: string, fn: (b: Book) => Book): Book[] {
  return books.map((b) => (b.id === id ? { ...fn(b), updatedAt: now() } : b));
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      profile: null,

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

      updateBook: (id, patch) => set((s) => ({ books: touch(s.books, id, (b) => ({ ...b, ...patch })) })),

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

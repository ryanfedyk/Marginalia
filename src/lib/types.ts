export type ReadingStatus = "want" | "reading" | "finished" | "paused";

export const STATUS_LABELS: Record<ReadingStatus, string> = {
  want: "Want to read",
  reading: "Reading",
  finished: "Finished",
  paused: "Set aside",
};

export type NoteKind = "note" | "takeaway" | "quote" | "reaction";

export const NOTE_LABELS: Record<NoteKind, string> = {
  note: "Note",
  takeaway: "Takeaway",
  quote: "Quote",
  reaction: "Reaction",
};

export interface Note {
  id: string;
  kind: NoteKind;
  body: string;
  /** Free-form location: "p. 112", "ch. 4". */
  locator?: string;
  createdAt: string;
  updatedAt: string;
}

/** Metadata resolved from Open Library / Google Books. */
export interface BookMetadata {
  isbn13?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  coverUrl?: string;
  source: "openlibrary" | "googlebooks" | "manual";
}

export interface CompanionEntry {
  id: string;
  mode: CompanionMode;
  prompt: string;
  response: string;
  createdAt: string;
}

export type CompanionMode = "catchup" | "recap" | "untangle";

export interface CriticQuote {
  quote: string;
  critic: string;
  publication: string;
}

export interface Book extends BookMetadata {
  id: string;
  status: ReadingStatus;
  /** Where the reader currently is, e.g. "ch. 7" or "p. 140". Used to keep the Companion spoiler-safe. */
  progress?: string;
  notes: Note[];
  companion: CompanionEntry[];
  /** Critics' quotes found via search, cached so we only look them up once. */
  praise?: { quotes: CriticQuote[]; fetchedAt: string };
  /** Set when the book is marked Reading. */
  startedAt?: string;
  /** Set when the book is marked Finished (editable, to place earlier reads on the timeline). */
  finishedAt?: string;
  /** The reader's own rating, 1–5. Never shown on the shelf; feeds recommendations. */
  rating?: number;
  /** "Similar books" picks for this book, cached. `rating` records what it was based on. */
  similar?: { items: Recommendation[]; fetchedAt: string; rating?: number };
  addedAt: string;
  updatedAt: string;
}

export interface ShelfCandidate {
  title: string;
  author: string;
}

export interface Recommendation {
  title: string;
  author: string;
  why: string;
}

export interface Collection {
  name: string;
  blurb: string;
  bookIds: string[];
  /** "Discover more" picks for this collection, cached. */
  recs?: { items: Recommendation[]; fetchedAt: string };
}

export interface Collections {
  items: Collection[];
  generatedAt: string;
  /** Last change of any kind (e.g. new "Discover more" picks); drives sync. */
  updatedAt?: string;
  /** Book ids the collections were drawn from, to spot new arrivals. */
  basisIds: string[];
}

export interface TasteProfile {
  summary: string;
  threads: string[];
  recommendations: Recommendation[];
  generatedAt: string;
  /** Number of books the profile was computed from. */
  basis: number;
  /** Library fingerprint (books, statuses, ratings) at generation time, to flag staleness. */
  fingerprint?: string;
}

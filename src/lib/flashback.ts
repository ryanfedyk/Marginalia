import type { Book, Note } from "./types";

export interface Flashback {
  note: Note;
  book: Book;
  /** e.g. "A year ago today" or "4 months ago" */
  when: string;
  onThisDay: boolean;
}

const DAY = 86_400_000;
const KIND_WEIGHT: Record<Note["kind"], number> = { quote: 1.6, takeaway: 1.3, reaction: 1.15, note: 1 };

export function ago(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / DAY);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = Math.round(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

/**
 * Pick one note to resurface. Notes written on today's date in an earlier year win outright;
 * otherwise older notes and quotes are favoured, and the last one shown is avoided.
 */
export function pickFlashback(books: Book[], lastId?: string | null, now = Date.now(), rand = Math.random): Flashback | null {
  const all = books.flatMap((book) => book.notes.filter((n) => n.body.trim()).map((note) => ({ note, book })));
  if (!all.length) return null;

  const today = new Date(now);
  const onThisDay = all.filter(({ note }) => {
    const d = new Date(note.createdAt);
    return d.getMonth() === today.getMonth() && d.getDate() === today.getDate() && d.getFullYear() < today.getFullYear();
  });
  if (onThisDay.length) {
    const pool = onThisDay.length > 1 ? onThisDay.filter((x) => x.note.id !== lastId) : onThisDay;
    const pick = pool[Math.floor(rand() * pool.length)];
    const years = today.getFullYear() - new Date(pick.note.createdAt).getFullYear();
    return { ...pick, when: years === 1 ? "A year ago today" : `${years} years ago today`, onThisDay: true };
  }

  // Fresh notes (under 3 days) only if there's nothing older.
  const settled = all.filter(({ note }) => now - new Date(note.createdAt).getTime() > 3 * DAY);
  let pool = settled.length ? settled : all;
  if (pool.length > 1) pool = pool.filter((x) => x.note.id !== lastId);

  const weights = pool.map(({ note }) => {
    const ageDays = Math.max(1, (now - new Date(note.createdAt).getTime()) / DAY);
    return Math.sqrt(ageDays) * KIND_WEIGHT[note.kind];
  });
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  let i = 0;
  while (i < pool.length - 1 && (r -= weights[i]) > 0) i++;
  const pick = pool[i];
  return { ...pick, when: ago(pick.note.createdAt, now), onThisDay: false };
}

/** "The Waves" → "waves", for alphabetical sorting. */
export function titleKey(title: string): string {
  return title.trim().toLowerCase().replace(/^(the|a|an)\s+/, "").replace(/^[^a-z0-9]+/, "");
}

/** "Kazuo Ishiguro" → "ishiguro kazuo"; handles "Le Guin", "de Beauvoir" and suffixes loosely. */
export function authorKey(author: string | undefined): string {
  if (!author) return "￿";
  const parts = author.trim().toLowerCase().replace(/,?\s+(jr|sr|ii|iii)\.?$/, "").split(/\s+/);
  if (parts.length === 1) return parts[0];
  const particles = new Set(["le", "la", "de", "du", "van", "von", "der", "di", "da", "del"]);
  let i = parts.length - 1;
  while (i > 1 && particles.has(parts[i - 1])) i--;
  return `${parts.slice(i).join(" ")} ${parts.slice(0, i).join(" ")}`;
}

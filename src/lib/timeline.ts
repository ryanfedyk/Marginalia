import { authorKey } from "./flashback";
import type { Book } from "./types";

export interface YearOfReading {
  year: number;
  /** Index 0–11 → books finished that month, oldest first. */
  months: Book[][];
  count: number;
  pages: number;
  favourite?: Book;
  topAuthor?: { name: string; count: number };
}

export function buildTimeline(books: Book[]): { years: YearOfReading[]; undated: Book[] } {
  const finished = books.filter((b) => b.status === "finished");
  const dated = finished.filter((b) => b.finishedAt && !Number.isNaN(new Date(b.finishedAt).getTime()));
  const undated = finished.filter((b) => !dated.includes(b));

  const byYear = new Map<number, Book[]>();
  for (const b of dated) {
    const y = new Date(b.finishedAt!).getFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), b]);
  }

  const years = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => {
      const months: Book[][] = Array.from({ length: 12 }, () => []);
      for (const b of [...list].sort((a, c) => a.finishedAt!.localeCompare(c.finishedAt!))) months[new Date(b.finishedAt!).getMonth()].push(b);
      const rated = list.filter((b) => b.rating).sort((a, c) => (c.rating ?? 0) - (a.rating ?? 0) || c.finishedAt!.localeCompare(a.finishedAt!));
      const authors = new Map<string, { name: string; count: number }>();
      for (const b of list) {
        const name = b.authors[0];
        if (!name) continue;
        const k = authorKey(name);
        authors.set(k, { name, count: (authors.get(k)?.count ?? 0) + 1 });
      }
      const top = [...authors.values()].sort((a, c) => c.count - a.count)[0];
      return {
        year,
        months,
        count: list.length,
        pages: list.reduce((n, b) => n + (b.pageCount ?? 0), 0),
        favourite: rated[0]?.rating && rated[0].rating >= 4 ? rated[0] : undefined,
        topAuthor: top && top.count >= 2 ? top : undefined,
      };
    });
  return { years, undated };
}

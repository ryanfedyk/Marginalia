import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";
import type { Book } from "./types";

const b = (id: string, extra: Partial<Book> = {}): Book =>
  ({ id, title: id, authors: ["Jane Doe"], status: "finished", notes: [], companion: [], source: "manual", addedAt: "", updatedAt: "", ...extra }) as Book;

describe("buildTimeline", () => {
  it("groups finished books by year (newest first) and month, with year stats", () => {
    const { years, undated } = buildTimeline([
      b("a", { finishedAt: "2026-01-15T00:00:00Z", pageCount: 300, rating: 5 }),
      b("b", { finishedAt: "2026-01-20T00:00:00Z", pageCount: 200, rating: 3 }),
      b("c", { finishedAt: "2026-07-01T00:00:00Z", authors: ["Other Person"] }),
      b("d", { finishedAt: "2025-03-03T00:00:00Z" }),
      b("e"), // finished, no date
      b("f", { status: "reading", finishedAt: "2026-02-01T00:00:00Z" }), // not finished
    ]);
    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    const y26 = years[0];
    expect(y26.count).toBe(3);
    expect(y26.months[0].map((x) => x.id)).toEqual(["a", "b"]);
    expect(y26.months[6].map((x) => x.id)).toEqual(["c"]);
    expect(y26.pages).toBe(500);
    expect(y26.favourite?.id).toBe("a");
    expect(y26.topAuthor).toEqual({ name: "Jane Doe", count: 2 });
    expect(undated.map((x) => x.id)).toEqual(["e"]);
  });
});

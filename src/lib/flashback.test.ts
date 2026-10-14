import { describe, expect, it } from "vitest";
import { authorKey, pickFlashback, titleKey } from "./flashback";
import type { Book, Note } from "./types";

const now = new Date("2026-10-14T12:00:00Z").getTime();
const note = (id: string, createdAt: string, kind: Note["kind"] = "note"): Note => ({ id, kind, body: `note ${id}`, createdAt, updatedAt: createdAt });
const book = (id: string, notes: Note[]): Book =>
  ({ id, title: id, authors: ["A"], status: "finished", notes, companion: [], source: "manual", addedAt: "", updatedAt: "" }) as Book;

describe("pickFlashback", () => {
  it("returns null when there are no notes", () => {
    expect(pickFlashback([book("b", [])], null, now)).toBeNull();
  });

  it("prefers a note written on this day in an earlier year", () => {
    const books = [book("b", [note("old", "2026-01-01T10:00:00Z"), note("anniv", "2025-10-14T09:00:00Z")])];
    const f = pickFlashback(books, null, now)!;
    expect(f.note.id).toBe("anniv");
    expect(f.when).toBe("A year ago today");
  });

  it("avoids showing the same note twice in a row", () => {
    const books = [book("b", [note("x", "2026-01-01T00:00:00Z"), note("y", "2026-02-01T00:00:00Z")])];
    for (let i = 0; i < 20; i++) expect(pickFlashback(books, "x", now, Math.random)!.note.id).toBe("y");
  });

  it("skips brand-new notes when older ones exist", () => {
    const books = [book("b", [note("new", "2026-10-13T00:00:00Z"), note("old", "2026-05-01T00:00:00Z")])];
    for (let i = 0; i < 20; i++) expect(pickFlashback(books, null, now, Math.random)!.note.id).toBe("old");
  });
});

describe("sort keys", () => {
  it("ignores leading articles in titles", () => {
    expect(["The Waves", "Austerlitz", "A Month in the Country"].sort((a, b) => titleKey(a).localeCompare(titleKey(b)))).toEqual([
      "Austerlitz",
      "A Month in the Country",
      "The Waves",
    ]);
  });
  it("sorts authors by surname, keeping particles", () => {
    expect(authorKey("Kazuo Ishiguro")).toBe("ishiguro kazuo");
    expect(authorKey("Ursula K. Le Guin")).toBe("le guin ursula k.");
    expect(authorKey("Homer")).toBe("homer");
  });
});

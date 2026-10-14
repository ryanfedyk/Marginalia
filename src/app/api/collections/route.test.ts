import { beforeEach, describe, expect, it, vi } from "vitest";

const structured = vi.fn();
vi.mock("@/lib/ai", () => ({
  structured: (...a: unknown[]) => structured(...a),
  errorResponse: (e: unknown) => Response.json({ error: String(e) }, { status: 500 }),
}));

const books = Array.from({ length: 20 }, (_, i) => ({ id: `b${i + 1}`, title: `T${i + 1}`, author: "X", status: "finished" }));
const post = async () => {
  const { POST } = await import("./route");
  const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ books }) }));
  return (await res.json()).collections as { name: string; bookIds: string[] }[];
};

beforeEach(() => structured.mockReset());

describe("POST /api/collections", () => {
  it("maps numbers to ids, de-dupes, drops out-of-range and tiny rows", async () => {
    structured.mockResolvedValueOnce({
      collections: [
        { name: "Quiet Lives", blurb: "b", books: [1, 2, 2, 99, ...Array.from({ length: 18 }, (_, i) => i + 3)] },
        { name: "Lonely Row", blurb: "b", books: [3] },
      ],
    });
    const cols = await post();
    expect(cols).toHaveLength(1);
    expect(cols[0].bookIds.slice(0, 3)).toEqual(["b1", "b2", "b3"]);
    expect(structured).toHaveBeenCalledTimes(1); // nothing left over → no second pass
  });

  it("runs a second pass to place leftovers into existing or new collections", async () => {
    structured
      .mockResolvedValueOnce({
        collections: [
          { name: "A", blurb: "a", books: [1, 2, 3, 4, 5] },
          { name: "B", blurb: "b", books: [6, 7, 8, 9, 10] },
        ],
      })
      .mockResolvedValueOnce({
        assignments: [
          { book: 11, collections: [1] },
          { book: 12, collections: [2, 1] },
          { book: 1, collections: [2] }, // not a leftover: ignored
        ],
        newCollections: [{ name: "Strangers Welcome", blurb: "c", books: [13, 14, 15, 16, 17, 18, 19, 20, 3] }],
      });
    const cols = await post();
    const byName = Object.fromEntries(cols.map((c) => [c.name, c.bookIds]));
    expect(byName.A).toEqual(["b1", "b2", "b3", "b4", "b5", "b11", "b12"]);
    expect(byName.B).toEqual(["b6", "b7", "b8", "b9", "b10", "b12"]);
    expect(byName["Strangers Welcome"]).toEqual(["b13", "b14", "b15", "b16", "b17", "b18", "b19", "b20"]);
    // every book now has a home
    expect(new Set(cols.flatMap((c) => c.bookIds)).size).toBe(20);
  });

  it("keeps the first pass if the second pass fails", async () => {
    structured
      .mockResolvedValueOnce({ collections: [{ name: "A", blurb: "a", books: [1, 2, 3, 4] }] })
      .mockRejectedValueOnce(new Error("busy"));
    const cols = await post();
    expect(cols.map((c) => c.name)).toEqual(["A"]);
  });
});

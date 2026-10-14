import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({
  structured: vi.fn(async () => ({
    collections: [
      { name: "Quiet Lives", blurb: "Small lives, enormous feeling.", books: [1, 2, 2, 99] },
      { name: "Lonely Row", blurb: "Only one valid book.", books: [3] },
    ],
  })),
  errorResponse: (e: unknown) => Response.json({ error: String(e) }, { status: 500 }),
}));

describe("POST /api/collections", () => {
  it("maps book numbers back to ids, de-dupes, drops out-of-range and tiny rows", async () => {
    const { POST } = await import("./route");
    const books = ["a", "b", "c", "d"].map((id) => ({ id, title: id.toUpperCase(), author: "X", status: "want" }));
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ books }) }));
    const data = await res.json();
    expect(data.collections).toEqual([{ name: "Quiet Lives", blurb: "Small lives, enormous feeling.", bookIds: ["a", "b"] }]);
  });
});

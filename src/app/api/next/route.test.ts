import { describe, expect, it, vi } from "vitest";

const structured = vi.fn(async (_opts: { content: string; system: string }) => ({ picks: [{ book: 2, why: "A slim 180 pages after a long haul." }, { book: 9, why: "x" }] }));
vi.mock("@/lib/ai", () => ({
  structured: (opts: { content: string; system: string }) => structured(opts),
  errorResponse: (e: unknown) => Response.json({ error: String(e) }, { status: 500 }),
}));

describe("POST /api/next", () => {
  it("sends page counts, progress and the date/season, and returns valid picks only", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          want: [
            { title: "Moby-Dick", author: "Herman Melville", pages: 635, waiting: "added a year ago" },
            { title: "The Old Man and the Sea", author: "Ernest Hemingway", pages: 127 },
          ],
          reading: [{ title: "Middlemarch", author: "George Eliot", pages: 880, waiting: "at p. 840" }],
          today: "Friday 17 October 2026",
          season: "autumn",
        }),
      }),
    );
    const content = structured.mock.calls[0][0].content;
    expect(content).toContain("Moby-Dick — Herman Melville, 635 pages");
    expect(content).toContain("Middlemarch — George Eliot, 880 pages, at p. 840");
    expect(content).toContain("Today is Friday 17 October 2026 (autumn where I live).");
    expect(structured.mock.calls[0][0].system).toMatch(/Length matters/);
    expect((await res.json()).picks).toEqual([{ index: 1, why: "A slim 180 pages after a long haul." }]);
  });
});

import { describe, expect, it, vi } from "vitest";

const RECEPTION = `In The Guardian, Johanna Thomas-Corr called it “a charming, moving fable”. Kirkus said the book was "a feel-good novel with an irresistible premise".`;

vi.mock("@/lib/wikipedia", async (orig) => ({
  ...(await orig<typeof import("@/lib/wikipedia")>()),
  findReception: vi.fn(async () => ({ article: "The Midnight Library", text: RECEPTION })),
}));
const searchGroundedJson = vi.fn();
vi.mock("@/lib/ai", () => ({
  structured: vi.fn(async () => ({
    quotes: [
      { quote: "a charming, moving fable", critic: "Johanna Thomas-Corr", publication: "The Guardian" },
      { quote: "a life-affirming masterpiece for our times", critic: "Invented", publication: "Nowhere" }, // not in source
      { quote: "a feel-good novel with an irresistible premise", critic: "", publication: "Kirkus" },
    ],
  })),
  searchGroundedJson: (...a: unknown[]) => searchGroundedJson(...a),
  errorResponse: (e: unknown) => Response.json({ error: String(e) }, { status: 500 }),
}));

describe("POST /api/praise", () => {
  it("uses Wikipedia, keeps only quotes that appear verbatim, and skips web search", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ title: "The Midnight Library", authors: ["Matt Haig"] }) }));
    const data = await res.json();
    expect(data.source).toBe("wikipedia");
    expect(data.quotes.map((q: { quote: string }) => q.quote)).toEqual([
      "a charming, moving fable",
      "a feel-good novel with an irresistible premise",
    ]);
    expect(searchGroundedJson).not.toHaveBeenCalled();
  });
});

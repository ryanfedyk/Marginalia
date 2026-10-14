import { afterEach, describe, expect, it, vi } from "vitest";
import { appearsIn, findReception, pickArticle, receptionSection } from "./wikipedia";

afterEach(() => vi.unstubAllGlobals());

const ARTICLE = `The Midnight Library is a 2020 fantasy novel by Matt Haig.

== Plot ==
Nora Seed finds herself in a library between life and death.

== Reception ==
The novel was a bestseller. In The Guardian, Johanna Thomas-Corr called it “a charming, moving fable”.
=== Awards ===
It won the Goodreads Choice Award.

== Adaptation ==
A film adaptation was announced.`;

describe("wikipedia", () => {
  it("picks the novel's article over a film or the author", () => {
    const pick = pickArticle(
      [
        { title: "Matt Haig", snippet: "English author of The Midnight Library" },
        { title: "The Midnight Library (film)", snippet: "upcoming film" },
        { title: "The Midnight Library", snippet: "2020 novel by Matt Haig" },
      ],
      "The Midnight Library",
      "Matt Haig",
    );
    expect(pick).toBe("The Midnight Library");
  });

  it("returns nothing when no article is clearly about the book", () => {
    expect(pickArticle([{ title: "Library", snippet: "a collection of books" }], "The Midnight Library", "Matt Haig")).toBeNull();
  });

  it("extracts the Reception section including subsections, stopping at the next section", () => {
    const text = receptionSection(ARTICLE)!;
    expect(text).toContain("a charming, moving fable");
    expect(text).toContain("Goodreads Choice Award");
    expect(text).not.toContain("film adaptation");
    expect(text).not.toContain("Nora Seed");
  });

  it("verifies quotes word for word, tolerant of quote marks, case and spacing", () => {
    expect(appearsIn('"A charming,  moving fable"', ARTICLE)).toBe(true);
    expect(appearsIn("a charming and moving fable", ARTICLE)).toBe(false); // paraphrase rejected
    expect(appearsIn("fable", ARTICLE)).toBe(false); // too short to mean anything
  });

  it("fetches search then the article extract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.searchParams.get("list") === "search")
          return Response.json({ query: { search: [{ title: "The Midnight Library", snippet: "novel by Matt Haig" }] } });
        return Response.json({ query: { pages: [{ title: "The Midnight Library", extract: ARTICLE }] } });
      }),
    );
    const r = await findReception("The Midnight Library", "Matt Haig");
    expect(r?.article).toBe("The Midnight Library");
    expect(r?.text).toContain("Johanna Thomas-Corr");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupIsbn, resolveTitle } from "./metadata";

type Route = [RegExp, (method: string) => { status: number; body?: unknown }];

function mockFetch(routes: Route[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const route = routes.find(([re]) => re.test(url));
      const { status, body } = route ? route[1](init?.method ?? "GET") : { status: 404 };
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("lookupIsbn", () => {
  it("uses Open Library with canonical ISBN cover and resolves author names via the work", async () => {
    mockFetch([
      [/openlibrary\.org\/isbn\/9780679728757\.json/, () => ({ status: 200, body: {
        title: "Blood Meridian", publishers: ["Vintage"], publish_date: "1992", number_of_pages: 337,
        works: [{ key: "/works/OL1W" }], covers: [123],
      } })],
      [/openlibrary\.org\/works\/OL1W\.json/, () => ({ status: 200, body: { authors: [{ author: { key: "/authors/OL9A" } }] } })],
      [/openlibrary\.org\/authors\/OL9A\.json/, () => ({ status: 200, body: { name: "Cormac McCarthy" } })],
      [/covers\.openlibrary\.org\/b\/isbn\/9780679728757-L\.jpg\?default=false/, () => ({ status: 200 })],
      [/googleapis/, () => ({ status: 200, body: { items: [] } })],
    ]);
    const book = await lookupIsbn("0679728759");
    expect(book).toMatchObject({
      isbn13: "9780679728757",
      title: "Blood Meridian",
      authors: ["Cormac McCarthy"],
      publisher: "Vintage",
      pageCount: 337,
      coverUrl: "https://covers.openlibrary.org/b/isbn/9780679728757-L.jpg",
      source: "openlibrary",
    });
  });

  it("falls back to the cover id, then Google Books when Open Library has nothing", async () => {
    mockFetch([
      [/googleapis/, () => ({ status: 200, body: { items: [{ volumeInfo: {
        title: "Stoner", authors: ["John Williams"], pageCount: 288,
        imageLinks: { thumbnail: "http://books.google.com/x?id=1&zoom=1&edge=curl" },
      } }] } })],
    ]);
    const book = await lookupIsbn("9781590171998");
    expect(book?.title).toBe("Stoner");
    expect(book?.source).toBe("googlebooks");
    expect(book?.coverUrl).toBe("https://books.google.com/x?id=1&zoom=0");
  });

  it("rejects invalid ISBNs without network calls", async () => {
    mockFetch([]);
    expect(await lookupIsbn("12345")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("resolveTitle", () => {
  it("prefers a search hit with a cover and returns a 13-digit ISBN", async () => {
    mockFetch([
      [/openlibrary\.org\/search\.json/, () => ({ status: 200, body: { docs: [
        { title: "Blood Meridian (no cover)", author_name: ["X"] },
        { title: "Blood Meridian", author_name: ["Cormac McCarthy"], isbn: ["0679728759"], cover_i: 42, first_publish_year: 1985 },
      ] } })],
    ]);
    const book = await resolveTitle("Blood Meridian", "Cormac McCarthy");
    expect(book).toMatchObject({
      title: "Blood Meridian",
      isbn13: "9780679728757",
      coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg",
      publishedDate: "1985",
    });
  });
});

describe("suggestBooks", () => {
  it("merges Open Library and Google Books, de-duplicating the same book", async () => {
    const { suggestBooks } = await import("./metadata");
    mockFetch([
      [/openlibrary\.org\/search\.json/, () => ({ status: 200, body: { docs: [
        { title: "Stoner", author_name: ["John Williams"], cover_i: 7, first_publish_year: 1965 },
        { title: "Stoner's Daughter", author_name: ["Someone Else"] },
      ] } })],
      [/googleapis/, () => ({ status: 200, body: { items: [
        { volumeInfo: { title: "Stoner", authors: ["John Williams"] } },
        { volumeInfo: { title: "Stone Mattress", authors: ["Margaret Atwood"] } },
      ] } })],
    ]);
    const s = await suggestBooks("stoner");
    expect(s.map((x) => x.title)).toEqual(["Stoner", "Stoner's Daughter", "Stone Mattress"]);
    expect(s[0].thumbUrl).toBe("https://covers.openlibrary.org/b/id/7-M.jpg");
  });

  it("ignores one-character queries", async () => {
    const { suggestBooks } = await import("./metadata");
    mockFetch([]);
    expect(await suggestBooks("s")).toEqual([]);
  });
});

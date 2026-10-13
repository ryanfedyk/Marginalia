import "server-only";
import type { BookMetadata } from "./types";
import { toIsbn13 } from "./isbn";

const UA = "Marginalia/0.1 (personal reading companion)";
const OL = "https://openlibrary.org";
const COVERS = "https://covers.openlibrary.org";

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** True when Open Library actually has art for this cover URL (it serves a 1px placeholder otherwise). */
async function coverExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}?default=false`, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Google Books thumbnails default to a tiny, curled-page rendition — ask for the largest clean one. */
function upgradeGoogleCover(url?: string): string | undefined {
  if (!url) return undefined;
  return url
    .replace(/^http:/, "https:")
    .replace(/&edge=curl/g, "")
    .replace(/zoom=\d/, "zoom=0");
}

/* ---------- Open Library ---------- */

interface OLEdition {
  title?: string;
  subtitle?: string;
  authors?: { key: string }[];
  works?: { key: string }[];
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  covers?: number[];
}

interface OLWork {
  authors?: { author: { key: string } }[];
}

async function authorNames(keys: string[]): Promise<string[]> {
  const names = await Promise.all(
    keys.slice(0, 4).map(async (k) => (await getJson<{ name?: string }>(`${OL}${k}.json`))?.name),
  );
  return names.filter((n): n is string => Boolean(n));
}

async function openLibraryByIsbn(isbn: string): Promise<BookMetadata | null> {
  const ed = await getJson<OLEdition>(`${OL}/isbn/${isbn}.json`);
  if (!ed?.title) return null;

  let authorKeys = ed.authors?.map((a) => a.key) ?? [];
  if (!authorKeys.length && ed.works?.[0]) {
    const work = await getJson<OLWork>(`${OL}${ed.works[0].key}.json`);
    authorKeys = work?.authors?.map((a) => a.author.key) ?? [];
  }

  const isbnCover = `${COVERS}/b/isbn/${isbn}-L.jpg`;
  const idCover = ed.covers?.find((c) => c > 0);
  const coverUrl = (await coverExists(isbnCover))
    ? isbnCover
    : idCover
      ? `${COVERS}/b/id/${idCover}-L.jpg`
      : undefined;

  return {
    isbn13: isbn,
    title: ed.title,
    subtitle: ed.subtitle,
    authors: await authorNames(authorKeys),
    publisher: ed.publishers?.[0],
    publishedDate: ed.publish_date,
    pageCount: ed.number_of_pages,
    coverUrl,
    source: "openlibrary",
  };
}

/* ---------- Google Books ---------- */

interface GBVolume {
  volumeInfo: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: Record<string, string>;
  };
}

function googleUrl(q: string) {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  return `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5${key ? `&key=${key}` : ""}`;
}

function fromGoogle(v: GBVolume): BookMetadata | null {
  const i = v.volumeInfo;
  if (!i?.title) return null;
  const ids = i.industryIdentifiers ?? [];
  const isbn13 =
    ids.find((x) => x.type === "ISBN_13")?.identifier ??
    toIsbn13(ids.find((x) => x.type === "ISBN_10")?.identifier ?? "") ??
    undefined;
  const img = i.imageLinks;
  return {
    isbn13,
    title: i.title,
    subtitle: i.subtitle,
    authors: i.authors ?? [],
    publisher: i.publisher,
    publishedDate: i.publishedDate,
    pageCount: i.pageCount,
    coverUrl: upgradeGoogleCover(img?.extraLarge ?? img?.large ?? img?.medium ?? img?.thumbnail),
    source: "googlebooks",
  };
}

async function googleByIsbn(isbn: string): Promise<BookMetadata | null> {
  const data = await getJson<{ items?: GBVolume[] }>(googleUrl(`isbn:${isbn}`));
  const v = data?.items?.[0];
  return v ? fromGoogle(v) : null;
}

/* ---------- Public API ---------- */

/** Resolve a scanned ISBN. Open Library first, Google Books to fill gaps. */
export async function lookupIsbn(rawIsbn: string): Promise<BookMetadata | null> {
  const isbn = toIsbn13(rawIsbn);
  if (!isbn) return null;

  const [ol, gb] = await Promise.all([openLibraryByIsbn(isbn), googleByIsbn(isbn)]);
  if (!ol) return gb ? { ...gb, isbn13: isbn } : null;
  if (!gb) return ol;

  // Open Library is canonical; Google Books only fills holes.
  return {
    ...ol,
    authors: ol.authors.length ? ol.authors : gb.authors,
    publisher: ol.publisher ?? gb.publisher,
    publishedDate: ol.publishedDate ?? gb.publishedDate,
    pageCount: ol.pageCount ?? gb.pageCount,
    subtitle: ol.subtitle ?? gb.subtitle,
    coverUrl: ol.coverUrl ?? gb.coverUrl,
  };
}

interface OLSearchDoc {
  title?: string;
  subtitle?: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  cover_edition_key?: string;
  first_publish_year?: number;
  number_of_pages_median?: number;
  publisher?: string[];
}

function pickIsbn13(list?: string[]): string | undefined {
  for (const raw of list ?? []) {
    const i = toIsbn13(raw);
    if (i) return i;
  }
  return undefined;
}

/** Resolve a title/author pair (from a shelf photo or a recommendation) to full metadata. */
export async function resolveTitle(title: string, author?: string): Promise<BookMetadata | null> {
  const params = new URLSearchParams({
    title,
    limit: "5",
    fields:
      "title,subtitle,author_name,isbn,cover_i,cover_edition_key,first_publish_year,number_of_pages_median,publisher",
  });
  if (author) params.set("author", author);
  const ol = await getJson<{ docs?: OLSearchDoc[] }>(`${OL}/search.json?${params}`);
  const doc = ol?.docs?.find((d) => d.cover_i) ?? ol?.docs?.[0];

  if (doc?.title) {
    return {
      isbn13: pickIsbn13(doc.isbn),
      title: doc.title,
      subtitle: doc.subtitle,
      authors: doc.author_name?.slice(0, 4) ?? (author ? [author] : []),
      publisher: doc.publisher?.[0],
      publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
      pageCount: doc.number_of_pages_median,
      coverUrl: doc.cover_i ? `${COVERS}/b/id/${doc.cover_i}-L.jpg` : undefined,
      source: "openlibrary",
    };
  }

  const q = `intitle:${title}${author ? ` inauthor:${author}` : ""}`;
  const gb = await getJson<{ items?: GBVolume[] }>(googleUrl(q));
  const v = gb?.items?.[0];
  return v ? fromGoogle(v) : null;
}

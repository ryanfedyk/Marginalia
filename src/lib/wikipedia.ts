import "server-only";

const API = "https://en.wikipedia.org/w/api.php";
const UA = "Marginalia/0.1 (personal reading companion)";

async function api<T>(params: Record<string, string>): Promise<T | null> {
  const q = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  try {
    const res = await fetch(`${API}?${q}`, {
      headers: { "User-Agent": UA, "Api-User-Agent": UA },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const bare = (s: string) => norm(s).replace(/\s*\(.*?\)\s*/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Pick the article that is about this book (not the author, a film, etc.). */
export function pickArticle(results: { title: string; snippet?: string }[], bookTitle: string, author?: string): string | null {
  const want = bare(bookTitle);
  const surname = author ? bare(author).split(" ").pop() : undefined;
  const candidates = results.filter((r) => {
    const t = bare(r.title);
    return t === want || t.startsWith(want);
  });
  const score = (r: { title: string; snippet?: string }) => {
    let s = 0;
    if (/\((novel|book|novella|memoir|short story collection|non-fiction book)\)/i.test(r.title)) s += 3;
    if (/\((film|tv series|album|song|play)\)/i.test(r.title)) s -= 5;
    const snip = norm(r.snippet ?? "");
    if (surname && snip.includes(surname)) s += 2;
    if (/\b(novel|book|memoir|novella)\b/.test(snip)) s += 1;
    if (bare(r.title) === want) s += 1;
    return s;
  };
  const best = candidates.sort((a, b) => score(b) - score(a))[0];
  return best && score(best) >= 1 ? best.title : null;
}

/** The "Reception" / "Critical reception" part of a plain-text article (with its subsections). */
export function receptionSection(extract: string): string | null {
  const lines = extract.split("\n");
  const out: string[] = [];
  let capturing = 0; // heading level being captured, 0 = not capturing
  for (const line of lines) {
    const h = /^(=+)\s*(.+?)\s*=+\s*$/.exec(line);
    if (h) {
      const level = h[1].length;
      if (capturing && level <= capturing) capturing = 0;
      if (!capturing && /reception|critical|reviews|response|reaction|acclaim/i.test(h[2])) capturing = level;
      continue;
    }
    if (capturing) out.push(line);
  }
  const text = out.join("\n").trim();
  return text.length > 80 ? text.slice(0, 12000) : null;
}

/** Wikipedia's reception text for a book, if it has one. */
export async function findReception(title: string, author?: string): Promise<{ article: string; text: string } | null> {
  const search = await api<{ query?: { search?: { title: string; snippet?: string }[] } }>({
    action: "query",
    list: "search",
    srsearch: `${title} ${author ?? ""} book`.trim(),
    srlimit: "8",
  });
  const article = pickArticle(search?.query?.search ?? [], title, author);
  if (!article) return null;

  const page = await api<{ query?: { pages?: { title: string; extract?: string }[] } }>({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exsectionformat: "wiki",
    redirects: "1",
    titles: article,
  });
  const extract = page?.query?.pages?.[0]?.extract;
  const text = extract ? receptionSection(extract) : null;
  return text ? { article, text } : null;
}

/** True when the quote appears word for word in the source (ignoring quote styles, case and spacing). */
export function appearsIn(quote: string, source: string): boolean {
  const q = norm(quote).replace(/^["'\s.…]+|["'\s.…]+$/g, "");
  return q.length >= 12 && norm(source).includes(q);
}

import { errorResponse, searchGroundedJson } from "@/lib/ai";

export const maxDuration = 120;

interface Quote {
  quote: string;
  critic: string;
  publication: string;
}

const SYSTEM = `You find published praise and criticism of books from professional critics and well-known writers.

Use Google Search to find real quotations about the given book from reviews, blurbs and essays (newspapers, literary magazines, notable authors).

Rules:
- Only include a quotation if you found it in a search result. Never invent, paraphrase or "improve" a quote. If you are not sure it is verbatim, leave it out.
- Prefer short, vivid lines (under 40 words) that say something interesting about the book itself.
- Attribute each quote to the critic or writer (or "Unsigned review" if none) and the publication.
- Return between 0 and 8 quotes. Returning none is better than returning anything uncertain.

Reply with only a JSON object, no prose: {"quotes":[{"quote":"...","critic":"...","publication":"..."}]}`;

export async function POST(req: Request) {
  let body: { title?: string; authors?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (!body.title) return Response.json({ error: "Missing title." }, { status: 400 });
  const author = body.authors?.join(", ") || "unknown author";

  try {
    const data = await searchGroundedJson<{ quotes?: Quote[] }>({
      system: SYSTEM,
      prompt: `Find critics' quotes about the book “${body.title}” by ${author}.`,
    });
    const quotes = (data.quotes ?? [])
      .filter((q) => q && typeof q.quote === "string" && q.quote.trim().length > 8)
      .map((q) => ({
        quote: q.quote.trim().replace(/^[“"']+|[”"']+$/g, ""),
        critic: String(q.critic ?? "").trim(),
        publication: String(q.publication ?? "").trim(),
      }))
      .slice(0, 8);
    return Response.json({ quotes });
  } catch (err) {
    return errorResponse(err);
  }
}

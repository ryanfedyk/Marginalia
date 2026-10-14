import { z } from "zod";
import { errorResponse, searchGroundedJson, structured } from "@/lib/ai";
import { appearsIn, findReception } from "@/lib/wikipedia";

export const maxDuration = 120;

interface Quote {
  quote: string;
  critic: string;
  publication: string;
}

const QuotesSchema = z.object({
  quotes: z.array(z.object({ quote: z.string(), critic: z.string(), publication: z.string() })),
});

const QUOTES_JSON_SCHEMA = {
  type: "object",
  properties: {
    quotes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string", description: "The quoted words exactly as they appear in the text, without surrounding quotation marks." },
          critic: { type: "string", description: "Who said it, or empty string if the text doesn't say." },
          publication: { type: "string", description: "Where it appeared, or empty string if the text doesn't say." },
        },
        required: ["quote", "critic", "publication"],
        additionalProperties: false,
      },
    },
  },
  required: ["quotes"],
  additionalProperties: false,
};

const EXTRACT_SYSTEM = `You pick out critics' quotations about a book from a passage summarising its reception.

Rules:
- Only use words that appear inside quotation marks in the passage, copied exactly — same words, same order. Never paraphrase, join fragments, or fix grammar.
- Prefer vivid, opinionated lines (under 40 words) about the book itself; skip sales figures, award lists and plot summary.
- Attribute each to the critic and publication the passage names; use empty strings if it doesn't say.
- Return up to 8. Returning none is fine.`;

const SEARCH_SYSTEM = `You find published praise of books from professional critics and well-known writers.
Use Google Search to find real quotations about the given book from reviews, blurbs and essays.
Only include a quotation if you found it in a search result; never invent or paraphrase. Returning none is better than anything uncertain.
Reply with only a JSON object: {"quotes":[{"quote":"...","critic":"...","publication":"..."}]}`;

function clean(quotes: Quote[]): Quote[] {
  return quotes
    .filter((q) => q && typeof q.quote === "string" && q.quote.trim().length > 8)
    .map((q) => ({
      quote: q.quote.trim().replace(/^[“"'‘]+|[”"'’]+$/g, ""),
      critic: String(q.critic ?? "").trim(),
      publication: String(q.publication ?? "").trim(),
    }))
    .slice(0, 8);
}

export async function POST(req: Request) {
  let body: { title?: string; authors?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (!body.title) return Response.json({ error: "Missing title." }, { status: 400 });
  const author = body.authors?.join(", ") || "";

  try {
    // 1. Wikipedia's "Reception" section: real quotes with attributions, no web search needed.
    const reception = await findReception(body.title, body.authors?.[0]);
    if (reception) {
      const { quotes } = await structured({
        system: EXTRACT_SYSTEM,
        schema: QuotesSchema,
        jsonSchema: QUOTES_JSON_SCHEMA,
        content: `Book: “${body.title}”${author ? ` by ${author}` : ""}\n\nReception (from Wikipedia, “${reception.article}”):\n\n${reception.text}`,
      });
      // Keep only quotes that really are in the source, word for word.
      const verified = clean(quotes).filter((q) => appearsIn(q.quote, reception.text));
      if (verified.length) return Response.json({ quotes: verified, source: "wikipedia" });
    }

    // 2. No usable Wikipedia reception: fall back to Gemini with Google Search.
    const data = await searchGroundedJson<{ quotes?: Quote[] }>({
      system: SEARCH_SYSTEM,
      prompt: `Find critics' quotes about the book “${body.title}”${author ? ` by ${author}` : ""}.`,
    });
    return Response.json({ quotes: clean(data.quotes ?? []), source: "search" });
  } catch (err) {
    return errorResponse(err);
  }
}

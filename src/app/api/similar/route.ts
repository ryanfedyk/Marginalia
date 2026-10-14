import { z } from "zod";
import { errorResponse, structured } from "@/lib/ai";

export const maxDuration = 120;

const SimilarSchema = z.object({
  books: z.array(z.object({ title: z.string(), author: z.string(), why: z.string() })),
});

const SIMILAR_JSON_SCHEMA = {
  type: "object",
  properties: {
    books: {
      type: "array",
      description: "6 real, published books.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          author: { type: "string" },
          why: { type: "string", description: "One sentence on what it shares with the given book." },
        },
        required: ["title", "author", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["books"],
  additionalProperties: false,
};

const SYSTEM = `You are a well-read bookseller recommending books similar to one the reader names.

"Similar" means a reader who connected with this book would likely connect with these: shared themes, sensibility, form, voice or atmosphere — not just the same genre label.
- Recommend real, published books only. At most one book per author, and not the given book's author unless it's an obvious companion.
- Mix one or two well-known choices with less obvious ones.
- Never recommend a book the reader already owns.
- If the reader rated the book, use it: a low rating means find books that do what they might have wanted this one to do better; a high rating means stay close.
- If their favourite books are listed, let them gently steer the picks.`;

interface Body {
  title?: string;
  authors?: string[];
  rating?: number;
  owned?: string[];
  favourites?: string[];
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (!body.title) return Response.json({ error: "Missing title." }, { status: 400 });

  const lines = [`Book: “${body.title}” by ${body.authors?.join(", ") || "unknown author"}.`];
  if (body.rating) lines.push(`The reader rated it ${body.rating}/5.`);
  if (body.favourites?.length) lines.push(`Books they rated highly: ${body.favourites.slice(0, 15).join("; ")}.`);
  if (body.owned?.length) lines.push(`Already on their shelf (do not recommend): ${body.owned.slice(0, 300).join("; ")}.`);
  lines.push("Recommend 6 similar books.");

  try {
    const { books } = await structured({
      system: SYSTEM,
      schema: SimilarSchema,
      jsonSchema: SIMILAR_JSON_SCHEMA,
      content: lines.join("\n"),
    });
    const owned = new Set((body.owned ?? []).map((t) => t.toLowerCase()));
    return Response.json({
      books: books.filter((b) => !owned.has(`${b.title} — ${b.author}`.toLowerCase())).slice(0, 8),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

import { z } from "zod";
import { errorResponse, structured } from "@/lib/ai";

export const maxDuration = 120;

interface ShelfEntry {
  title: string;
  author: string;
  status: string;
  rating?: number;
  notes?: string[];
}

const ProfileSchema = z.object({
  summary: z.string(),
  threads: z.array(z.string()),
  recommendations: z.array(z.object({ title: z.string(), author: z.string(), why: z.string() })),
});

const PROFILE_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Two or three sentences describing this reader's taste, addressed to them as 'you'.",
    },
    threads: {
      type: "array",
      items: { type: "string" },
      description: "3-6 short phrases naming recurring threads in their reading (themes, forms, moods, eras).",
    },
    recommendations: {
      type: "array",
      description: "6-8 books they do not already own.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          author: { type: "string" },
          why: { type: "string", description: "One sentence connecting it to specific books or notes in their library." },
        },
        required: ["title", "author", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "threads", "recommendations"],
  additionalProperties: false,
};

const SYSTEM = `You are a perceptive bookseller reading a customer's personal library.
Infer their taste from what they own, what they have finished and what they want to read. Their own ratings (1–5 stars) are the strongest signal: lean towards what they rated 4–5 and away from what resembles books they rated 1–2. Their notes and reactions come next.

Recommend real, published books that are not already in the library. Prefer depth over popularity: a mix of a few well-known choices and some less obvious ones. Avoid recommending more than one book by the same author. Each "why" must reference something specific from their library.`;

export async function POST(req: Request) {
  let body: { books?: ShelfEntry[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const books = (body.books ?? []).slice(0, 300);
  if (books.length === 0) return Response.json({ error: "Add a few books first." }, { status: 400 });

  const library = books
    .map((b) => {
      const notes = (b.notes ?? []).slice(0, 6).map((n) => `    - ${n.slice(0, 280)}`).join("\n");
      return `- ${b.title} — ${b.author || "unknown"} [${b.status}${b.rating ? `, rated ${b.rating}/5` : ""}]${notes ? `\n${notes}` : ""}`;
    })
    .join("\n");

  try {
    const profile = await structured({
      system: SYSTEM,
      schema: ProfileSchema,
      jsonSchema: PROFILE_JSON_SCHEMA,
      content: `Here is my library:\n\n${library}\n\nDescribe my taste and recommend what I should read next.`,
    });
    return Response.json({ profile });
  } catch (err) {
    return errorResponse(err);
  }
}

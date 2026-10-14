import { z } from "zod";
import { errorResponse, structured } from "@/lib/ai";

export const maxDuration = 120;

interface Entry {
  id: string;
  title: string;
  author: string;
  status: string;
  rating?: number;
}

const Schema = z.object({
  collections: z.array(z.object({ name: z.string(), blurb: z.string(), books: z.array(z.number().int()) })),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    collections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Evocative collection name, 2–6 words, title case." },
          blurb: { type: "string", description: "One short line (under 14 words) on what ties these books together." },
          books: { type: "array", items: { type: "integer" }, description: "Numbers of the books in this collection." },
        },
        required: ["name", "blurb", "books"],
        additionalProperties: false,
      },
    },
  },
  required: ["collections"],
  additionalProperties: false,
};

const SYSTEM = `You curate a reader's personal library into collections, the way a streaming service groups titles into rows with irresistible names.

Names should be evocative and specific to these particular books — moods, themes, settings, forms, eras, feelings. Think "Quiet Lives, Long Shadows", "Cities at 3 A.M.", "Families, Unravelling", "Small Books, Huge Feelings", "The Sea Will Have Its Way". Never plain genre labels like "Fiction", "Classics" or "Non-fiction". Vary the kinds of names; avoid clichés and repeating words across names.

Rules:
- Use only the numbered books given. Refer to them by number.
- Each collection holds at least 3 books. A book may appear in up to 3 collections.
- Cover as many books as possible; it's fine to leave a few out rather than force a bad fit.
- Order collections from most to least compelling. Within each, order books from best to weakest fit.
- Make between 3 and 12 collections, scaled to the library size.`;

export async function POST(req: Request) {
  let body: { books?: Entry[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const books = (body.books ?? []).slice(0, 500);
  if (books.length < 4) return Response.json({ error: "Add a few more books first." }, { status: 400 });

  const list = books
    .map((b, i) => `${i + 1}. ${b.title} — ${b.author || "unknown"}${b.rating ? ` (rated ${b.rating}/5)` : ""}`)
    .join("\n");

  try {
    const { collections } = await structured({
      system: SYSTEM,
      schema: Schema,
      jsonSchema: JSON_SCHEMA,
      content: `My library:\n\n${list}\n\nOrganise it into collections.`,
    });
    // Map numbers back to ids, dropping anything out of range and tiny groups.
    const out = collections
      .map((c) => ({
        name: c.name.trim(),
        blurb: c.blurb.trim(),
        bookIds: [...new Set(c.books)].filter((n) => n >= 1 && n <= books.length).map((n) => books[n - 1].id),
      }))
      .filter((c) => c.name && c.bookIds.length >= 2);
    return Response.json({ collections: out });
  } catch (err) {
    return errorResponse(err);
  }
}

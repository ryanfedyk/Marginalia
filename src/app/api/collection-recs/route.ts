import { z } from "zod";
import { errorResponse, structured } from "@/lib/ai";

export const maxDuration = 120;

const Schema = z.object({
  books: z.array(z.object({ title: z.string(), author: z.string(), why: z.string() })),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    books: {
      type: "array",
      description: "8 real, published books.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          author: { type: "string" },
          why: { type: "string", description: "One sentence on why it belongs in this collection." },
        },
        required: ["title", "author", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["books"],
  additionalProperties: false,
};

const SYSTEM = `You are a well-read bookseller extending one of a reader's personal collections.
Given the collection's name, its description and the books already in it, recommend books that would sit naturally beside them — the same mood, theme or sensibility the collection is about, not just the same genre.
- Real, published books only. At most one per author, and avoid authors already in the collection unless it's an obvious companion.
- Mix a couple of well-known choices with less obvious ones.
- Never recommend anything the reader already owns.
- If their favourite books are listed, let them gently steer the picks.`;

interface Body {
  name?: string;
  blurb?: string;
  books?: string[];
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
  if (!body.name || !body.books?.length) return Response.json({ error: "Missing collection." }, { status: 400 });

  const lines = [
    `Collection: “${body.name}”${body.blurb ? ` — ${body.blurb}` : ""}`,
    `Books in it: ${body.books.slice(0, 40).join("; ")}.`,
  ];
  if (body.favourites?.length) lines.push(`Books they rated highly: ${body.favourites.slice(0, 15).join("; ")}.`);
  if (body.owned?.length) lines.push(`Already on their shelf (do not recommend): ${body.owned.slice(0, 400).join("; ")}.`);
  lines.push("Recommend 8 books for this collection.");

  try {
    const { books } = await structured({ system: SYSTEM, schema: Schema, jsonSchema: JSON_SCHEMA, content: lines.join("\n") });
    const owned = new Set((body.owned ?? []).map((t) => t.toLowerCase().split(" — ")[0]));
    return Response.json({ books: books.filter((b) => !owned.has(b.title.toLowerCase())).slice(0, 8) });
  } catch (err) {
    return errorResponse(err);
  }
}

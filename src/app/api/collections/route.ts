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
- EVERY book must appear in at least one collection, and may appear in up to 3. Placing every book matters more than perfect fit: if a book is hard to place, put it where it fits best, or make a broader collection that can hold it.
- Make roomy collections: roughly {target} collections, each holding about {size} books (never fewer than 4).
- Order collections from most to least compelling. Within each, order books from best to weakest fit.`;

const ASSIGN_SYSTEM = `You are finishing the organisation of a reader's library into named collections.
Some books were left out. Place each leftover book into one or more of the existing collections where it fits.
If several leftovers belong together but fit nowhere, you may create up to 3 new collections for them, with names in the same evocative style as the existing ones (never plain genre labels).
Use only the numbers given. Every leftover book should end up somewhere.`;

const AssignSchema = z.object({
  assignments: z.array(z.object({ book: z.number().int(), collections: z.array(z.number().int()) })),
  newCollections: z.array(z.object({ name: z.string(), blurb: z.string(), books: z.array(z.number().int()) })),
});

const ASSIGN_JSON_SCHEMA = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          book: { type: "integer", description: "A leftover book's number." },
          collections: { type: "array", items: { type: "integer" }, description: "Numbers (C1, C2… → 1, 2…) of existing collections it joins." },
        },
        required: ["book", "collections"],
        additionalProperties: false,
      },
    },
    newCollections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          blurb: { type: "string" },
          books: { type: "array", items: { type: "integer" } },
        },
        required: ["name", "blurb", "books"],
        additionalProperties: false,
      },
    },
  },
  required: ["assignments", "newCollections"],
  additionalProperties: false,
};

/** About 8–14 books per collection, so a 100-book library gets ~8–10 roomy rows. */
function sizing(n: number) {
  const size = n <= 20 ? 5 : n <= 60 ? 8 : 12;
  const target = Math.max(3, Math.min(16, Math.round((n * 1.4) / size)));
  return { size, target };
}

export async function POST(req: Request) {
  let body: { books?: Entry[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const books = (body.books ?? []).slice(0, 500);
  if (books.length < 4) return Response.json({ error: "Add a few more books first." }, { status: 400 });

  const line = (b: Entry, i: number) => `${i + 1}. ${b.title} — ${b.author || "unknown"}${b.rating ? ` (rated ${b.rating}/5)` : ""}`;
  const list = books.map(line).join("\n");
  const { size, target } = sizing(books.length);
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= books.length;

  try {
    const { collections } = await structured({
      system: SYSTEM.replace("{target}", String(target)).replace("{size}", String(size)),
      schema: Schema,
      jsonSchema: JSON_SCHEMA,
      content: `My library (${books.length} books):\n\n${list}\n\nOrganise all of it into collections.`,
    });
    const groups = collections
      .map((c) => ({ name: c.name.trim(), blurb: c.blurb.trim(), books: [...new Set(c.books.filter(inRange))] }))
      .filter((c) => c.name && c.books.length >= 2);

    // Second pass: if more than a handful of books were left out, place them.
    const placed = new Set(groups.flatMap((g) => g.books));
    const leftovers = books.map((_, i) => i + 1).filter((n) => !placed.has(n));
    if (groups.length && leftovers.length > Math.max(3, Math.round(books.length * 0.05))) {
      try {
        const existing = groups.map((g, i) => `C${i + 1}. ${g.name} — ${g.blurb}`).join("\n");
        const left = leftovers.map((n) => line(books[n - 1], n - 1)).join("\n");
        const extra = await structured({
          system: ASSIGN_SYSTEM,
          schema: AssignSchema,
          jsonSchema: ASSIGN_JSON_SCHEMA,
          content: `Existing collections:\n${existing}\n\nLeftover books:\n${left}\n\nPlace every leftover book.`,
        });
        const leftSet = new Set(leftovers);
        for (const a of extra.assignments) {
          if (!leftSet.has(a.book)) continue;
          for (const c of a.collections.slice(0, 3)) {
            const g = groups[c - 1];
            if (g && !g.books.includes(a.book)) g.books.push(a.book);
          }
        }
        for (const nc of extra.newCollections.slice(0, 3)) {
          const nb = [...new Set(nc.books.filter((n) => leftSet.has(n)))];
          if (nc.name.trim() && nb.length >= 2) groups.push({ name: nc.name.trim(), blurb: nc.blurb.trim(), books: nb });
        }
      } catch (err) {
        console.warn("Collections second pass failed; keeping the first pass", err);
      }
    }

    const out = groups.map((g) => ({ name: g.name, blurb: g.blurb, bookIds: g.books.map((n) => books[n - 1].id) }));
    return Response.json({ collections: out });
  } catch (err) {
    return errorResponse(err);
  }
}

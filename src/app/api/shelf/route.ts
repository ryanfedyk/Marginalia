import { z } from "zod";
import { errorResponse, structured } from "@/lib/ai";

export const maxDuration = 120;

const ShelfSchema = z.object({
  books: z.array(z.object({ title: z.string(), author: z.string() })),
});

const SHELF_JSON_SCHEMA = {
  type: "object",
  properties: {
    books: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "The book's title as printed, in title case." },
          author: {
            type: "string",
            description: "Author's full name; empty string if not legible or inferable.",
          },
        },
        required: ["title", "author"],
        additionalProperties: false,
      },
    },
  },
  required: ["books"],
  additionalProperties: false,
};

const SYSTEM = `You catalogue personal libraries from photographs of bookshelves.

Read every book spine (and any covers facing outward) in the image, left to right, top shelf to bottom.
For each book you can identify, return its title and author.

- Spines are often rotated 90°; read them in either direction.
- Use your knowledge of published books to complete a partially legible title or to supply the author when only the title is printed — but only when you are confident it is the same book.
- Skip anything you cannot identify with reasonable confidence rather than guessing. Skip non-book objects, magazines, and box sets you cannot itemise.
- Do not include series numbers, publisher names, or edition notes in the title.
- List each physical book once.`;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export async function POST(req: Request) {
  let body: { image?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const mediaType = ALLOWED.find((t) => t === body.mediaType);
  if (!body.image || !mediaType) {
    return Response.json({ error: "Send a JPEG, PNG, WebP or GIF image." }, { status: 400 });
  }

  try {
    const result = await structured({
      system: SYSTEM,
      schema: ShelfSchema,
      jsonSchema: SHELF_JSON_SCHEMA,
      content: [
        { inlineData: { mimeType: mediaType, data: body.image } },
        { text: "Catalogue the books on this shelf." },
      ],
    });
    // De-duplicate case-insensitively.
    const seen = new Set<string>();
    const books = result.books
      .map((b) => ({ title: b.title.trim(), author: b.author.trim() }))
      .filter((b) => {
        const key = `${b.title.toLowerCase()}|${b.author.toLowerCase()}`;
        if (!b.title || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return Response.json({ books });
  } catch (err) {
    return errorResponse(err);
  }
}

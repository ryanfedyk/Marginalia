import { lookupIsbn } from "@/lib/metadata";
import { toIsbn13 } from "@/lib/isbn";

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("isbn") ?? "";
  const isbn = toIsbn13(raw);
  if (!isbn) return Response.json({ error: "That doesn’t look like a valid ISBN." }, { status: 400 });
  const book = await lookupIsbn(isbn);
  if (!book) return Response.json({ error: `No record found for ISBN ${isbn}.` }, { status: 404 });
  return Response.json({ book });
}

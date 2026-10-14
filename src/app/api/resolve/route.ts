import { resolveTitle } from "@/lib/metadata";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const title = params.get("title")?.trim();
  const author = params.get("author")?.trim() || undefined;
  if (!title) return Response.json({ error: "Missing title." }, { status: 400 });
  const book = await resolveTitle(title, author);
  // No match is a normal outcome (e.g. an obscure recommendation), so it isn't an error.
  return Response.json({ book: book ?? null });
}

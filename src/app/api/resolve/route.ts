import { resolveTitle } from "@/lib/metadata";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const title = params.get("title")?.trim();
  const author = params.get("author")?.trim() || undefined;
  if (!title) return Response.json({ error: "Missing title." }, { status: 400 });
  const book = await resolveTitle(title, author);
  if (!book) return Response.json({ error: "No match found." }, { status: 404 });
  return Response.json({ book });
}

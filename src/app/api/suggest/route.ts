import { suggestBooks } from "@/lib/metadata";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const suggestions = await suggestBooks(q.slice(0, 200));
  return Response.json({ suggestions }, { headers: { "Cache-Control": "public, max-age=300" } });
}

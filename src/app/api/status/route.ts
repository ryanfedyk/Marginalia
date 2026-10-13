import { aiConfigured, MODEL } from "@/lib/ai";

export function GET() {
  return Response.json({ ai: aiConfigured(), model: MODEL });
}

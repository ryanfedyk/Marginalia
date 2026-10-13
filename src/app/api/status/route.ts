import { aiConfigured, MODEL } from "@/lib/claude";

export function GET() {
  return Response.json({ ai: aiConfigured(), model: MODEL });
}

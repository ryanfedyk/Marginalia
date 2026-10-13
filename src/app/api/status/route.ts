import { aiConfigured, MODEL } from "@/lib/ai";
import { FIREBASE_CONFIG, parseFirebaseConfig } from "@/lib/firebase-config";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ai: aiConfigured(),
    model: MODEL,
    firebase: parseFirebaseConfig(process.env.FIREBASE_CONFIG) ?? FIREBASE_CONFIG,
  });
}

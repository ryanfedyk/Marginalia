import { aiConfigured, diagnose, MODEL } from "@/lib/ai";
import { FIREBASE_CONFIG, parseFirebaseConfig } from "@/lib/firebase-config";
import { findReception } from "@/lib/wikipedia";

export const dynamic = "force-dynamic";

export const maxDuration = 120;

// The live check calls Gemini, so reuse a recent result rather than letting reloads add up.
let lastCheck: { at: number; body: string } | null = null;

export async function GET(req: Request) {
  // /api/status?check=1 runs a live test of every Gemini model the app may use.
  if (new URL(req.url).searchParams.get("check")) {
    if (!lastCheck || Date.now() - lastCheck.at > 60_000) {
      const [gemini, wiki] = await Promise.all([
        diagnose(),
        findReception("The Midnight Library", "Matt Haig")
          .then((r) => (r ? `ok: found reception for “${r.article}” (${r.text.length} chars)` : "FAILED: no reception found or Wikipedia unreachable"))
          .catch((e) => `FAILED: ${String(e)}`),
      ]);
      lastCheck = {
        at: Date.now(),
        body: JSON.stringify({ checkedAt: new Date().toISOString(), wikipedia: wiki, ...gemini }, null, 2),
      };
    }
    return new Response(lastCheck.body, {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return Response.json({
    ai: aiConfigured(),
    model: MODEL,
    firebase: parseFirebaseConfig(process.env.FIREBASE_CONFIG) ?? FIREBASE_CONFIG,
  });
}

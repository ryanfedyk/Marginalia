import "server-only";
import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import type { z } from "zod";

/** Gemini powers every AI feature. Override the model with GEMINI_MODEL. */
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

export class AIUnavailableError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not configured on the server.");
  }
}

export class AIRefusalError extends Error {}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const key = apiKey();
  if (!key) throw new AIUnavailableError();
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
}

export function aiConfigured(): boolean {
  return Boolean(apiKey());
}

type Content = string | Part[];
const toParts = (c: Content): Part[] => (typeof c === "string" ? [{ text: c }] : c);

/** One-shot request constrained to a JSON schema, validated with zod. */
export async function structured<T>(opts: {
  system: string;
  content: Content;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
}): Promise<T> {
  const res = await getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: toParts(opts.content) }],
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: opts.jsonSchema,
    },
  });
  const text = res.text;
  if (!text) {
    const reason = res.promptFeedback?.blockReason ?? res.candidates?.[0]?.finishReason;
    throw new AIRefusalError(reason ? `Gemini couldn’t answer (${reason}).` : "Gemini returned no answer.");
  }
  return opts.schema.parse(JSON.parse(text));
}

/** Stream plain prose back to the browser as a text/plain body. */
export async function streamText(opts: { system: string; content: Content }): Promise<Response> {
  const stream = await getClient().models.generateContentStream({
    model: MODEL,
    contents: [{ role: "user", parts: toParts(opts.content) }],
    config: { systemInstruction: opts.system },
  });

  const encoder = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let any = false;
      try {
        for await (const chunk of stream) {
          if (cancelled) break;
          const t = chunk.text;
          if (t) {
            any = true;
            controller.enqueue(encoder.encode(t));
          }
        }
        if (!any && !cancelled) controller.enqueue(encoder.encode("_The companion couldn’t help with this one._"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Map errors to friendly JSON responses. */
export function errorResponse(err: unknown): Response {
  if (err instanceof AIUnavailableError) {
    return Response.json(
      { error: "AI features need a Gemini API key. Add GEMINI_API_KEY to your environment." },
      { status: 503 },
    );
  }
  if (err instanceof AIRefusalError) return Response.json({ error: err.message }, { status: 422 });
  if (err instanceof ApiError) {
    if (err.status === 429) return Response.json({ error: "Gemini is busy right now — try again in a moment." }, { status: 429 });
    if (err.status === 400 && /api key/i.test(err.message))
      return Response.json({ error: "The Gemini API key was rejected." }, { status: 502 });
    if (err.status === 401 || err.status === 403)
      return Response.json({ error: "The Gemini API key was rejected." }, { status: 502 });
    return Response.json({ error: `Gemini request failed (${err.status}).` }, { status: 502 });
  }
  console.error(err);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

import "server-only";
import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import type { z } from "zod";

/** Gemini powers every AI feature. Override the model with GEMINI_MODEL. */
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

/**
 * Tried in order when the main model is overloaded or unavailable.
 * Override with GEMINI_FALLBACK_MODELS (comma-separated).
 */
export const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.5-flash,gemini-3.1-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter((m) => m && m !== MODEL);

/** Overloaded / transient: worth retrying, then trying another model. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
/** This model can't serve this request (missing, or doesn't support a feature): try the next one. */
const SKIP_MODEL = new Set([400, 404]);

/** Plan quota used up for this model: retrying won't help, but another model may have its own allowance. */
export function isQuotaError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 429 && /quota|billing/i.test(err.message);
}

/** Key problems are the same on every model, so they're never worth a fallback. */
function isKeyError(err: ApiError): boolean {
  return err.status === 401 || err.status === 403 || /api[ _-]?key/i.test(err.message);
}

/** Google's human-readable reason, without anything that looks like a key. */
export function geminiReason(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  let msg = raw;
  try {
    const start = raw.indexOf("{");
    if (start >= 0) msg = JSON.parse(raw.slice(start))?.error?.message ?? raw;
  } catch {
    /* not JSON */
  }
  return msg.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]").replace(/\s+/g, " ").trim().slice(0, 220);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a Gemini call with retries and model fallback, so a busy model doesn't surface as an error.
 * Each model gets a few attempts with backoff on transient errors; then the next model is tried.
 */
export async function withFallback<T>(
  call: (model: string) => Promise<T>,
  opts: { models?: string[]; attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const models = opts.models ?? [MODEL, ...FALLBACK_MODELS];
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 700;
  let lastErr: unknown;
  for (const model of models) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await call(model);
      } catch (err) {
        lastErr = err;
        const status = err instanceof ApiError ? err.status : undefined;
        if (err instanceof ApiError && isKeyError(err)) throw err;
        console.warn(`Gemini ${model} failed (${status ?? "error"}): ${geminiReason(err)}`);
        if ((status !== undefined && SKIP_MODEL.has(status)) || isQuotaError(err)) break;
        if (status === undefined || !TRANSIENT.has(status)) throw err;
        if (i < attempts - 1) await sleep(base * 2 ** i + Math.random() * 250);
      }
    }
    console.warn(`Gemini model ${model} unavailable, trying next fallback`);
  }
  throw lastErr;
}

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
  const res = await withFallback((model) =>
    getClient().models.generateContent({
      model,
      contents: [{ role: "user", parts: toParts(opts.content) }],
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema: opts.jsonSchema,
      },
    }),
  );
  const text = res.text;
  if (!text) {
    const reason = res.promptFeedback?.blockReason ?? res.candidates?.[0]?.finishReason;
    throw new AIRefusalError(reason ? `Gemini couldn’t answer (${reason}).` : "Gemini returned no answer.");
  }
  return opts.schema.parse(JSON.parse(text));
}

/**
 * Answer with Google Search grounding and parse a JSON object out of the reply.
 * (Search grounding and JSON-schema mode aren't combined, so the JSON is extracted leniently.)
 */
export async function searchGroundedJson<T>(opts: { system: string; prompt: string }): Promise<T> {
  const res = await withFallback((model) =>
    getClient().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      config: { systemInstruction: opts.system, tools: [{ googleSearch: {} }] },
    }),
  );
  const text = res.text ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {} as T;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return {} as T;
  }
}

/** Stream plain prose back to the browser as a text/plain body. */
export async function streamText(opts: { system: string; content: Content }): Promise<Response> {
  // Retries and fallback apply to opening the stream; once text is flowing we stay on that model.
  const stream = await withFallback((model) =>
    getClient().models.generateContentStream({
      model,
      contents: [{ role: "user", parts: toParts(opts.content) }],
      config: { systemInstruction: opts.system },
    }),
  );

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
    if (isQuotaError(err))
      return Response.json(
        {
          error:
            "Your Gemini key has reached its usage limit. Turn on billing for it in Google AI Studio, or try again later.",
          code: "quota",
        },
        { status: 429 },
      );
    if (TRANSIENT.has(err.status))
      return Response.json(
        { error: "Gemini is very busy right now. Please try again in a minute." },
        { status: err.status === 429 ? 429 : 503 },
      );
    console.error("Gemini error", err.status, geminiReason(err));
    if (isKeyError(err))
      return Response.json({ error: `The Gemini API key was rejected: ${geminiReason(err)}` }, { status: 502 });
    return Response.json({ error: `Gemini couldn’t answer (${err.status}): ${geminiReason(err)}` }, { status: 502 });
  }
  console.error(err);
  return Response.json({ error: `Something went wrong: ${geminiReason(err)}` }, { status: 500 });
}

/** Probe each model with the three kinds of request the app makes. Used by /api/status?check=1. */
export async function diagnose(): Promise<Record<string, unknown>> {
  if (!aiConfigured()) return { key: "missing" };
  const client = getClient();
  const probe = async (fn: () => Promise<{ text?: string }>) => {
    const t = Date.now();
    try {
      const res = await Promise.race([
        fn(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timed out after 45s")), 45000)),
      ]);
      return `ok (${Date.now() - t} ms)${res.text ? "" : " but empty reply"}`;
    } catch (err) {
      return `FAILED ${err instanceof ApiError ? err.status : ""}: ${geminiReason(err)}`;
    }
  };
  const models = [MODEL, ...FALLBACK_MODELS];
  const results = await Promise.all(
    models.map(async (model) => ({
      model,
      text: await probe(() => client.models.generateContent({ model, contents: "Reply with the word OK." })),
      json: await probe(() =>
        client.models.generateContent({
          model,
          contents: "Return a JSON object with ok set to true.",
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
          },
        }),
      ),
      search: await probe(() =>
        client.models.generateContent({
          model,
          contents: "Who wrote the novel Stoner? One line.",
          config: { tools: [{ googleSearch: {} }] },
        }),
      ),
    })),
  );
  return { key: "configured", primary: MODEL, results };
}

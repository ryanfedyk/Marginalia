import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

/**
 * The brief named claude-3-5-sonnet / claude-3-7-sonnet; both are retired.
 * Claude Sonnet 5.5 is the current Sonnet and is used by default.
 */
export const MODEL = process.env.MARGINALIA_MODEL || "claude-sonnet-5-5";

/** Server-side fallback: if the model declines for policy reasons, the API retries on its recommended substitute. */
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export class AIUnavailableError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not configured on the server.");
  }
}

export class AIRefusalError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) throw new AIUnavailableError();
  client ??= new Anthropic();
  return client;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

type Content = Anthropic.Beta.Messages.BetaContentBlockParam[] | string;

/** One-shot request constrained to a JSON schema, validated with zod. */
export async function structured<T>(opts: {
  system: string;
  content: Content;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<T> {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    output_config: {
      effort: opts.effort ?? "medium",
      format: { type: "json_schema", schema: opts.jsonSchema },
    },
    ...FALLBACK,
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new AIRefusalError("Claude declined this request.");
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return opts.schema.parse(JSON.parse(text));
}

/** Stream plain prose back to the browser as a text/plain body. */
export function streamText(opts: { system: string; content: Content; effort?: "low" | "medium" | "high" }): Response {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    output_config: { effort: opts.effort ?? "medium" },
    ...FALLBACK,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n_The companion couldn’t help with this one._"));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      stream.abort();
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
      { error: "AI features need an Anthropic API key. Add ANTHROPIC_API_KEY to your environment." },
      { status: 503 },
    );
  }
  if (err instanceof AIRefusalError) return Response.json({ error: err.message }, { status: 422 });
  if (err instanceof Anthropic.RateLimitError) {
    return Response.json({ error: "Claude is busy right now — try again in a moment." }, { status: 429 });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return Response.json({ error: "The Anthropic API key was rejected." }, { status: 502 });
  }
  if (err instanceof Anthropic.APIError) {
    return Response.json({ error: `Claude request failed (${err.status ?? "network"}).` }, { status: 502 });
  }
  console.error(err);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

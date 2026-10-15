import { z } from "zod";
import { errorResponse, structured } from "@/lib/ai";

export const maxDuration = 120;

interface Entry {
  title: string;
  author: string;
  rating?: number;
  /** e.g. "added 8 months ago" */
  waiting?: string;
  notes?: string[];
}

const Schema = z.object({ picks: z.array(z.object({ book: z.number().int(), why: z.string() })) });

const JSON_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      description: "The best 3 books to read next, best first.",
      items: {
        type: "object",
        properties: {
          book: { type: "integer", description: "Number of a book from the want-to-read list." },
          why: {
            type: "string",
            description: "One warm sentence (under 30 words) on why now, connecting to what they're reading, recently loved or noted.",
          },
        },
        required: ["book", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
};

const SYSTEM = `You help a reader choose what to read next from books they already own and want to read.
Think like a perceptive friend who knows their shelves:
- Consider what they're reading right now: suggest a natural follow-on, or a welcome change of pace after something heavy or long.
- Lean towards what resembles books they rated highly; away from what resembles books they rated low.
- Their notes reveal what moves them.
- A book that has waited a long time deserves a nudge, if it fits.
Pick only from the numbered want-to-read list. Speak to the reader as "you". Never invent facts about a book you're unsure of.`;

export async function POST(req: Request) {
  let body: { want?: Entry[]; reading?: Entry[]; recent?: Entry[]; favourites?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  const want = (body.want ?? []).slice(0, 200);
  if (want.length < 2) return Response.json({ error: "Add at least two books to Want to read." }, { status: 400 });

  const fmt = (e: Entry) =>
    `${e.title} — ${e.author || "unknown"}${e.rating ? ` (rated ${e.rating}/5)` : ""}${e.waiting ? `, ${e.waiting}` : ""}${
      e.notes?.length ? `\n    their notes: ${e.notes.slice(0, 3).map((n) => n.slice(0, 200)).join(" | ")}` : ""
    }`;
  const parts = [`Want to read:\n${want.map((w, i) => `${i + 1}. ${fmt(w)}`).join("\n")}`];
  if (body.reading?.length) parts.push(`Reading right now:\n${body.reading.map((r) => `- ${fmt(r)}`).join("\n")}`);
  if (body.recent?.length) parts.push(`Recently finished:\n${body.recent.slice(0, 10).map((r) => `- ${fmt(r)}`).join("\n")}`);
  if (body.favourites?.length) parts.push(`All-time favourites: ${body.favourites.slice(0, 15).join("; ")}`);
  parts.push("Which 3 should I read next?");

  try {
    const { picks } = await structured({ system: SYSTEM, schema: Schema, jsonSchema: JSON_SCHEMA, content: parts.join("\n\n") });
    const seen = new Set<number>();
    const out = picks
      .filter((p) => p.book >= 1 && p.book <= want.length && !seen.has(p.book) && seen.add(p.book))
      .slice(0, 3)
      .map((p) => ({ index: p.book - 1, why: p.why.trim() }));
    return Response.json({ picks: out });
  } catch (err) {
    return errorResponse(err);
  }
}

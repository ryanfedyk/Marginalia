import { errorResponse, streamText } from "@/lib/claude";
import type { CompanionMode } from "@/lib/types";

export const maxDuration = 120;

interface CompanionRequest {
  mode: CompanionMode;
  book: { title: string; authors: string[]; publishedDate?: string };
  progress?: string;
  /** Chapter to recap (recap mode). */
  chapter?: string;
  /** Pasted text (untangle mode). */
  passage?: string;
  /** Optional extra question from the reader. */
  question?: string;
}

const SYSTEM = `You are the reading companion inside Marginalia, a quiet personal library app.
You help a reader stay oriented in the book they are reading — like a well-read friend sitting beside them, not a study guide.

Voice: warm, precise, unhurried. Plain prose with short paragraphs. Use a few markdown headings or bullets only when they genuinely help. No preamble, no sign-off.

Spoilers: the reader's current position is given. Never reveal, hint at, or foreshadow anything that happens after it — no "this will matter later", no character fates, no twists. If a question cannot be answered without spoilers, say so gently.

Honesty: if you do not know this book well enough to recap specific chapters accurately, say so plainly and offer what you can (themes, context, the general premise) rather than inventing plot details.`;

function buildPrompt(r: CompanionRequest): string | null {
  const author = r.book.authors.join(", ") || "unknown author";
  const book = `“${r.book.title}” by ${author}${r.book.publishedDate ? ` (${r.book.publishedDate})` : ""}`;
  const where = r.progress?.trim() ? `I am currently at: ${r.progress.trim()}.` : "I haven't said where I am in the book.";
  const extra = r.question?.trim() ? `\n\nAlso: ${r.question.trim()}` : "";

  switch (r.mode) {
    case "catchup":
      return `I'm reading ${book}. ${where}
I've been away from it for a while. Catch me up: who the key people are so far, what has happened up to my position, and what threads are open as I pick it back up. Keep it to what I need to resume reading comfortably.${extra}`;
    case "recap":
      if (!r.chapter?.trim()) return null;
      return `I'm reading ${book}. ${where}
Give me a recap of ${r.chapter.trim()}: what happens, what shifts, and anything easy to miss on a first read.${extra}`;
    case "untangle":
      if (!r.passage?.trim()) return null;
      return `I'm reading ${book}. ${where}
This passage is dense and I want to understand it. Untangle it: say plainly what it means, unpack difficult sentences, allusions or vocabulary, and explain why it matters at this point in the book.

<passage>
${r.passage.trim().slice(0, 12000)}
</passage>${extra}`;
    default:
      return null;
  }
}

export async function POST(req: Request) {
  let body: CompanionRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (!body?.book?.title) return Response.json({ error: "Missing book." }, { status: 400 });
  const prompt = buildPrompt(body);
  if (!prompt) return Response.json({ error: "Missing chapter or passage." }, { status: 400 });

  try {
    return streamText({ system: SYSTEM, content: prompt, effort: "medium" });
  } catch (err) {
    return errorResponse(err);
  }
}

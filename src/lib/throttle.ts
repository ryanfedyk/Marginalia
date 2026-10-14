/**
 * A small "traffic light" for Gemini: at most `rpm` requests start in any rolling minute,
 * and after Google says "too many requests" everything pauses for as long as Google asks.
 * Callers wait their turn instead of failing. (Per server instance; Cloud Run runs one.)
 */
export class RateLimitedError extends Error {
  constructor() {
    super("Too many Gemini requests are waiting. Please try again in a minute.");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Throttle {
  private starts: number[] = [];
  /** Per-model pauses: each Gemini model has its own allowance. */
  private pauseUntil = new Map<string, number>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private rpm: number,
    private now: () => number = Date.now,
    private wait: (ms: number) => Promise<unknown> = sleep,
  ) {}

  /** Wait for a slot. Rejects with RateLimitedError if it would take longer than `maxWaitMs`. */
  acquire(model = "*", maxWaitMs = 75_000): Promise<void> {
    const turn = this.queue.then(async () => {
      const deadline = this.now() + maxWaitMs;
      for (;;) {
        const t = this.now();
        while (this.starts.length && t - this.starts[0] >= 60_000) this.starts.shift();
        const forPause = Math.max(this.pauseUntil.get(model) ?? 0, this.pauseUntil.get("*") ?? 0) - t;
        const forWindow = this.starts.length >= this.rpm ? 60_000 - (t - this.starts[0]) + 50 : 0;
        const delay = Math.max(0, forPause, forWindow);
        if (delay === 0) {
          this.starts.push(t);
          return;
        }
        if (t + delay > deadline) throw new RateLimitedError();
        await this.wait(delay);
      }
    });
    // Keep the line moving even if this caller gives up.
    this.queue = turn.catch(() => {});
    return turn;
  }

  /** Google said slow down for this model: hold its requests back for `ms`. */
  pause(model: string, ms: number) {
    this.pauseUntil.set(model, Math.max(this.pauseUntil.get(model) ?? 0, this.now() + ms));
  }
}

/** Google's 429s usually say "Please retry in 23.4s"; fall back to 20s. */
export function retryDelayMs(message: string): number {
  const m = /retry in ([\d.]+)\s*s/i.exec(message) ?? /"retryDelay":\s*"([\d.]+)s"/.exec(message);
  const s = m ? Number(m[1]) : 20;
  return Math.min(60_000, Math.max(2_000, Math.ceil(s * 1000) + 500));
}

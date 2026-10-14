import { describe, expect, it } from "vitest";
import { RateLimitedError, Throttle, retryDelayMs } from "./throttle";

function fakeClock() {
  let t = 0;
  return { now: () => t, wait: async (ms: number) => void (t += ms), get t() { return t; } };
}

describe("Throttle", () => {
  it("lets `rpm` requests through, then makes the next wait for the window", async () => {
    const c = fakeClock();
    const th = new Throttle(3, c.now, c.wait);
    for (let i = 0; i < 3; i++) await th.acquire();
    expect(c.t).toBe(0);
    await th.acquire();
    expect(c.t).toBeGreaterThanOrEqual(60_000);
  });

  it("holds everyone back after a pause", async () => {
    const c = fakeClock();
    const th = new Throttle(10, c.now, c.wait);
    th.pause("a", 20_000);
    await th.acquire("b"); // other models aren't held up
    expect(c.t).toBe(0);
    await th.acquire("a");
    expect(c.t).toBe(20_000);
  });

  it("gives up with RateLimitedError rather than waiting forever", async () => {
    const c = fakeClock();
    const th = new Throttle(1, c.now, c.wait);
    await th.acquire();
    await expect(th.acquire("*", 5_000)).rejects.toBeInstanceOf(RateLimitedError);
    // the queue keeps working afterwards
    await th.acquire("*", 120_000);
  });
});

describe("retryDelayMs", () => {
  it("reads Google's suggested delay", () => {
    expect(retryDelayMs("Quota exceeded. Please retry in 23.4s.")).toBe(23_900);
    expect(retryDelayMs("no hint")).toBe(20_500);
  });
});

import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { geminiReason, withFallback as realWithFallback } from "./ai";
import { Throttle } from "./throttle";

// Tests get their own instant, unlimited traffic light.
const withFallback: typeof realWithFallback = (call, opts = {}) =>
  realWithFallback(call, { ...opts, limiter: fakeLimiter() });

function fakeLimiter() {
  let t = 0;
  return new Throttle(1000, () => t, async (ms) => void (t += ms));
}

const apiErr = (status: number) => new ApiError({ message: `status ${status}`, status });

describe("withFallback", () => {
  it("retries a transient 503 on the same model", async () => {
    const call = vi.fn().mockRejectedValueOnce(apiErr(503)).mockResolvedValueOnce("ok");
    await expect(withFallback(call, { models: ["a", "b"], baseDelayMs: 1 })).resolves.toBe("ok");
    expect(call.mock.calls.map((c) => c[0])).toEqual(["a", "a"]);
  });

  it("moves to the next model when one stays overloaded", async () => {
    const call = vi.fn(async (m: string) => {
      if (m === "a") throw apiErr(503);
      return `from ${m}`;
    });
    await expect(withFallback(call, { models: ["a", "b"], attempts: 3, baseDelayMs: 1 })).resolves.toBe("from b");
    expect(call.mock.calls.map((c) => c[0])).toEqual(["a", "a", "a", "b"]);
  });

  it("doesn't hammer a model whose quota is used up; moves on immediately", async () => {
    const call = vi.fn(async (m: string) => {
      if (m === "a") throw new ApiError({ message: "You exceeded your current quota, please check your plan and billing details.", status: 429 });
      return m;
    });
    await expect(withFallback(call, { models: ["a", "b"], baseDelayMs: 1 })).resolves.toBe("b");
    expect(call.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("skips a model that doesn't exist (404) without retrying it", async () => {
    const call = vi.fn(async (m: string) => {
      if (m === "a") throw apiErr(404);
      return m;
    });
    await expect(withFallback(call, { models: ["a", "b"], baseDelayMs: 1 })).resolves.toBe("b");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("never retries or falls back on a key problem", async () => {
    const call = vi.fn().mockRejectedValue(new ApiError({ message: "API key not valid. Please pass a valid API key.", status: 400 }));
    await expect(withFallback(call, { models: ["a", "b"], baseDelayMs: 1 })).rejects.toThrow("API key not valid");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("tries the next model when one rejects a request (400) it can't serve", async () => {
    const call = vi.fn(async (m: string) => {
      if (m === "a") throw apiErr(400);
      return m;
    });
    await expect(withFallback(call, { models: ["a", "b"], baseDelayMs: 1 })).resolves.toBe("b");
    expect(call.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("extracts Google's reason and hides anything key-like", () => {
    const err = new ApiError({
      message: '{"error":{"code":400,"message":"Tool use with a response mime type is unsupported for key AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","status":"INVALID_ARGUMENT"}}',
      status: 400,
    });
    expect(geminiReason(err)).toBe("Tool use with a response mime type is unsupported for key [key]");
  });

  it("gives up with the last error when every model is down", async () => {
    const call = vi.fn().mockRejectedValue(apiErr(503));
    await expect(withFallback(call, { models: ["a", "b"], attempts: 2, baseDelayMs: 1 })).rejects.toThrow("status 503");
    expect(call).toHaveBeenCalledTimes(4);
  });
});

import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { withFallback } from "./ai";

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

  it("skips a model that doesn't exist (404) without retrying it", async () => {
    const call = vi.fn(async (m: string) => {
      if (m === "a") throw apiErr(404);
      return m;
    });
    await expect(withFallback(call, { models: ["a", "b"], baseDelayMs: 1 })).resolves.toBe("b");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient errors like a bad key", async () => {
    const call = vi.fn().mockRejectedValue(apiErr(400));
    await expect(withFallback(call, { models: ["a", "b"], baseDelayMs: 1 })).rejects.toThrow("status 400");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("gives up with the last error when every model is down", async () => {
    const call = vi.fn().mockRejectedValue(apiErr(503));
    await expect(withFallback(call, { models: ["a", "b"], attempts: 2, baseDelayMs: 1 })).rejects.toThrow("status 503");
    expect(call).toHaveBeenCalledTimes(4);
  });
});

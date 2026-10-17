import { describe, expect, it } from "vitest";
import { seasonFor } from "./season";

describe("seasonFor", () => {
  it("uses northern seasons by default", () => {
    expect(seasonFor(new Date(2026, 9, 17), "America/New_York")).toBe("autumn");
    expect(seasonFor(new Date(2026, 0, 5), "Europe/London")).toBe("winter");
    expect(seasonFor(new Date(2026, 6, 1))).toBe("summer");
  });
  it("flips them south of the equator", () => {
    expect(seasonFor(new Date(2026, 9, 17), "Australia/Sydney")).toBe("spring");
    expect(seasonFor(new Date(2026, 0, 5), "America/Argentina/Buenos_Aires")).toBe("summer");
  });
});

import { describe, expect, it } from "vitest";
import { isBookBarcode, toIsbn13 } from "./isbn";

describe("isbn", () => {
  it("accepts a valid ISBN-13", () => {
    expect(toIsbn13("978-0-679-72875-7")).toBe("9780679728757");
  });
  it("converts ISBN-10", () => {
    expect(toIsbn13("0-679-72875-X")).toBeNull(); // bad checksum
    expect(toIsbn13("0679728759")).toBe("9780679728757");
  });
  it("rejects non-book EAN-13", () => {
    expect(isBookBarcode("4006381333931")).toBe(false);
    expect(isBookBarcode("9780679728757")).toBe(true);
  });
});

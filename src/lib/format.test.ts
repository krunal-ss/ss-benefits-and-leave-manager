import { describe, it, expect } from "vitest";
import { formatINR } from "./format";

describe("formatINR", () => {
  it("formats with the ₹ symbol and en-IN grouping", () => {
    expect(formatINR(15000)).toBe("₹15,000");
    expect(formatINR(284500)).toBe("₹2,84,500");
    expect(formatINR(0)).toBe("₹0");
  });
});

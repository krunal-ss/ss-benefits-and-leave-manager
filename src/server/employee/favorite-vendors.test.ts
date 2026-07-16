// KAN-207 hardening — recordVendorUsage is the single write choke point for
// favorite vendors, so it must defend the stored length itself (backstop for
// the finalize schemas' .max()). Same "mock @/db, capture the write" pattern as
// fy-end-reminder-job.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let insertedValues: { userId: string; vendorName: string; vendorKey: string; usageCount: number } | undefined;
let insertCalled = false;

function insertChain() {
  return {
    values: (v: typeof insertedValues) => {
      insertCalled = true;
      insertedValues = v;
      return { onConflictDoUpdate: () => Promise.resolve() };
    },
  };
}
vi.mock("@/db", () => ({ getDb: () => ({ insert: () => insertChain() }) }));

import { recordVendorUsage, MAX_VENDOR_NAME_LENGTH } from "./favorite-vendors";

beforeEach(() => {
  insertedValues = undefined;
  insertCalled = false;
});

describe("recordVendorUsage", () => {
  it("stores a normal vendor name trimmed, with a lower-cased key", async () => {
    await recordVendorUsage("u1", "  Cult.fit  ");
    expect(insertedValues).toEqual({ userId: "u1", vendorName: "Cult.fit", vendorKey: "cult.fit", usageCount: 1 });
  });

  it("truncates an over-long vendor name to the cap before persisting", async () => {
    const longName = "A".repeat(MAX_VENDOR_NAME_LENGTH + 50);
    await recordVendorUsage("u1", longName);

    expect(insertedValues?.vendorName).toHaveLength(MAX_VENDOR_NAME_LENGTH);
    expect(insertedValues?.vendorKey).toHaveLength(MAX_VENDOR_NAME_LENGTH);
    expect(insertedValues?.vendorName).toBe("A".repeat(MAX_VENDOR_NAME_LENGTH));
  });

  it("trims before measuring, so surrounding whitespace never counts toward the cap", async () => {
    const name = "B".repeat(MAX_VENDOR_NAME_LENGTH);
    await recordVendorUsage("u1", `   ${name}   `);
    expect(insertedValues?.vendorName).toBe(name);
    expect(insertedValues?.vendorName).toHaveLength(MAX_VENDOR_NAME_LENGTH);
  });

  it("short-circuits without a DB write on an empty/whitespace-only name", async () => {
    await recordVendorUsage("u1", "   ");
    expect(insertCalled).toBe(false);
  });
});

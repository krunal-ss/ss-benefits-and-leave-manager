import { describe, it, expect } from "vitest";
import { resolveSignupRole, SIGNUP_ROLES } from "./users";

describe("resolveSignupRole", () => {
  it("accepts every self-selectable signup role", () => {
    for (const role of SIGNUP_ROLES) {
      expect(resolveSignupRole(role)).toBe(role);
    }
  });

  it("never lets a privileged role through (no self-escalation)", () => {
    expect(resolveSignupRole("hr_head")).toBe("employee");
    expect(resolveSignupRole("admin")).toBe("employee");
  });

  it("falls back to employee for missing or garbage values", () => {
    expect(resolveSignupRole(undefined)).toBe("employee");
    expect(resolveSignupRole(null)).toBe("employee");
    expect(resolveSignupRole("")).toBe("employee");
    expect(resolveSignupRole("superuser")).toBe("employee");
  });

  it("excludes the privileged roles from the selectable set", () => {
    expect(SIGNUP_ROLES).not.toContain("hr_head");
    expect(SIGNUP_ROLES).not.toContain("admin");
  });
});

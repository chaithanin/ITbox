import { describe, it, expect } from "vitest";
import {
  computePriority, addSlaMinutes, canTransition, DEFAULT_BUSINESS_HOURS,
} from "@/lib/services/support";

describe("priority engine", () => {
  it("maps impact to base priority", () => {
    expect(computePriority("UNUSABLE", {})).toBe("P1");
    expect(computePriority("MAJOR", {})).toBe("P2");
    expect(computePriority("PARTIAL", {})).toBe("P3");
    expect(computePriority("GENERAL", {})).toBe("P4");
    expect(computePriority(null, {})).toBe("P3");
  });

  it("escalates security/network categories one level", () => {
    expect(computePriority("MAJOR", { categoryName: "Security" })).toBe("P1");
    expect(computePriority("PARTIAL", { categoryName: "Network" })).toBe("P2");
    expect(computePriority("GENERAL", { categoryName: "Phishing" })).toBe("P3");
  });

  it("honors an explicit category default priority", () => {
    expect(computePriority("GENERAL", { categoryName: "Security", categoryDefault: "P1" })).toBe("P1");
  });
});

describe("SLA due-date calculation", () => {
  it("24/7 adds wall-clock minutes", () => {
    const from = new Date("2026-08-13T10:00:00Z");
    const due = addSlaMinutes(from, 60, false, DEFAULT_BUSINESS_HOURS, new Set());
    expect(due.getTime()).toBe(from.getTime() + 3_600_000);
  });

  it("business-hours mode stays within the working window", () => {
    // Friday 17:00 local (10:00Z, tz+420) + 4h business → should land next Monday morning
    const friday = new Date("2026-08-14T10:00:00Z"); // 17:00 Bangkok, near end of day (17:30)
    const due = addSlaMinutes(friday, 4 * 60, true, DEFAULT_BUSINESS_HOURS, new Set());
    // Must be strictly later than a naive +4h (which would fall on the weekend)
    expect(due.getTime()).toBeGreaterThan(friday.getTime() + 4 * 3_600_000);
  });

  it("skips holidays in business-hours mode", () => {
    const from = new Date("2026-08-13T02:00:00Z"); // 09:00 Bangkok Thu
    const holiday = new Set(["2026-08-13"]);
    const due = addSlaMinutes(from, 60, true, DEFAULT_BUSINESS_HOURS, holiday);
    // Same-day is a holiday → work starts next business day, so >24h later
    expect(due.getTime()).toBeGreaterThan(from.getTime() + 20 * 3_600_000);
  });
});

describe("workflow transition guard", () => {
  it("allows valid transitions", () => {
    expect(canTransition("NEW", "TRIAGE")).toBe(true);
    expect(canTransition("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(canTransition("RESOLVED", "CLOSED")).toBe(true);
    expect(canTransition("WAITING_USER", "IN_PROGRESS")).toBe(true);
  });
  it("rejects invalid transitions", () => {
    expect(canTransition("NEW", "CLOSED")).toBe(false);
    expect(canTransition("CLOSED", "IN_PROGRESS")).toBe(false);
    expect(canTransition("CANCELLED", "IN_PROGRESS")).toBe(false);
  });
});

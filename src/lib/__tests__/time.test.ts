import { describe, expect, it } from "vitest";
import { hmToMin, isoWeekday, minToHm, nextBusinessDay, isoWeekKey } from "../time";

describe("time helpers", () => {
  it("round-trips HH:mm", () => {
    expect(hmToMin("08:15")).toBe(495);
    expect(minToHm(495)).toBe("08:15");
    expect(minToHm(-10)).toBe("23:50");
  });
  it("computes ISO weekdays", () => {
    expect(isoWeekday("2026-09-14")).toBe(1);
    expect(isoWeekday("2026-09-20")).toBe(7);
  });
  it("skips weekends and non-working days", () => {
    expect(nextBusinessDay("2026-09-18", new Set())).toBe("2026-09-21");
    expect(nextBusinessDay("2026-09-18", new Set(["2026-09-21"]))).toBe("2026-09-22");
  });
  it("labels ISO weeks", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
  });
});

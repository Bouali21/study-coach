import { describe, expect, it } from "vitest";
import { dueAfter, nextBox, reviewXp } from "./schedule";
import { planItems } from "./planDays";

describe("spaced review", () => {
  const now = new Date("2026-03-01T10:00:00Z");
  it("moves a known card up a box with a longer wait", () => {
    expect(nextBox(1, true)).toBe(2);
    expect(dueAfter(2, true, now)).toBe("2026-03-02 10:00:00");
    expect(dueAfter(3, true, now)).toBe("2026-03-04 10:00:00");
    expect(nextBox(5, true)).toBe(5);
  });
  it("sends a missed card back to box 1, due now", () => {
    expect(nextBox(4, false)).toBe(1);
    expect(dueAfter(1, false, now)).toBe("2026-03-01 10:00:00");
  });
  it("gives XP for each card", () => {
    expect(reviewXp(2, 1)).toBe(11);
  });
});

describe("study plan", () => {
  it("spreads topics over the days before the exam", () => {
    const items = planItems("2026-03-01", "2026-03-04", ["A", "B", "C"]);
    expect(items).toHaveLength(9);
    expect(new Set(items.map((i) => i.date))).toEqual(
      new Set(["2026-03-01", "2026-03-02", "2026-03-03"]),
    );
    expect(items.filter((i) => i.date === "2026-03-02").map((i) => i.topic)).toEqual(["B", "B", "B"]);
  });
  it("puts several topics on a day when time is short", () => {
    const items = planItems("2026-03-01", "2026-03-02", ["A", "B"]);
    expect(items).toHaveLength(6);
    expect(items.every((i) => i.date === "2026-03-01")).toBe(true);
  });
  it("repeats topics when there are more days", () => {
    const items = planItems("2026-03-01", "2026-03-05", ["A"]);
    expect(items).toHaveLength(12);
  });
});

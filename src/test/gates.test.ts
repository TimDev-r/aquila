import { describe, expect, it } from "vitest";

import { ALL_LESSONS } from "@/content/unit0";
import { allLessonsComplete, isPathLocked } from "@/lib/gates";

const ALL_IDS = ALL_LESSONS.map((l) => l.id);

describe("lesson gate", () => {
  it("locks trade, replay and vision when no lessons are complete", () => {
    expect(isPathLocked("/trade", [])).toBe(true);
    expect(isPathLocked("/replay", [])).toBe(true);
    expect(isPathLocked("/vision", [])).toBe(true);
  });

  it("keeps gated tabs locked when only some lessons are complete", () => {
    const partial = ALL_IDS.slice(0, ALL_IDS.length - 1);
    expect(isPathLocked("/trade", partial)).toBe(true);
  });

  it("unlocks gated tabs once every lesson is complete (as unlock-all does)", () => {
    expect(allLessonsComplete(ALL_IDS)).toBe(true);
    expect(isPathLocked("/trade", ALL_IDS)).toBe(false);
    expect(isPathLocked("/replay", ALL_IDS)).toBe(false);
    expect(isPathLocked("/vision", ALL_IDS)).toBe(false);
  });

  it("never locks learn, practice or coach", () => {
    expect(isPathLocked("/", [])).toBe(false);
    expect(isPathLocked("/practice", [])).toBe(false);
    expect(isPathLocked("/coach", [])).toBe(false);
  });
});

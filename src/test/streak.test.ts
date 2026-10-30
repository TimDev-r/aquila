import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bumpStreak, MAX_HEARTS, type ProgressState } from "@/lib/progress";
import { createAccount } from "@/lib/trading/engine";

function state(overrides: Partial<ProgressState>): ProgressState {
  return {
    xp: 0,
    streakDays: 0,
    lastActiveDate: null,
    hearts: MAX_HEARTS,
    completedLessonIds: [],
    account: createAccount(),
    muted: false,
    ...overrides,
  };
}

describe("streak counting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("starts the streak at 1 when the first lesson is completed", () => {
    const s = bumpStreak(state({}));
    expect(s.streakDays).toBe(1);
    expect(s.lastActiveDate).toBe("2026-10-30");
  });

  it("extends the streak when yesterday was the last active day", () => {
    const s = bumpStreak(state({ streakDays: 4, lastActiveDate: "2026-10-29" }));
    expect(s.streakDays).toBe(5);
  });

  it("does not count the same day twice", () => {
    const s = bumpStreak(state({ streakDays: 4, lastActiveDate: "2026-10-30" }));
    expect(s.streakDays).toBe(4);
  });

  it("resets to 1 after a gap of more than one day", () => {
    const s = bumpStreak(state({ streakDays: 9, lastActiveDate: "2026-10-27" }));
    expect(s.streakDays).toBe(1);
  });
});

import { ALL_LESSONS } from "@/content/unit0";

/** Tabs that stay locked until every lesson (Unit 0 + Unit 1) is complete. */
export const GATED_PATHS = ["/trade", "/replay", "/vision"] as const;

export function allLessonsComplete(completedLessonIds: string[]): boolean {
  return ALL_LESSONS.every((l) => completedLessonIds.includes(l.id));
}

export function isPathLocked(pathname: string, completedLessonIds: string[]): boolean {
  if (allLessonsComplete(completedLessonIds)) return false;
  return GATED_PATHS.some((p) => pathname.startsWith(p));
}

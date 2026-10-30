import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Account } from "./contracts";
import { createAccount } from "./trading/engine";

const KEY = "aquila-progress-v1";
export const MAX_HEARTS = 5;

export type ProgressState = {
  xp: number;
  streakDays: number;
  lastActiveDate: string | null;
  hearts: number;
  completedLessonIds: string[];
  account: Account;
  muted: boolean;
};

type Ctx = ProgressState & {
  addXp: (n: number) => void;
  loseHeart: () => void;
  completeLesson: (id: string) => void;
  setAccount: (a: Account) => void;
  setMuted: (m: boolean) => void;
  resetAll: () => void;
  refillHearts: () => void;
  unlockLessons: (ids: string[]) => void;
};

const today = () => new Date().toISOString().slice(0, 10);

function initial(): ProgressState {
  return { xp: 0, streakDays: 0, lastActiveDate: null, hearts: MAX_HEARTS, completedLessonIds: [], account: createAccount(), muted: false };
}

function load(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    return { ...initial(), ...(JSON.parse(raw) as Partial<ProgressState>) };
  } catch {
    return initial();
  }
}

/** Refill hearts and update streak when the day changes. */
function touchDay(s: ProgressState): ProgressState {
  const t = today();
  if (s.lastActiveDate === t) return s;
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return { ...s, hearts: MAX_HEARTS, streakDays: s.lastActiveDate === y ? s.streakDays + 1 : 1, lastActiveDate: t };
}

const ProgressContext = createContext<Ctx | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProgressState>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setState(touchDay(load()));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state, loaded]);

  const addXp = useCallback((n: number) => setState((s) => ({ ...touchDay(s), xp: s.xp + n })), []);
  const loseHeart = useCallback(() => setState((s) => ({ ...s, hearts: Math.max(0, s.hearts - 1) })), []);
  const completeLesson = useCallback(
    (id: string) => setState((s) => (s.completedLessonIds.includes(id) ? s : { ...s, completedLessonIds: [...s.completedLessonIds, id] })),
    [],
  );
  const setAccount = useCallback((account: Account) => setState((s) => ({ ...s, account })), []);
  const setMuted = useCallback((muted: boolean) => setState((s) => ({ ...s, muted })), []);
  const resetAll = useCallback(() => setState(touchDay({ ...initial(), lastActiveDate: null })), []);

  const refillHearts = useCallback(() => setState((s) => ({ ...s, hearts: MAX_HEARTS })), []);
  const unlockLessons = useCallback(
    (ids: string[]) => setState((s) => ({ ...s, completedLessonIds: Array.from(new Set([...s.completedLessonIds, ...ids])) })),
    [],
  );

  const value = useMemo(
    () => ({ ...state, addXp, loseHeart, completeLesson, setAccount, setMuted, resetAll, refillHearts, unlockLessons }),
    [state, addXp, loseHeart, completeLesson, setAccount, setMuted, resetAll, refillHearts, unlockLessons],
  );
  return createElement(ProgressContext.Provider, { value }, children);
}

export function useProgress(): Ctx {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used inside ProgressProvider");
  return ctx;
}

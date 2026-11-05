// Pure phase-sequence logic for the Pomodoro and interval timers.
export interface Phase {
  label: string;
  kind: 'work' | 'rest';
  ms: number;
}
export interface PomodoroConfig { focusMin: number; shortMin: number; longMin: number; rounds: number }
export interface IntervalConfig { workSec: number; restSec: number; rounds: number }

export const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : min;

/** Focus, short break, ... and a long break after the last focus (4 rounds: F S F S F S F L). */
export function pomodoroPlan(c: PomodoroConfig): Phase[] {
  const focus = clamp(c.focusMin, 1, 180) * 60_000;
  const short = clamp(c.shortMin, 1, 60) * 60_000;
  const long = clamp(c.longMin, 1, 120) * 60_000;
  const rounds = clamp(c.rounds, 1, 12);
  const plan: Phase[] = [];
  for (let i = 1; i <= rounds; i++) {
    plan.push({ label: 'Focus', kind: 'work', ms: focus });
    plan.push(i < rounds ? { label: 'Short break', kind: 'rest', ms: short } : { label: 'Long break', kind: 'rest', ms: long });
  }
  return plan;
}

/** Work and rest rounds. Rest sits between rounds only; a rest of 0 is skipped. */
export function intervalPlan(c: IntervalConfig): Phase[] {
  const work = clamp(c.workSec, 1, 3600) * 1000;
  const rest = clamp(c.restSec, 0, 3600) * 1000;
  const rounds = clamp(c.rounds, 1, 99);
  const plan: Phase[] = [];
  for (let i = 1; i <= rounds; i++) {
    plan.push({ label: 'Work', kind: 'work', ms: work });
    if (i < rounds && rest > 0) plan.push({ label: 'Rest', kind: 'rest', ms: rest });
  }
  return plan;
}

export const totalMs = (plan: readonly Phase[]): number => plan.reduce((sum, p) => sum + p.ms, 0);

export const phaseStart = (plan: readonly Phase[], index: number): number =>
  plan.slice(0, Math.max(0, index)).reduce((sum, p) => sum + p.ms, 0);

export const roundsTotal = (plan: readonly Phase[]): number => plan.filter((p) => p.kind === 'work').length;

/** 1-based round number that phase `index` belongs to. */
export const roundOf = (plan: readonly Phase[], index: number): number =>
  Math.max(1, plan.slice(0, index + 1).filter((p) => p.kind === 'work').length);

export interface Position {
  index: number;
  phase: Phase;
  remainingMs: number;
  /** Completed trips through the plan when looping. */
  cycle: number;
  done: boolean;
}

/** Where `elapsedMs` of running time falls in the plan. A phase boundary belongs to the next phase. */
export function positionAt(plan: readonly Phase[], elapsedMs: number, loop: boolean): Position | null {
  const total = totalMs(plan);
  const last = plan[plan.length - 1];
  if (total <= 0 || !last) return null;
  const e = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  if (!loop && e >= total) return { index: plan.length - 1, phase: last, remainingMs: 0, cycle: 0, done: true };
  const cycle = loop ? Math.floor(e / total) : 0;
  const within = e - cycle * total;
  let start = 0;
  for (let i = 0; i < plan.length; i++) {
    const phase = plan[i];
    if (!phase) break;
    const end = start + phase.ms;
    if (within < end) return { index: i, phase, remainingMs: end - within, cycle, done: false };
    start = end;
  }
  return { index: plan.length - 1, phase: last, remainingMs: 0, cycle, done: !loop };
}

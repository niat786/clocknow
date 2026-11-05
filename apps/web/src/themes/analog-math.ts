// Analog hand angles. Pure, no DOM.
/** Hand angles in degrees clockwise from 12. */
export function handAngles(h: number, m: number, s: number): { hour: number; minute: number; second: number } {
  return { hour: ((h % 12) + m / 60 + s / 3600) * 30, minute: (m + s / 60) * 6, second: s * 6 };
}

/** Next angle that is ≥ the previous one and equal to `target` mod 360, so hands never spin backwards. */
export function forward(prev: number, target: number): number {
  return prev + (((target - prev) % 360) + 360) % 360;
}

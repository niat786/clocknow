// Geometry for the sun-path chart: maps (time of day, altitude) into a 300×120 box. Pure.
export const W = 300;
export const H = 120;
const TOP = 90;
const BOTTOM = -30;

export const xOf = (fractionOfDay: number): number => Math.max(0, Math.min(1, fractionOfDay)) * W;
export const yOf = (altitude: number): number => {
  const a = Math.max(BOTTOM, Math.min(TOP, altitude));
  return 8 + ((TOP - a) / (TOP - BOTTOM)) * (H - 16);
};
export const HORIZON_Y = yOf(0);

export function pathOf(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([f, alt], i) => `${i ? 'L' : 'M'}${xOf(f).toFixed(1)} ${yOf(alt).toFixed(1)}`).join(' ');
}

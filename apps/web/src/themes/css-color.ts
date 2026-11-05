// Resolves any CSS colour (oklch(), color-mix(), named…) to sRGB 0..1 using a 1×1 canvas.
export function cssColor(value: string, fallback: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx || !value.trim()) return fallback;
  ctx.fillStyle = '#000';
  ctx.fillStyle = value.trim();
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

export const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

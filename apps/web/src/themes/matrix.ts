// Dot-matrix face drawn on a canvas with a 5×7 font: round lit dots with a soft glow, faint unlit dots.
// Redraws once per second and on resize. AM/PM is drawn in dots too.
import type { Face, FaceFrame } from './face';
import { layout } from './matrix-font';

const PAD = 0.6; // margin around the grid, in cells

export function create(): Face {
  const root = document.createElement('div');
  root.className = 'mx';
  const canvas = document.createElement('canvas');
  root.append(canvas);
  let grid: boolean[][] = layout('00 : 00');
  let text = '';

  const draw = (): void => {
    const ctx = canvas.getContext('2d');
    const cols = grid[0]?.length ?? 1;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round((w * (7 + PAD * 2)) / (cols + PAD * 2)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const color = getComputedStyle(canvas).color;
    const cell = w / (cols + PAD * 2);
    const o = cell * PAD; // room for the outer dots and their glow
    const r = cell * 0.4;
    // A glow around lit dots, unless the person asked for less transparency or high contrast.
    const glow = !matchMedia('(prefers-reduced-transparency: reduce)').matches && document.documentElement.dataset.theme !== 'contrast';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.08;
    for (let y = 0; y < 7; y++) for (let x = 0; x < cols; x++) if (!grid[y][x]) dot(ctx, x, y, cell, r, o);
    ctx.globalAlpha = 1;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = cell * 0.7;
    }
    for (let y = 0; y < 7; y++) for (let x = 0; x < cols; x++) if (grid[y][x]) dot(ctx, x, y, cell, r, o);
    ctx.shadowBlur = 0;
  };

  const ro = new ResizeObserver(() => draw());
  const watch = new MutationObserver(() => draw());
  return {
    mount(host) {
      host.append(root);
      ro.observe(canvas);
      watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look', 'data-autolook'] });
    },
    frame(f: FaceFrame) {
      const [h, m] = f.hm.split(':');
      const time = f.showSeconds ? `${h} : ${m} : ${f.ss}` : `${h} : ${m}`;
      const next = f.period ? `${time}  ${f.period.toLowerCase()}` : time;
      if (next === text) return;
      text = next;
      grid = layout(next);
      root.style.setProperty('--mx-ratio', `${grid[0].length + PAD * 2} / ${7 + PAD * 2}`);
      draw();
    },
    destroy() {
      ro.disconnect();
      watch.disconnect();
      root.remove();
    },
  };
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, r: number, o: number): void {
  ctx.beginPath();
  ctx.arc(o + x * cell + cell / 2, o + y * cell + cell / 2, r, 0, Math.PI * 2);
  ctx.fill();
}

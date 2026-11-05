// Dot-matrix face drawn on a canvas with a 5×7 font. Redraws once per second and on resize.
import './matrix.css';
import type { Face, FaceFrame } from './face';
import { layout } from './matrix-font';

export function create(): Face {
  const root = document.createElement('div');
  root.className = 'mx';
  const canvas = document.createElement('canvas');
  const ap = document.createElement('span');
  ap.className = 'mx-ap';
  root.append(canvas, ap);
  let grid: boolean[][] = layout('00:00');
  let text = '';

  const draw = (): void => {
    const ctx = canvas.getContext('2d');
    const cols = grid[0]?.length ?? 1;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round((w * 7) / cols));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(canvas).color;
    const cell = w / cols;
    const r = cell * 0.38;
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.globalAlpha = grid[y][x] ? 1 : 0.08;
        ctx.beginPath();
        ctx.arc(x * cell + cell / 2, y * cell + cell / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  const ro = new ResizeObserver(() => draw());
  const themeWatch = new MutationObserver(() => draw());
  return {
    mount(host) {
      host.append(root);
      ro.observe(canvas);
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    },
    frame(f: FaceFrame) {
      const next = f.showSeconds ? `${f.hm}:${f.ss}` : f.hm;
      ap.textContent = f.period;
      if (next === text) return;
      text = next;
      grid = layout(next);
      root.style.setProperty('--mx-ratio', `${grid[0].length} / 7`);
      draw();
    },
    destroy() {
      ro.disconnect();
      themeWatch.disconnect();
      root.remove();
    },
  };
}

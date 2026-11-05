// Pure helpers for fullscreen mode. The browser-facing part lives in fullscreen.ts.

/** `?fs`, `?fs=1` and `?fs=true` open the page in kiosk layout; `?fs=0` / `?fs=false` do not. */
export function parseFs(search: string): boolean {
  const v = new URLSearchParams(search).get('fs');
  return v !== null && v !== '0' && v.toLowerCase() !== 'false';
}

/** Burn-in protection moves the display at most this many pixels from centre. */
export const SHIFT_PX = 4;

// All nine positions of a 3x3 grid, ordered so consecutive minutes never land on the same spot.
const ORDER: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 1], [-1, 0], [0, -1], [1, -1], [-1, 1], [0, 1], [-1, -1], [1, 0],
];

/** Offset in pixels for a given minute count; cycles every 9 minutes. */
export function pixelShift(minute: number): { x: number; y: number } {
  const i = (((Math.floor(minute) % 9) + 9) % 9) | 0;
  const [x, y] = ORDER[i] ?? [0, 0];
  return { x: x * SHIFT_PX, y: y * SHIFT_PX };
}

/** Fullscreen uses OLED only when the person left the theme on Auto and the system is dark. */
export function shouldAutoOled(savedOrCurrentTheme: string | null, systemDark: boolean): boolean {
  return !savedOrCurrentTheme && systemDark;
}

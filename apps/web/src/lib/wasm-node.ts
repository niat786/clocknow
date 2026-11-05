// Build-time only: loads the time-core Wasm engine inside Node so pages can be rendered from it.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initSync } from 'time-wasm';

let ready = false;

export function initWasmNode(): void {
  if (ready) return;
  const candidates = ['../../packages/time-wasm-pkg', 'packages/time-wasm-pkg'].map((p) => resolve(process.cwd(), p, 'time_wasm_bg.wasm'));
  const file = candidates.find(existsSync);
  if (!file) throw new Error('time_wasm_bg.wasm not found: run `pnpm wasm` first');
  initSync({ module: readFileSync(file) });
  ready = true;
}

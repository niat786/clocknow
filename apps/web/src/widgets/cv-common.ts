// Small DOM helpers shared by the converter widgets. No date maths here.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import type { CivilDate } from '../engine/types';

export const localZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** `<datalist>` of IANA zones the browser knows (plus UTC). Zone names are plain ASCII. */
export function zoneDatalist(id: string): string {
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  const all = zones.includes('UTC') ? zones : ['UTC', ...zones];
  return `<datalist id="${id}">${all.map((z) => `<option value="${z}"></option>`).join('')}</datalist>`;
}

/** Keeps the URL shareable without adding history entries. */
export function setQuery(values: Record<string, string>): void {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) p.set(k, v);
  const q = p.toString();
  try {
    history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}`);
  } catch {
    /* sandboxed contexts may refuse; the page still works */
  }
}

export function showRows(dl: HTMLElement, rows: ReadonlyArray<readonly [string, string]>): void {
  dl.replaceChildren();
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
}

export const field = (f: FormData, name: string): string => String(f.get(name) ?? '').trim();

/** Wires a form: prevents navigation, clears and fills the `[data-error]` line, tells `run` which button was used. */
export function onSubmit(form: HTMLFormElement, run: (act: string) => Promise<void>): void {
  const err = form.querySelector<HTMLElement>('[data-error]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const act = (e as SubmitEvent).submitter?.getAttribute('data-act') ?? '';
    if (err) err.textContent = '';
    run(act).catch((x: unknown) => {
      if (err) err.textContent = errorText(x);
    });
  });
}

export async function today(zone: string): Promise<CivilDate> {
  const z = await engine.zoneTime(now(), zone);
  return { year: z.year, month: z.month, day: z.day };
}

export const input = (root: ParentNode, name: string): HTMLInputElement => {
  const el = root.querySelector<HTMLInputElement>(`[name=${name}]`);
  if (!el) throw new Error(`missing field ${name}`);
  return el;
};

// Search palette: jump to any page or any of 2,000 cities. Native <dialog> gives focus trapping and Escape.
import './cmd-palette.css';
import { rank, type Entry } from '../lib/search-rank';
import { parseQuick } from '../lib/quick-answer';

let dialog: HTMLDialogElement | null = null;
let entries: Entry[] = [];
let citiesLoaded = false;

export function pages(): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const group of document.querySelectorAll('.menu-g')) {
    const hint = group.querySelector('summary')?.textContent?.trim() ?? '';
    for (const a of group.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const href = a.getAttribute('href') ?? '';
      if (seen.has(href)) continue;
      seen.add(href);
      out.push({ title: a.textContent?.trim() ?? href, hint, href, kind: 'page' });
    }
  }
  return out;
}

async function loadCities(): Promise<void> {
  if (citiesLoaded) return;
  citiesLoaded = true;
  try {
    const rows = (await (await fetch('/data/city-index.json')).json()) as Array<[string, string, string]>;
    entries = [...entries, ...rows.map(([slug, label, zone]) => ({ title: label, hint: zone, href: `/time/${slug}`, kind: 'city' as const }))];
  } catch {
    citiesLoaded = false; // try again next time
  }
}

function build(): HTMLDialogElement {
  const d = document.createElement('dialog');
  d.className = 'cmdp';
  d.setAttribute('aria-label', 'Search');
  d.innerHTML =
    '<div class="cmdp-box">' +
    '<input class="cmdp-input" type="text" role="combobox" aria-expanded="true" aria-controls="cmdp-list" aria-autocomplete="list" placeholder="Search, or try “3pm lhr in tokyo”, “w45”, “+30 business days”" autocomplete="off" spellcheck="false" />' +
    '<ul class="cmdp-list" id="cmdp-list" role="listbox" aria-label="Results"></ul>' +
    '<p class="cmdp-foot"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>' +
    '</div>';
  const input = d.querySelector('input') as HTMLInputElement;
  const list = d.querySelector('ul') as HTMLUListElement;
  let active = 0;
  let shown: Entry[] = [];
  let quick: { q: string; entries: Entry[] } = { q: '', entries: [] };

  /** Starts the answer for a quick question (if it is one) and re-renders when it is ready. */
  const ask = (): void => {
    const text = input.value;
    const q = parseQuick(text);
    if (!q) {
      quick = { q: text, entries: [] };
      return;
    }
    if (quick.q === text) return;
    quick = { q: text, entries: [] };
    void (async () => {
      await loadCities();
      const { answer } = await import('./quick-answers');
      const found = await answer(q, entries).catch(() => [] as Entry[]);
      if (input.value !== text) return;
      quick = { q: text, entries: found };
      render();
    })();
  };

  const render = (): void => {
    shown = rank(entries, input.value);
    if (quick.entries.length && quick.q === input.value) shown = [...quick.entries, ...shown].slice(0, 9);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.replaceChildren(...shown.map((e, i) => {
      const li = document.createElement('li');
      li.id = `cmdp-o${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      const a = document.createElement('a');
      a.href = e.href;
      a.tabIndex = -1;
      const t = document.createElement('span');
      t.className = 'cmdp-title';
      t.textContent = e.title;
      const h = document.createElement('span');
      h.className = 'cmdp-hint';
      h.textContent = e.kind === 'city' ? e.hint : e.hint || 'Page';
      a.append(t, h);
      li.append(a);
      li.addEventListener('mousemove', () => { if (active !== i) { active = i; mark(); } });
      return li;
    }));
    if (!shown.length) {
      const li = document.createElement('li');
      li.className = 'cmdp-empty';
      li.textContent = citiesLoaded ? 'No matches' : 'Loading cities…';
      list.append(li);
    }
    mark();
  };
  const mark = (): void => {
    list.querySelectorAll('[role=option]').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    if (shown.length) input.setAttribute('aria-activedescendant', `cmdp-o${active}`);
    else input.removeAttribute('aria-activedescendant');
    list.querySelector(`#cmdp-o${active}`)?.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', () => { active = 0; ask(); render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, shown.length); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + shown.length) % Math.max(1, shown.length); mark(); }
    else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); location.href = shown[active].href; }
    else if (e.key === 'Escape') { e.preventDefault(); d.close(); }
  });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // backdrop click
  d.addEventListener('close', () => document.querySelector<HTMLElement>('[data-search]')?.focus());
  (d as HTMLDialogElement & { rerender?: () => void }).rerender = render;
  document.body.append(d);
  return d;
}

export function open(): void {
  if (!dialog) {
    entries = pages();
    dialog = build();
  }
  const d = dialog as HTMLDialogElement & { rerender?: () => void };
  const input = d.querySelector('input') as HTMLInputElement;
  input.value = '';
  d.rerender?.();
  if (!d.open) d.showModal();
  input.focus();
  void loadCities().then(() => d.rerender?.());
}

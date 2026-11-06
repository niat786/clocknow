// <search-results> — the /search page, used by the browser's address-bar search (cn <query>).
import { rank, type Entry } from '../lib/search-rank';
import { parseQuick } from '../lib/quick-answer';
import { pages } from './cmd-palette';

async function cities(): Promise<Entry[]> {
  try {
    const rows = (await (await fetch('/data/city-index.json')).json()) as Array<[string, string, string]>;
    return rows.map(([slug, label, zone]) => ({ title: label, hint: zone, href: `/time/${slug}`, kind: 'city' as const }));
  } catch {
    return [];
  }
}

class SearchResults extends HTMLElement {
  connectedCallback(): void {
    const input = this.querySelector<HTMLInputElement>('input[name=q]');
    const list = this.querySelector<HTMLUListElement>('[data-results]');
    if (!input || !list) return;
    const q = (new URLSearchParams(location.search).get('q') ?? '').trim().slice(0, 200);
    input.value = q;
    if (!q) return;
    void (async () => {
      const entries = [...pages(), ...(await cities())];
      const quick = parseQuick(q);
      let found: Entry[] = [];
      if (quick) {
        const { answer } = await import('./quick-answers');
        found = await answer(quick, entries).catch(() => [] as Entry[]);
      }
      const shown = [...found, ...rank(entries, q, 10)].slice(0, 12);
      list.replaceChildren(
        ...(shown.length
          ? shown.map((e, i) => {
              const li = document.createElement('li');
              if (i < found.length) li.className = 'is-answer';
              const a = document.createElement('a');
              a.href = e.href;
              const t = document.createElement('span');
              t.textContent = e.title;
              const h = document.createElement('small');
              h.textContent = e.kind === 'city' ? e.hint : e.hint || 'Page';
              a.append(t, h);
              li.append(a);
              return li;
            })
          : [Object.assign(document.createElement('li'), { className: 'sr-empty', textContent: 'No matches. Try a city, a tool, or a question like “3pm lhr in tokyo”.' })]),
      );
    })();
  }
}
if (!customElements.get('search-results')) customElements.define('search-results', SearchResults);

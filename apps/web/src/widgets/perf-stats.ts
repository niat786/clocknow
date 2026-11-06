// <perf-stats> — fills the server-rendered table on /performance with the collector's 7-day p75 numbers.
import { cellText, isSummary } from '../lib/perf-summary';

const API = (import.meta.env.PUBLIC_API_URL as string | undefined) ?? 'http://localhost:8787';

class PerfStats extends HTMLElement {
  async connectedCallback(): Promise<void> {
    const note = this.querySelector('[data-note]');
    try {
      const res = await fetch(`${API}/rum/summary?days=7`);
      const data: unknown = await res.json();
      if (!res.ok || !isSummary(data)) throw new Error('bad summary');
      for (const cell of this.querySelectorAll<HTMLElement>('[data-metric]')) {
        const device = cell.dataset.device as 'phone' | 'desktop';
        const { text, state } = cellText(data.metrics[device]?.[cell.dataset.metric as string]);
        cell.textContent = text;
        cell.dataset.state = state;
      }
      if (note) note.textContent = `Real visits over the last ${data.days} days.`;
    } catch {
      for (const cell of this.querySelectorAll<HTMLElement>('[data-metric]')) cell.textContent = 'Unavailable right now';
      if (note) note.textContent = 'The numbers could not be loaded.';
    }
  }
}
customElements.define('perf-stats', PerfStats);

// <tz-diff zone="Asia/Karachi" name="Karachi"> — "Karachi is 5 hours ahead of you."
// Offsets come from time-core (Wasm worker); the visitor's zone comes from the browser.
import { engine } from '../engine/engine';
import { now } from './clock-source';
import { describeDiff } from '../lib/city-facts';

class TzDiff extends HTMLElement {
  connectedCallback(): void {
    const zone = this.getAttribute('zone');
    if (!zone) return;
    const name = this.getAttribute('name') ?? zone;
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const run = async (): Promise<void> => {
      try {
        const diff = await engine.offsetDifference(now(), local, zone);
        this.textContent = `${name} ${describeDiff(diff)} (your time zone: ${local}).`;
      } catch {
        this.textContent = '';
      }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(() => void run(), { timeout: 2000 });
    else setTimeout(() => void run(), 300);
  }
}

if (!customElements.get('tz-diff')) customElements.define('tz-diff', TzDiff);

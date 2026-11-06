// <device-offset> — "Your device clock is 1.42 s fast · Verified ±4 ms against UTC", from the same
// sync the clocks use. The raw device clock is compared with the corrected one; nothing is faked.
import { now, getStatus, subscribe, startSync } from './clock-source';
import { formatError } from './clock-format';
import { describeDevice } from '../lib/device-offset';

class DeviceOffset extends HTMLElement {
  #unsub: (() => void) | null = null;
  #line!: HTMLElement;

  connectedCallback(): void {
    this.#line = this.querySelector<HTMLElement>('[data-line]') ?? this.appendChild(document.createElement('p'));
    this.#line.dataset.line = '';
    this.#unsub = subscribe(() => this.#update());
    startSync();
    this.#update();
  }

  disconnectedCallback(): void {
    this.#unsub?.();
  }

  #update(): void {
    const s = getStatus();
    const est = s.estimate;
    let text: string;
    if (!est || est.state === 'Offline') {
      text = s.phase === 'failed' ? 'Offline: your device clock cannot be compared with UTC right now.' : 'Checking your device clock…';
    } else {
      const ahead = performance.timeOrigin + performance.now() - now();
      text = `${describeDevice(ahead)} · ${est.state === 'Locked' ? 'Verified' : 'Last verified'} ${formatError(est.error_ms)} against UTC`;
    }
    if (this.#line.textContent !== text) this.#line.textContent = text;
  }
}

if (!customElements.get('device-offset')) customElements.define('device-offset', DeviceOffset);

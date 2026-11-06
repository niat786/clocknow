// Real-user performance beacon: loaded when the browser is idle, sends small reports as a page view ends.
// A report carries a route group, a device class and up to five numbers; each metric is sent once.
// Visitors who send Do Not Track or Global Privacy Control are not measured.
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import { beaconBody, deviceClass, optedOut, routeGroup, type Name } from '../lib/vitals-payload';

const API = (import.meta.env.PUBLIC_API_URL as string | undefined) ?? 'http://localhost:8787';

function start(): void {
  if (import.meta.env.DEV || optedOut(navigator as Navigator & { globalPrivacyControl?: boolean })) return;
  const pending: Partial<Record<Name, number>> = {};
  let queued = false;

  const flush = (): void => {
    queued = false;
    const body = beaconBody(routeGroup(location.pathname), deviceClass(innerWidth), pending);
    if (!body) return;
    for (const k of Object.keys(pending)) delete pending[k as Name];
    // text/plain keeps this a "simple" request: no CORS preflight, and it survives the page closing.
    navigator.sendBeacon(`${API}/rum`, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
  };

  // web-vitals settles final values when the page is hidden, and reports them a moment later, possibly
  // while the page is already unloading. So: once hidden, send each report as it arrives (batched in
  // one microtask); while visible, only collect.
  const note = (m: { name: Name; value: number }): void => {
    pending[m.name] = m.value;
    if (document.visibilityState === 'hidden' && !queued) {
      queued = true;
      queueMicrotask(flush);
    }
  };
  // Values already collected go out as the page is hidden; later ones go out as they arrive (see `note`).
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  addEventListener('pagehide', flush);
  onLCP(note);
  onCLS(note);
  onINP(note);
  onFCP(note);
  onTTFB(note);
}

start();

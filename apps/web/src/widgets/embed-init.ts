// Applies embed options from the URL before the clock starts: theme, transparent background,
// zone, label, seconds, 12-hour and face. Import it before the clock widget.
import { parseClockEmbed } from '../lib/embed-params';

const o = parseClockEmbed(location.search);
const root = document.documentElement;
if (o.theme === 'auto') delete root.dataset.theme;
else root.dataset.theme = o.theme;
root.toggleAttribute('data-transparent', o.transparent);

const clock = document.querySelector('tz-clock');
if (clock) {
  if (o.zone) clock.setAttribute('zone', o.zone);
  clock.toggleAttribute('hour12', o.h12);
  clock.toggleAttribute('no-seconds', !o.seconds);
  clock.toggleAttribute('faces', o.face !== 'digital');
}
const label = document.querySelector('[data-label]');
if (label) {
  const fallback = o.zone ? (o.zone.split('/').pop() ?? o.zone).replace(/_/g, ' ') : '';
  label.textContent = o.label || fallback;
}

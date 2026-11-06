const { chromium } = require('playwright');
const ITEMS = [
  ['/timer', 'tm-timer'], ['/stopwatch', 'tm-stopwatch'], ['/pomodoro', 'tm-interval[mode="pomodoro"]'], ['/interval-timer', 'tm-interval[mode="interval"]'],
  ['/countdown', 'tm-countdown:not([embed])'], ['/atomic', 'atomic-clock'], ['/atomic', 'verify-time'],
  ['/unix-timestamp', 'cv-unix'], ['/time-zone-converter', 'cv-zones'], ['/date-difference', 'cv-diff'], ['/business-days', 'cv-business'],
  ['/meeting-planner', 'meeting-planner'], ['/sun/london', 'sun-day'], ['/moon', 'moon-now'], ['/widgets', 'embed-builder'],
  ['/print/calendar/2026', 'print-controls:not([no-start])'], ['/print/world-clock', 'print-controls[no-start]'], ['/print/world-clock', 'print-world'], ['/print/world-clock', '[data-world-out]'],
  ['/', 'overlap-strip'], ['/', '.instr sun-arc'], ['/', 'epoch-card'], ['/', 'mini-stopwatch'], ['/time/karachi', '.city-cols sun-arc'],
];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const widths = [360, 768, 1440];
  const res = {};
  for (const w of widths) {
    const c = await b.newContext({ viewport: { width: w, height: 900 }, timezoneId: 'Asia/Karachi' });
    const p = await c.newPage();
    let last = '';
    for (const [path, sel] of ITEMS) {
      if (path !== last) { await p.goto('http://127.0.0.1:4321' + path); await p.waitForTimeout(3500); last = path; }
      const h = await p.evaluate((s) => { const el = document.querySelector(s); return el ? Math.ceil(el.getBoundingClientRect().height) : -1; }, sel);
      (res[sel] ??= {})[w] = h;
    }
    await c.close();
  }
  console.log(JSON.stringify(res));
  await b.close();
})();

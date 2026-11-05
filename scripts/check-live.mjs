#!/usr/bin/env node
// Checks that the edge and origin servers agree on the time, as seen from this machine.
// Usage: node scripts/check-live.mjs [edgeUrl] [originUrl]
const edge = process.argv[2] ?? 'https://clocknow.net/v1/now';
const origin = process.argv[3] ?? 'https://api.clocknow.net/v1/now';
const local = () => performance.timeOrigin + performance.now();

async function best(url, n = 8) {
  let top = null;
  for (let i = 0; i < n; i++) {
    const t0 = local();
    const res = await fetch(url, { cache: 'no-store' });
    const t3 = local();
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const b = await res.json();
    const s = { offset: (b.t1 - t0 + (b.t2 - t3)) / 2, delay: t3 - t0 - (b.t2 - b.t1), server: b.server_id };
    if (!top || s.delay < top.delay) top = s;
  }
  return top;
}

const [e, o] = [await best(edge), await best(origin)];
for (const [name, s] of [['edge', e], ['origin', o]])
  console.log(`${name.padEnd(6)} ${s.server.padEnd(16)} round trip ${s.delay.toFixed(1).padStart(6)} ms  error ±${(s.delay / 2).toFixed(1)} ms`);
const diff = Math.abs(e.offset - o.offset);
const bound = e.delay / 2 + o.delay / 2 + 2; // +2 ms for whole-millisecond edge timestamps
console.log(`edge vs origin: ${diff.toFixed(1)} ms apart (allowed ${bound.toFixed(1)} ms)`);
if (diff > bound) {
  console.error('check-live: servers disagree by more than the measurement can explain');
  process.exit(1);
}
console.log('check-live: OK');

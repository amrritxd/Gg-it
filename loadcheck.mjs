// Small load check for YOUR OWN site. Only runs against ALLOWED_HOST.
const MAX_REQUESTS = 100;   // hard cap
const CONCURRENCY = 5;      // hard cap per batch

const rawUrl = process.env.TARGET_URL || '';
const allowedHost = (process.env.ALLOWED_HOST || '').trim().toLowerCase();
let total = parseInt(process.env.REQUESTS || '100', 10);

if (!rawUrl || !allowedHost) {
  console.error('TARGET_URL and ALLOWED_HOST are required');
  process.exit(1);
}

let url;
try { url = new URL(rawUrl); } catch { console.error('Invalid TARGET_URL'); process.exit(1); }

if (url.hostname.toLowerCase() !== allowedHost) {
  console.error(`Blocked: ${url.hostname} is not ALLOWED_HOST (${allowedHost})`);
  process.exit(1);
}

if (isNaN(total) || total < 1) total = 1;
if (total > MAX_REQUESTS) total = MAX_REQUESTS;

const times = [];
let ok = 0, failed = 0;
const codes = {};

async function hit() {
  const t0 = performance.now();
  try {
    const res = await fetch(url.href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'own-site-loadcheck' },
    });
    await res.arrayBuffer();
    const ms = performance.now() - t0;
    times.push(ms);
    codes[res.status] = (codes[res.status] || 0) + 1;
    if (res.ok) ok++; else failed++;
  } catch {
    failed++;
    codes.error = (codes.error || 0) + 1;
  }
}

let done = 0;
while (done < total) {
  const batch = Math.min(CONCURRENCY, total - done);
  await Promise.all(Array.from({ length: batch }, hit));
  done += batch;
}

times.sort((a, b) => a - b);
const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
const p95 = times.length ? times[Math.floor(times.length * 0.95) - 1] ?? times[times.length - 1] : 0;
const max = times.length ? times[times.length - 1] : 0;

console.log(`Target: ${url.href}`);
console.log(`Requests: ${total} (concurrency ${CONCURRENCY})`);
console.log(`OK: ${ok}  Failed: ${failed}`);
console.log(`Status codes: ${JSON.stringify(codes)}`);
console.log(`Avg: ${avg.toFixed(0)} ms  p95: ${p95.toFixed(0)} ms  Slowest: ${max.toFixed(0)} ms`);

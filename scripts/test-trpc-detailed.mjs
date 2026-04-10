import { setTimeout as wait } from 'timers/promises';

const BASE = 'https://foodie-finder.sassyconsultingllc.com';
const BATCH_ENDPOINTS = [
  `${BASE}/api/trpc`,
  `${BASE}/api/trpc/`,
];

const PATH_ENDPOINTS = [
  `${BASE}/api/trpc/restaurant.search`,
  `${BASE}/api/trpc/restaurant.search/`,
];

const input = { postalCode: '53703', radius: 5, limit: 5 };
const batchBody = JSON.stringify([
  {
    id: 1,
    jsonrpc: '2.0',
    method: 'query',
    params: { path: 'restaurant.search', input },
  },
]);

async function fetchWithTimeout(url, opts = {}, timeout = 60000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function run() {
  console.log('Starting detailed tRPC tests');

  for (const url of BATCH_ENDPOINTS) {
    console.log('\n--- POST batch ->', url);
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: batchBody,
      }, 60000);

      console.log('Status:', res.status, res.statusText);
      const text = await res.text();
      console.log('Body:', text.slice(0, 5000));
    } catch (err) {
      console.error('POST error:', err && err.message ? err.message : err);
    }
    await wait(500);
  }

  for (const url of PATH_ENDPOINTS) {
    const u = url + '?input=' + encodeURIComponent(JSON.stringify(input));
    console.log('\n--- GET path ->', u);
    try {
      const res = await fetchWithTimeout(u, {
        method: 'GET',
        headers: { 'trpc-accept': 'application/trpc+json' },
      }, 60000);

      console.log('Status:', res.status, res.statusText);
      const text = await res.text();
      console.log('Body:', text.slice(0, 5000));
    } catch (err) {
      console.error('GET error:', err && err.message ? err.message : err);
    }
    await wait(500);
  }

  console.log('\nDetailed tRPC tests complete');
}

run().catch((e) => {
  console.error('Unhandled error', e);
  process.exit(1);
});

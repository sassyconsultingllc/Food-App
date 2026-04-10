const PREVIEW = 'https://foodie-finder-api-preview.sassyconsultingllc.workers.dev';
const batchUrl = PREVIEW + '/api/trpc';
const pathUrl = PREVIEW + '/api/trpc/restaurant.search';
const debugUrl = PREVIEW + '/api/debug/inspect';

const input = { postalCode: '53703', radius: 5, limit: 5 };
const batchBody = JSON.stringify([
  {
    id: 1,
    jsonrpc: '2.0',
    method: 'query',
    params: { path: 'restaurant.search', input },
  },
]);

async function run() {
  console.log('POSTing batch to', batchUrl);
  try {
    const r = await fetch(batchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'trpc-accept': 'application/trpc+json' }, body: batchBody });
    console.log('POST status', r.status);
    const txt = await r.text();
    console.log('POST body:', txt.slice(0, 2000));
    console.log('POST debug-raw-url:', r.headers.get('x-debug-raw-url'));
    console.log('POST debug-raw-body-b64:', r.headers.get('x-debug-raw-body-b64') ? r.headers.get('x-debug-raw-body-b64').slice(0,200) + '...' : null);
  } catch (e) {
    console.error('POST error', e && e.message ? e.message : e);
  }

  console.log('GET path with input to', pathUrl);
  try {
    const url = pathUrl + '?input=' + encodeURIComponent(JSON.stringify(input));
    const r2 = await fetch(url, { method: 'GET', headers: { 'trpc-accept': 'application/trpc+json' } });
    console.log('GET status', r2.status);
    const txt2 = await r2.text();
    console.log('GET body:', txt2.slice(0, 2000));
    console.log('GET debug-raw-url:', r2.headers.get('x-debug-raw-url'));
    console.log('GET debug-raw-body-b64:', r2.headers.get('x-debug-raw-body-b64') ? r2.headers.get('x-debug-raw-body-b64').slice(0,200) + '...' : null);
  } catch (e) {
    console.error('GET error', e && e.message ? e.message : e);
  }

  console.log('Fetching debug inspect...');
  try {
    const rd = await fetch(debugUrl);
    const jd = await rd.json();
    console.log('Debug inspect:', JSON.stringify(jd, null, 2).slice(0, 8000));
  } catch (e) {
    console.error('Debug fetch error', e && e.message ? e.message : e);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });

// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-FFDZVVRFBUEE
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

async function run() {
  const client = createTRPCProxyClient({
    links: [
      httpBatchLink({
        url: 'https://foodie-finder.sassyconsultingllc.com/api/trpc',
        fetch, // use global fetch
        transformer: superjson,
      }),
    ],
  });

  try {
    const res = await client.restaurant.search.query({ postalCode: '53703', radius: 5, limit: 5 });
    console.log('RESULT:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('ERROR:', err);
  }
}

run();

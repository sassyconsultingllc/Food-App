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

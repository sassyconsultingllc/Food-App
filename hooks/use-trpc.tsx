/**
 * tRPC Hook
 * © 2025 Sassy Consulting - A Veteran Owned Company
 * 
 * Re-exports the tRPC client from lib and provides a React provider
 */

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc as trpcClient, createTRPCClient } from '@/lib/trpc';

// Re-export the tRPC client
export const trpc = trpcClient;

/**
 * TRPCProvider wraps the app with tRPC + React Query providers
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 2,
        refetchOnWindowFocus: false,
      },
    },
  }));
  
  const [trpcClientInstance] = useState(() => createTRPCClient());

  return (
    <trpcClient.Provider client={trpcClientInstance} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpcClient.Provider>
  );
}

export default trpc;

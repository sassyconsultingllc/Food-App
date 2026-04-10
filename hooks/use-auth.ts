// moved to .old/hooks/use-auth.ts — archived
// Restore from .old/hooks/use-auth.ts if needed
export function useAuth() {
  return { user: null, loading: false, error: null, isAuthenticated: false, refresh: async () => {}, logout: async () => {} } as const;
}
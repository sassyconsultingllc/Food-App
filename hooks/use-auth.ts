// Copyright (c) 2026 Shane Smith / Sassy Consulting LLC. All rights reserved.
// Proprietary source. This notice is Copyright Management Information (17 U.S.C. 1202); removal or alteration prohibited.
// CodeMark: SCLLC1-foodie_finder_v8-INZXAH5SOYWR
// moved to .old/hooks/use-auth.ts — archived
// Restore from .old/hooks/use-auth.ts if needed
export function useAuth() {
  return { user: null, loading: false, error: null, isAuthenticated: false, refresh: async () => {}, logout: async () => {} } as const;
}
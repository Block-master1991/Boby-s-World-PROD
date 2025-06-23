
'use client';

// This hook now simply consumes the AuthContext.
// The actual logic and state management are in AuthContext.tsx.

import { useAuthContext, type AuthContextType } from '@/contexts/AuthContext';

export interface AuthHook extends AuthContextType {} // Keep the interface for consistency if used elsewhere

export function useAuth(): AuthHook {
  return useAuthContext();
}


'use client';

// This hook now simply consumes the AuthContext.
// The actual logic and state management are in AuthContext.tsx.

import { useAuthContext, type AuthContextType } from '@/contexts/AuthContext';

export function useAuth(): AuthContextType {
  return useAuthContext();
}

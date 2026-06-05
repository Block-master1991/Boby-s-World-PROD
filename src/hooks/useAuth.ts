"use client";

// This hook now simply consumes the AuthContext.
// The actual logic and state management are in AuthContext.tsx.

import { useAuthContext } from "@/contexts/AuthContext";
import type { AuthContextType } from "@/types/auth";

export function useAuth(): AuthContextType {
  return useAuthContext();
}

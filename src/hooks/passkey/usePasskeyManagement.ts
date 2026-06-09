"use client";

import { useAuthContext } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { usePasskeyActions } from "./usePasskeyActions";
import { usePasskeyFetch } from "./usePasskeyFetch";
import { usePasskeyState } from "./usePasskeyState";

export type { Passkey } from "./usePasskeyState";

export const usePasskeyManagement = (onPasskeyRegistered?: () => void) => {
  const { isAuthenticated } = useAuthContext();
  const state = usePasskeyState();
  const fetchPasskeys = usePasskeyFetch(isAuthenticated, state);
  const actions = usePasskeyActions(state, fetchPasskeys, onPasskeyRegistered);

  useEffect(() => {
    if (isAuthenticated) fetchPasskeys();
  }, [isAuthenticated, fetchPasskeys]);

  return {
    ...state,
    ...actions,
    fetchPasskeys,
    isAuthenticated,
  };
};

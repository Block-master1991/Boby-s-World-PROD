import { useAuth } from "@/hooks/useAuth";
import { ADMIN_WALLET_ADDRESS } from "@/lib/constants";
import { GAME_QUERIES } from "@/lib/graphql-client";
import { useApiFetch } from "@/utils/api";
import { logger } from "@/utils/logger";
import { useCallback, useEffect, useState } from "react";
import type {
  ActivityUpdate,
  AddCoinsResponse,
  FetchPlayerDataResponse,
  UserInventory,
  UserStats,
} from "./types";
import { useBaseGraphQL } from "./useBaseGraphQL";

const QUERIES = {
  USER_STATS: `query GetUserStats { userStats { totalUsers onlineUsers offlineUsers activeGames } }`,
  FETCH_PLAYER: `query FetchPlayerData($userId: ID!) { playerData(userId: $userId) { success playerData { level coins experience lastProcessedBatchId inventory { id itemType name quantity rarity image } } error } }`,
  ADD_COINS: `mutation AddCoins($userId: ID!, $amount: Int!) { addCoins(userId: $userId, amount: $amount) { success newBalance error } }`,
  ACTIVITY_UPDATES: `query UserActivityUpdates { userActivityUpdates @client { onlineUsers activeGames timestamp } }`,
};

export const useUserData = (userId: string) =>
  useBaseGraphQL(GAME_QUERIES.GET_USER_GAME_DATA, { variables: { userId }, skip: !userId });

export const useUserInventory = (userId: string) =>
  useBaseGraphQL<{ userInventory: UserInventory }>(
    `
    query GetUserInventory($userId: ID!) {
        userInventory(userId: $userId) { protectionBottleCount guardianShieldCount speedyPawsTreatCount coinMagnetTreatCount items { id itemType name quantity rarity image } }
    }
`,
    { variables: { userId }, skip: !userId }
  );

export const useUserStats = (requiredRole: "admin" | "user" = "user") => {
  const { apiFetch } = useApiFetch();
  const { isAuthenticated, user } = useAuth();
  const [state, setState] = useState<{
    data: { userStats: UserStats } | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: false, error: null });

  const isAuthorized = user?.publicKey === ADMIN_WALLET_ADDRESS || requiredRole !== "admin";

  const execute = useCallback(async () => {
    if (!isAuthenticated || !isAuthorized) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await apiFetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: QUERIES.USER_STATS }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      setState({ data: json.data, loading: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (!msg.includes("NetworkError")) logger.error("Error:", msg);
      setState(s => ({ ...s, loading: false, error: msg.includes("NetworkError") ? null : msg }));
    }
  }, [apiFetch, isAuthenticated, isAuthorized]);

  useEffect(() => {
    if (isAuthenticated && isAuthorized) execute();
  }, [execute, isAuthenticated, isAuthorized]);
  return { ...state, execute };
};

export const useFetchPlayerData = () => {
  const { apiFetch } = useApiFetch();
  const [state, setState] = useState<{
    data: { fetchPlayerData: FetchPlayerDataResponse } | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: false, error: null });

  const fetchData = useCallback(
    async (userId: string) => {
      setState(s => ({ ...s, loading: true, error: null }));
      try {
        const res = await apiFetch("/api/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: QUERIES.FETCH_PLAYER, variables: { userId } }),
        });

        if (!res.ok) {
          const text = await res.text();
          logger.error(`[useFetchPlayerData] HTTP Error ${res.status}:`, text.slice(0, 500));
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        if (json.errors) {
          logger.error("[useFetchPlayerData] GraphQL Errors:", json.errors);
          throw new Error(json.errors[0].message);
        }

        setState({ data: json.data, loading: false, error: null });
        return json.data?.playerData;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        logger.error("[useFetchPlayerData] Fetch catch block error:", err);
        setState(s => ({ ...s, loading: false, error: msg }));
        return { success: false, error: msg };
      }
    },
    [apiFetch]
  );

  return { ...state, fetchData };
};

export const useAddCoins = () => {
  const { apiFetch } = useApiFetch();
  const [state, setState] = useState({ loading: false, error: null as string | null });

  const addCoins = useCallback(
    async (userId: string, amount: number): Promise<AddCoinsResponse> => {
      setState({ loading: true, error: null });
      try {
        const res = await apiFetch("/api/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: QUERIES.ADD_COINS, variables: { userId, amount } }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.errors) throw new Error(json.errors[0].message);
        return json.data?.addCoins;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        logger.error("[useAddCoins] Error:", msg);
        setState({ loading: false, error: msg });
        return { success: false, error: msg };
      } finally {
        setState(s => ({ ...s, loading: false }));
      }
    },
    [apiFetch]
  );

  return { ...state, addCoins };
};

export const useUserActivityUpdates = (requiredRole: "admin" | "user" = "user") => {
  const { apiFetch } = useApiFetch();
  const { isAuthenticated, user } = useAuth();
  const [state, setState] = useState<{ data: ActivityUpdate | null; error: string | null }>({
    data: null,
    error: null,
  });

  const isAuthorized = user?.publicKey === ADMIN_WALLET_ADDRESS || requiredRole !== "admin";

  useEffect(() => {
    if (!isAuthenticated || !isAuthorized || !document.cookie.includes("csrfToken")) return;
    let active = true;

    const poll = async () => {
      try {
        const res = await apiFetch("/api/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: QUERIES.ACTIVITY_UPDATES }),
        });
        if (active && res.ok) {
          const json = await res.json();
          if (json.data?.userActivityUpdates)
            setState({ data: json.data.userActivityUpdates, error: null });
        }
      } catch (err) {
        if (active) {
          const msg = err instanceof Error ? err.message : "Activity subscription error";
          if (!msg.includes("NetworkError")) {
            logger.error("Error:", msg);
            setState(s => ({ ...s, error: msg }));
          }
        }
      }
    };

    const id = setInterval(poll, 10000);
    poll();
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [apiFetch, isAuthenticated, isAuthorized]);

  return state;
};

import { logger } from "@/utils/logger";
import { useCallback } from "react";
import type { PurchaseUpgradeResponse, UpgradeItem } from "./types";
import { useBaseGraphQL, useBaseMutation } from "./useBaseGraphQL";

export const useUpgrades = (userId: string) => {
  return useBaseGraphQL<{ upgrades: UpgradeItem[] }>(
    `
        query GetUpgrades($userId: ID!) {
            upgrades(userId: $userId) {
                id
                name
                description
                cost
                level
                maxLevel
                effectValue
                effectType
            }
        }
    `,
    {
      variables: { userId },
      skip: !userId,
    }
  );
};

export const usePurchaseUpgrade = () => {
  const {
    execute: mutate,
    loading,
    error,
  } = useBaseMutation<{ purchaseUpgrade: PurchaseUpgradeResponse }>(`
        mutation PurchaseUpgrade($userId: ID!, $upgradeId: String!) {
            purchaseUpgrade(userId: $userId, upgradeId: $upgradeId) {
                success
                remainingCoins
                newLevel
                error
            }
        }
    `);

  const purchaseUpgrade = useCallback(
    async (userId: string, upgradeId: string) => {
      try {
        const result = await mutate({ userId, upgradeId });
        return result?.purchaseUpgrade;
      } catch (err) {
        logger.error("[usePurchaseUpgrade] Error:", err);
        return { success: false, error: "Failed to purchase upgrade" };
      }
    },
    [mutate]
  );

  return { loading, error, purchaseUpgrade };
};

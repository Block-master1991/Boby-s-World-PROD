import type { CoinData } from "@/hooks/useCoinLogic";
import { logger } from "@/utils/logger";
import { useCallback, useRef } from "react";
import type { EnemyData } from "./types";

interface Props {
  enemyMeshesRef: React.MutableRefObject<EnemyData[]>;
  coinMeshesRef: React.MutableRefObject<CoinData[]>;
  pendingCoins: React.MutableRefObject<Set<string>>;
  onSpawnEnemy: (coin: CoinData, chunkKey: string) => Promise<void>;
}

export const useEnemyReconciliation = ({
  enemyMeshesRef,
  coinMeshesRef,
  pendingCoins,
  onSpawnEnemy,
}: Props) => {
  const reconciliationTimer = useRef(0);
  const spawnAttemptedCoins = useRef(new Set<string>()); // Log attempted spawns to prevent spam
  const RECONCILIATION_INTERVAL = 2.0; // Optimized: Check every 2 seconds instead of 1

  const reconcileEnemies = useCallback(() => {
    const guardedCoinIds = new Set<string>();
    enemyMeshesRef.current.forEach(enemy => {
      if (enemy.targetCoinId) {
        guardedCoinIds.add(enemy.targetCoinId);
      }
    });

    // Find visible coins that lack a guardian, aren't pending, and haven't been attempted recently
    const coinsNeedingGuardians = coinMeshesRef.current.filter(
      coin =>
        !coin.collected &&
        !guardedCoinIds.has(coin.uuid) &&
        !pendingCoins.current.has(coin.uuid) &&
        !spawnAttemptedCoins.current.has(coin.uuid)
    );

    if (coinsNeedingGuardians.length > 0) {
      // Limit spawns to 3 per check to avoid frame spikes
      const BATCH_LIMIT = 3;
      const subset = coinsNeedingGuardians.slice(0, BATCH_LIMIT);

      // Only log if significant backlog
      if (coinsNeedingGuardians.length > 10) {
        logger.log(
          `[useEnemyReconciliation] Found ${coinsNeedingGuardians.length} unguarded coins. Processing ${subset.length}...`
        );
      }

      subset.forEach(coin => {
        const chunkKey = coin.chunkKey ?? "";
        if (chunkKey) {
          spawnAttemptedCoins.current.add(coin.uuid);
          onSpawnEnemy(coin, chunkKey).catch(() => {
            // If spawn fails, allow retry later by removing from attempted set
            spawnAttemptedCoins.current.delete(coin.uuid);
          });

          // Clear form attempted list after 10 seconds to allow retry if something got stuck
          setTimeout(() => {
            if (spawnAttemptedCoins.current.has(coin.uuid)) {
              spawnAttemptedCoins.current.delete(coin.uuid);
            }
          }, 10000);
        }
      });
    }
  }, [enemyMeshesRef, coinMeshesRef, pendingCoins, onSpawnEnemy]);

  const updateReconciliation = useCallback(
    (delta: number) => {
      reconciliationTimer.current += delta;
      if (reconciliationTimer.current >= RECONCILIATION_INTERVAL) {
        reconciliationTimer.current = 0;
        reconcileEnemies();
      }
    },
    [reconcileEnemies]
  );

  return {
    reconcileEnemies,
    updateReconciliation,
  };
};

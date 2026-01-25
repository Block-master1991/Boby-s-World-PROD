import type { CoinData } from '@/hooks/useCoinLogic';
import { logger } from '@/utils/logger';
import { useCallback, useRef } from 'react';
import type { EnemyData } from './types';

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
  const RECONCILIATION_INTERVAL = 1.0; // Run every 1 second

  const reconcileEnemies = useCallback(() => {
    const guardedCoinIds = new Set<string>();
    enemyMeshesRef.current.forEach(enemy => {
      if (enemy.targetCoinId) {
        guardedCoinIds.add(enemy.targetCoinId);
      }
    });

    // Find visible coins that lack a guardian and aren't already pending
    const coinsNeedingGuardians = coinMeshesRef.current.filter(coin =>
      !coin.collected &&
      !guardedCoinIds.has(coin.uuid) &&
      !pendingCoins.current.has(coin.uuid)
    );

    if (coinsNeedingGuardians.length > 0) {
      logger.log(
        `[useEnemyReconciliation] Found ${coinsNeedingGuardians.length} unguarded coins. Spawning enemies...`
      );
      coinsNeedingGuardians.forEach(coin => {
        const chunkKey = coin.chunkKey ?? '';
        if (chunkKey) {
          onSpawnEnemy(coin, chunkKey);
        }
      });
    }
  }, [enemyMeshesRef, coinMeshesRef, pendingCoins, onSpawnEnemy]);

  const updateReconciliation = useCallback((delta: number) => {
    reconciliationTimer.current += delta;
    if (reconciliationTimer.current >= RECONCILIATION_INTERVAL) {
      reconciliationTimer.current = 0;
      reconcileEnemies();
    }
  }, [reconcileEnemies]);

  return {
    reconcileEnemies,
    updateReconciliation,
  };
};

import type { CoinData } from "@/hooks/useCoinLogic";
import { useCallback } from "react";
import type { EnemyData } from "../types";

interface QueueHandlerParams {
  coinMeshesRef: React.MutableRefObject<CoinData[]>;
  enemyMeshesRef: React.MutableRefObject<EnemyData[]>;
  pending: Set<string>;
}

export const createQueueHandler = (params: QueueHandlerParams) => {
  const { coinMeshesRef, enemyMeshesRef, pending } = params;
  const queue: { coin: CoinData; chunk: string }[] = [];

  const queueSpawns = useCallback(
    (near: Set<string>) => {
      coinMeshesRef.current.forEach(c => {
        const k = c.chunkKey ?? "";
        if (
          !c.collected &&
          near.has(k) &&
          !enemyMeshesRef.current.some(e => e.targetCoinId === c.uuid) &&
          !pending.has(c.uuid)
        ) {
          queue.push({ coin: c, chunk: k });
        }
      });
    },
    [coinMeshesRef, enemyMeshesRef, pending]
  );

  const process = useCallback(
    async (spawnFn?: (coin: CoinData, chunk: string) => Promise<void>) => {
      if (queue.length && spawnFn) {
        await Promise.all(queue.splice(0, 3).map(i => spawnFn(i.coin, i.chunk)));
      }
    },
    []
  );

  return {
    queueSpawns,
    process,
  };
};

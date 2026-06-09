import { useToast } from "@/hooks/ui/use-toast";
import { useFetchPlayerData } from "@/hooks/useGraphQL";
import { logger } from "@/utils/logger";
import { useCallback, useState } from "react";

interface InventoryItem {
  id: string;
  quantity: number;
}

const parseIds = (inv: InventoryItem[]) => {
  let [b, s, sp, m] = [0, 0, 0, 0];
  inv.forEach(i => {
    const q = i.quantity || 1;
    if (i.id === "1") b += q;
    else if (i.id === "2") s += q;
    else if (i.id === "3") sp += q;
    else if (i.id === "4") m += q;
  });
  return { b, s, sp, m };
};

export const getBatchTimestamp = (id: string): number => {
  if (!id) return 0;
  const parts = id.split("-");
  const tsStr = parts[parts.length - 1];
  if (!tsStr) return 0;
  const ts = parseInt(tsStr);
  return isNaN(ts) ? 0 : ts;
};

export const useGameData = (props: { sessionPublicKey?: string | undefined }) => {
  const { sessionPublicKey } = props;
  const { toast } = useToast();
  const { fetchData } = useFetchPlayerData();

  const [state, setState] = useState({ usd: 0, b: 0, s: 0, sp: 0, m: 0, lastSyncId: "" });
  const [loading, setLoading] = useState({ fetch: true, store: false, inv: false, wallet: false });

  const fetchPlayerData = useCallback(
    async (loadUi = false) => {
      const key = sessionPublicKey;
      if (!key) {
        setLoading(p => ({ ...p, fetch: false }));
        return;
      }
      if (loadUi) setLoading({ fetch: true, store: true, inv: true, wallet: true });
      else setLoading(p => ({ ...p, fetch: true }));

      try {
        const res = await fetchData(key);
        if (res?.success && res.playerData) {
          const incomingBatchId = res.playerData.lastProcessedBatchId || "";
          const incomingTs = getBatchTimestamp(incomingBatchId);

          setState(prev => {
            const currentTs = getBatchTimestamp(prev.lastSyncId);
            const isStale = currentTs > incomingTs;

            if (isStale) {
              logger.log(
                `[DataSync] REJECTED stale balance from server. ServerBatch: ${incomingBatchId}, LocalSyncId: ${prev.lastSyncId}`
              );
            } else {
              logger.log(
                `[DataSync] ACCEPTED balance from server: ${res.playerData!.coins} USDT. ServerBatch: ${incomingBatchId}`
              );
            }

            const p = parseIds((res.playerData.inventory || []) as InventoryItem[]);
            return {
              ...prev,
              usd: isStale ? prev.usd : res.playerData.coins || 0,
              b: p.b,
              s: p.s,
              sp: p.sp,
              m: p.m,
              lastSyncId: incomingTs >= currentTs ? incomingBatchId : prev.lastSyncId,
            };
          });
        } else {
          logger.error("[GameData] Fetch error or empty data:", res?.error);
        }
      } catch (e) {
        logger.error("[GameData] Unexpected error in fetchPlayerData:", e);
        toast({ title: "Error", description: `Fetch failed.`, variant: "destructive" });
        // DO NOT set usd to 0 here; it causes balance flickering. Keep the old state.
      } finally {
        setLoading({ fetch: false, store: false, inv: false, wallet: false });
      }
    },
    [sessionPublicKey, toast, fetchData]
  );

  const updateBalanceLocally = useCallback((usd: number, syncId?: string) => {
    setState(p => ({ ...p, usd, lastSyncId: syncId || p.lastSyncId }));
  }, []);

  return {
    playerGameUSDT: state.usd,
    fetchPlayerData,
    isFetchingPlayerUSDT: loading.fetch,
    updateBalanceLocally,
    lastSyncId: state.lastSyncId,
    protectionBottleCount: state.b,
    guardianShieldCount: state.s,
    speedyPawsTreatCount: state.sp,
    coinMagnetTreatCount: state.m,
    isStoreLoading: loading.store,
    isInventoryLoading: loading.inv,
    isWalletLoading: loading.wallet,
  };
};

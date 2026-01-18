/**
 * Custom hook for managing inventory data and logic
 */

import { useConsumableItem, useUserInventory } from '@/hooks/useGraphQL';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { getStoreItemsActiveWithIcons, type StoreItemDefinition } from '@/lib/items';
import { logger } from '@/utils/logger';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface RawCounts {
    speedyPawsTreatCount: number;
    guardianShieldCount: number;
    protectionBottleCount: number;
    coinMagnetTreatCount: number;
}

export const useInventoryData = (props: RawCounts, onUseConsumableItem: (itemId: string, amount: number) => Promise<void>) => {
    const { sessionPublicKey } = useSessionWallet();
    const [storeItemsData, setStoreItemsData] = useState<StoreItemDefinition[]>([]);
    const [storeItemsLoaded, setStoreItemsLoaded] = useState(false);
    const [showSkeletons, setShowSkeletons] = useState(true);

    const { data: inventoryData, loading: graphqlLoading, error: graphqlError, execute: refetchInventory } = useUserInventory(sessionPublicKey?.toBase58() || '');
    const { loading: useItemLoading } = useConsumableItem();

    useEffect(() => {
        getStoreItemsActiveWithIcons().then(setStoreItemsData).catch(err => logger.error('Error loading store:', err)).finally(() => setStoreItemsLoaded(true));
    }, []);

    useEffect(() => {
        if (!graphqlLoading && storeItemsLoaded) {
            const timer = setTimeout(() => setShowSkeletons(false), 300);
            return () => clearTimeout(timer);
        }
        setShowSkeletons(true);
        return undefined;
    }, [graphqlLoading, storeItemsLoaded]);

    const finalCounts = useMemo(() => ({
        '1': inventoryData?.userInventory?.protectionBottleCount ?? props.protectionBottleCount,
        '2': inventoryData?.userInventory?.guardianShieldCount ?? props.guardianShieldCount,
        '3': inventoryData?.userInventory?.speedyPawsTreatCount ?? props.speedyPawsTreatCount,
        '4': inventoryData?.userInventory?.coinMagnetTreatCount ?? props.coinMagnetTreatCount,
    }), [inventoryData, props]);

    const aggregatedInventory = useMemo(() => {
        return Object.entries(finalCounts)
            .filter(([, count]) => count > 0)
            .map(([id, count]) => ({ definition: storeItemsData.find(i => i.id === id), count }))
            .filter((item): item is { definition: StoreItemDefinition; count: number } => !!item.definition);
    }, [finalCounts, storeItemsData]);

    const handleUseItem = useCallback(async (itemId: string, amount: number) => {
        await onUseConsumableItem(itemId, amount);
        if (sessionPublicKey) await refetchInventory();
    }, [onUseConsumableItem, sessionPublicKey, refetchInventory]);

    return { showSkeletons, graphqlError, storeItemsLoaded, aggregatedInventory, useItemLoading, handleUseItem, refetchInventory };
};

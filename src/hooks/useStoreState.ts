'use client';

import { useBobyPrice } from '@/hooks/useBobyPrice';
import type { StoreItemDefinition } from '@/lib/server-items';
import { useCallback, useEffect, useState } from 'react';

/**
 * useQuantityControls - Manages item quantities for the store
 */
const useQuantityControls = (storeItems: StoreItemDefinition[]) => {
    const [quantities, setQuantities] = useState<Record<string, number>>({});

    useEffect(() => {
        if (storeItems.length > 0) {
            setQuantities(prev => {
                const updated = { ...prev };
                storeItems.forEach(item => { if (updated[item.id] === undefined) updated[item.id] = 1; });
                return updated;
            });
        }
    }, [storeItems]);

    const handleQuantityChange = useCallback((id: string, val: string) => {
        const num = Math.max(1, parseInt(val, 10) || 1);
        setQuantities(p => ({ ...p, [id]: num }));
    }, []);

    const handleIncrement = useCallback((id: string) => setQuantities(p => ({ ...p, [id]: (p[id] || 1) + 1 })), []);
    const handleDecrement = useCallback((id: string) => setQuantities(p => ({ ...p, [id]: Math.max((p[id] || 1) - 1, 1) })), []);

    return { quantities, handleQuantityChange, handleIncrement, handleDecrement };
};

/**
 * useStoreState - Main state manager for InGameStore
 */
export const useStoreState = (storeItems: StoreItemDefinition[], itemsLoading: boolean) => {
    const [storeItemsLoaded, setStoreItemsLoaded] = useState(false);
    const [showSkeletons, setShowSkeletons] = useState(true);
    const priceState = useBobyPrice();
    const qtyState = useQuantityControls(storeItems);

    useEffect(() => { if (!itemsLoading) setStoreItemsLoaded(true); }, [itemsLoading]);

    useEffect(() => {
        if (itemsLoading || !storeItemsLoaded) { setShowSkeletons(true); return; }
        const timer = setTimeout(() => setShowSkeletons(false), 300);
        return () => clearTimeout(timer);
    }, [itemsLoading, storeItemsLoaded]);

    return { storeItemsLoaded, showSkeletons, ...priceState, ...qtyState };
};

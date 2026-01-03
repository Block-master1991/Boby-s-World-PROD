import { useState, useEffect, useRef } from 'react';
import { getStoreItems, getStoreItemsActive, getStoreItem, StoreItemDefinition } from '@/lib/items';
import { logger } from '@/utils/logger';

/**
 * Hook to fetch all items from the database
 */
export function useStoreItems() {
    const [items, setItems] = useState<StoreItemDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchItems() {
            try {
                setLoading(true);
                const data = await getStoreItems();
                setItems(data);
                setError(null);
            } catch (err) {
                logger.error('Error fetching store items:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch items');
            } finally {
                setLoading(false);
            }
        }

        fetchItems();
    }, []);

    return { items, loading, error };
}

/**
 * Hook to fetch only active items from the database
 */
export function useActiveStoreItems() {
    const [items, setItems] = useState<StoreItemDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchActiveItems() {
            try {
                setLoading(true);
                const data = await getStoreItemsActive();
                setItems(data);
                setError(null);
            } catch (err) {
                logger.error('[useActiveStoreItems] Error fetching active store items:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch active items');
            } finally {
                setLoading(false);
            }
        }

        fetchActiveItems();
    }, []);

    return { items, loading, error };
}

/**
 * Hook to fetch a single item by ID from the database
 */
export function useStoreItem(id: string) {
    const [item, setItem] = useState<StoreItemDefinition | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchItem() {
            try {
                setLoading(true);
                const data = await getStoreItem(id);
                setItem(data);
                setError(null);
            } catch (err) {
                logger.error('Error fetching store item:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch item');
            } finally {
                setLoading(false);
            }
        }

        if (id) {
            fetchItem();
        }
    }, [id]);

    return { item, loading, error };
}

/**
 * Hook to refetch items (for manual refresh)
 */
export function useStoreItemsRefetch() {
    const [items, setItems] = useState<StoreItemDefinition[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const refetchInProgressRef = useRef(false);

    const refetch = async () => {
        // Prevent multiple concurrent refetch calls (race condition protection)
        if (refetchInProgressRef.current) {
            logger.warn('[useStoreItemsRefetch] Refetch already in progress, skipping duplicate call');
            return items; // Return current items
        }

        refetchInProgressRef.current = true;

        try {
            setLoading(true);
            const data = await getStoreItems();
            setItems(data);
            setError(null);
            return data;
        } catch (err) {
            logger.error('Error refetching store items:', err);
            setError(err instanceof Error ? err.message : 'Failed to refetch items');
            return [];
        } finally {
            setLoading(false);
            refetchInProgressRef.current = false;
        }
    };

    return { items, loading, error, refetch };
}

/**
 * Hook to fetch active items with refetch capability
 */
export function useActiveStoreItemsRefetch() {
    const [items, setItems] = useState<StoreItemDefinition[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const refetchInProgressRef = useRef(false);

    const refetch = async () => {
        // Prevent multiple concurrent refetch calls (race condition protection)
        if (refetchInProgressRef.current) {
            logger.warn('[useActiveStoreItemsRefetch] Refetch already in progress, skipping duplicate call');
            return items; // Return current items
        }

        refetchInProgressRef.current = true;

        try {
            setLoading(true);
            const data = await getStoreItemsActive();
            setItems(data);
            setError(null);
            return data;
        } catch (err) {
            logger.error('Error refetching active store items:', err);
            setError(err instanceof Error ? err.message : 'Failed to refetch active items');
            return [];
        } finally {
            setLoading(false);
            refetchInProgressRef.current = false;
        }
    };

    return { items, loading, error, refetch };
}

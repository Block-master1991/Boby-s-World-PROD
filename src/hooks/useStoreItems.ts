import { useState, useEffect } from 'react';
import { getStoreItems, getStoreItemsActive, getStoreItem, StoreItemDefinition } from '@/lib/items';

/**
 * Hook لجلب جميع الأغراض من قاعدة البيانات
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
                console.error('Error fetching store items:', err);
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
 * Hook لجلب الأغراض النشطة فقط من قاعدة البيانات
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
                console.error('[useActiveStoreItems] Error fetching active store items:', err);
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
 * Hook لجلب عنصر واحد بالمعرف من قاعدة البيانات
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
                console.error('Error fetching store item:', err);
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
 * Hook لإعادة جلب الأغراض (للتحديث اليدوي)
 */
export function useStoreItemsRefetch() {
    const [items, setItems] = useState<StoreItemDefinition[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refetch = async () => {
        try {
            setLoading(true);
            const data = await getStoreItems();
            setItems(data);
            setError(null);
            return data;
        } catch (err) {
            console.error('Error refetching store items:', err);
            setError(err instanceof Error ? err.message : 'Failed to refetch items');
            return [];
        } finally {
            setLoading(false);
        }
    };

    return { items, loading, error, refetch };
}

/**
 * Hook لجلب الأغراض النشطة مع إعادة الجلب
 */
export function useActiveStoreItemsRefetch() {
    const [items, setItems] = useState<StoreItemDefinition[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refetch = async () => {
        try {
            setLoading(true);
            const data = await getStoreItemsActive();
            setItems(data);
            setError(null);
            return data;
        } catch (err) {
            console.error('Error refetching active store items:', err);
            setError(err instanceof Error ? err.message : 'Failed to refetch active items');
            return [];
        } finally {
            setLoading(false);
        }
    };

    return { items, loading, error, refetch };
}

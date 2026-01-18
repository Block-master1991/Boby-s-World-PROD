import { useCallback, useEffect, useState } from 'react';

// Explicit type for items to avoid any
type PersistenceItem = unknown;

const usePersistence = (key: string, items: PersistenceItem[]) => {
    useEffect(() => {
        if (!key) return;
        try { 
            if (items.length) {
                localStorage.setItem(key, JSON.stringify(items)); 
            } else {
                localStorage.removeItem(key);
            }
        } catch { /* noop */ }
    }, [key, items]);
};

type Processor<T> = (items: T[]) => Promise<void>;

export const useBatchedUpdates = <T>(processor: Processor<T>, interval = 2000, persistKey = '') => {
    const [queue, setQueue] = useState<T[]>([]);
    
    // Initial Load
    useEffect(() => {
        if (!persistKey) return;
        try {
            const saved = localStorage.getItem(persistKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    processor(parsed).then(() => localStorage.removeItem(persistKey)).catch(() => setQueue(prev => [...parsed, ...prev]));
                }
            }
        } catch { /* noop */ }
    }, [persistKey, processor]);

    usePersistence(persistKey, queue);

    // Process function
    const processQueueChunk = useCallback(async (chunk: T[]) => {
        try {
            await processor(chunk);
        } catch {
            setQueue(prev => [...chunk, ...prev]);
        }
    }, [processor]);

    useEffect(() => {
        const timer = setInterval(() => {
            setQueue(current => {
                if (current.length === 0) return current;
                // Move execution to next tick/microtask to avoid nesting state updates inside state updates synchronously logic blocks
                // Actually, just calling the async function is fine, it won't block.
                processQueueChunk(current);
                return [];
            });
        }, interval);
        return () => clearInterval(timer);
    }, [processQueueChunk, interval]);

    const addUpdate = useCallback((item: T) => setQueue(prev => [...prev, item]), []);
    return { addUpdate, queueLength: queue.length };
};

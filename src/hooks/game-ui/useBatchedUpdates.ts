import { useCallback, useEffect, useRef, useState } from 'react';

// Explicit type for items to avoid any
type PersistenceItem = unknown;
type Processor<T> = (items: T[]) => Promise<void>;

const usePersistence = (key: string, queue: PersistenceItem[], activeBatch: PersistenceItem[]) => {
    useEffect(() => {
        if (!key) return;
        try { 
            const allItems = [...activeBatch, ...queue];
            if (allItems.length) {
                localStorage.setItem(key, JSON.stringify(allItems)); 
            } else {
                localStorage.removeItem(key);
            }
        } catch { /* noop */ }
    }, [key, queue, activeBatch]);
};

export const useBatchedUpdates = <T>(processor: Processor<T>, interval = 2000, persistKey = '') => {
    const [queue, setQueue] = useState<T[]>([]);
    const [activeBatch, setActiveBatch] = useState<T[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Ref-based backup of the queue for Strict-Mode safe flushing
    const queueRef = useRef<T[]>([]);
    useEffect(() => { queueRef.current = queue; }, [queue]);

    // Busy lock that can be checked synchronously inside the interval
    const isBusyRef = useRef(false);
    useEffect(() => { isBusyRef.current = isProcessing; }, [isProcessing]);

    const procRef = useRef(processor);
    useEffect(() => { procRef.current = processor; }, [processor]);

    // Initial Load - Only run once on mount
    useEffect(() => {
        if (!persistKey) return;
        try {
            const saved = localStorage.getItem(persistKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setQueue(prev => [...parsed, ...prev]);
                }
            }
        } catch { /* noop */ }
    }, [persistKey]);

    usePersistence(persistKey, queue, activeBatch);

    const processQueueChunk = useCallback(async (chunk: T[]) => {
        if (!chunk.length) return;
        setIsProcessing(true);
        setActiveBatch(chunk);
        try {
            await procRef.current(chunk);
            setActiveBatch([]);
        } catch {
            setQueue(prev => [...chunk, ...prev]);
            setActiveBatch([]);
        } finally {
            setIsProcessing(false);
        }
    }, [procRef]);

    useEffect(() => {
        const triggerProcessing = () => {
            // Check busy lock synchronously to avoid overlapping ticks
            if (isBusyRef.current || queueRef.current.length === 0) return;
            
            // Atomically capture the chunk and clear the queue state
            // Crucial: The side effect (starting the sync) happens OUTSIDE setQueue
            const chunkToProcess = [...queueRef.current];
            setQueue([]); 
            
            // Start processing. This is safe from Strict Mode double-firing 
            // because triggerProcessing is a stable function called by setInterval.
            processQueueChunk(chunkToProcess);
        };
        
        const timer = setInterval(triggerProcessing, interval);
        return () => clearInterval(timer);
    }, [processQueueChunk, interval]); // No longer depends on isProcessing state directly

    const addUpdate = useCallback((item: T) => setQueue(prev => [...prev, item]), []);
    return { addUpdate, queueLength: queue.length + activeBatch.length };
};

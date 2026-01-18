'use client';

import { useToast } from '@/hooks/use-toast';
import type { StoreItemDocument } from '@/types/database';
import { logger } from '@/utils/logger';
import { useCallback, useState } from 'react';

export function useItemsData() {
  const [items, setItems] = useState<StoreItemDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const { toast } = useToast();

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/init-store-items');
      const data = await response.json();

      if (data.success) setItems(data.items);
      else toast({ title: 'Error', description: 'Failed to load items', variant: 'destructive' });
    } catch (error) {
      logger.error('Error loading items:', error as Error);
      toast({ title: 'Error', description: 'Failed to load items', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const initializeItems = async () => {
    try {
      setInitializing(true);
      const res = await fetch('/api/admin/init-store-items', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Success', description: `Added ${data.stats.addedItems} new items` });
        await loadItems();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to initialize items', variant: 'destructive' });
      }
    } catch (error) {
      logger.error('Error initializing items:', error as Error);
      toast({ title: 'Error', description: 'Failed to initialize items', variant: 'destructive' });
    } finally {
      setInitializing(false);
    }
  };

  return { items, loading, initializing, loadItems, initializeItems };
}

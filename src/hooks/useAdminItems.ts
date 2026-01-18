'use client';

import { useItemsData } from '@/hooks/useItemsData';
import { useStoreItemActions } from '@/hooks/useStoreItemActions';
import { useStoreMigration } from '@/hooks/useStoreMigration';
import type { StoreItemDocument } from '@/types/database';
import { useEffect, useState } from 'react';

export interface StoreItemFormData {
  id: string; name: string; description: string; price: number; usdPrice: number;
  image: string; dataAiHint: string; type: 'consumable' | 'permanent';
  rarity: 'common' | 'rare' | 'epic' | 'legendary'; isActive: boolean;
}

const INITIAL_FORM_DATA: StoreItemFormData = {
  id: '', name: '', description: '', price: 0, usdPrice: 0.001, image: '',
  dataAiHint: '', type: 'consumable', rarity: 'common', isActive: true,
};

export function useAdminItems() {
  const { items, loading, initializing, loadItems, initializeItems } = useItemsData();
  const [migrating, setMigrating] = useState(false);
  const [editingItem, setEditingItem] = useState<StoreItemDocument | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMigrationDialogOpen, setIsMigrationDialogOpen] = useState(false);
  const [formData, setFormData] = useState<StoreItemFormData>(INITIAL_FORM_DATA);

  const { handleSaveItem, handleDeleteItem } = useStoreItemActions();
  const { handleMigration } = useStoreMigration();

  const saveItem = async () => {
    if (await handleSaveItem(formData, editingItem?.id)) {
      setIsDialogOpen(false); resetForm(); await loadItems();
    }
  };

  const deleteItem = async (id: string) => { if (await handleDeleteItem(id)) await loadItems(); };

  const runMigration = async () => {
    setIsMigrationDialogOpen(false); setMigrating(true);
    await handleMigration(); setMigrating(false);
  };

  const resetForm = () => { setFormData(INITIAL_FORM_DATA); setEditingItem(null); };

  const openEditDialog = (item: StoreItemDocument) => {
    setFormData({ ...item }); setEditingItem(item); setIsDialogOpen(true);
  };

  useEffect(() => { loadItems(); }, [loadItems]);

  return {
    items, loading, initializing, migrating, editingItem, isDialogOpen, setIsDialogOpen,
    isMigrationDialogOpen, setIsMigrationDialogOpen, formData, setFormData, loadItems,
    initializeItems, saveItem, deleteItem, resetForm, runMigration, openEditDialog,
  };
}

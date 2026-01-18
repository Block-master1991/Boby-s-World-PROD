'use client';

import { useEffect } from 'react';
import { useStoreManagementActions } from './useStoreManagementActions';
import { useStoreManagementMaintenance } from './useStoreManagementMaintenance';
import { useStoreManagementState, type StoreItem } from './useStoreManagementState';

export type { StoreItem, StoreItemFormData } from './useStoreManagementState';

export const useStoreItemsManagement = () => {
    const state = useStoreManagementState();
    const actions = useStoreManagementActions(state);
    const maintenance = useStoreManagementMaintenance(state, actions.loadItems);

    const { setFormData, setEditingItem, setIsDialogOpen } = state;
    const { loadItems } = actions;

    const openEditDialog = (item: StoreItem) => {
        setFormData({ ...item });
        setEditingItem(item);
        setIsDialogOpen(true);
    };

    useEffect(() => { loadItems(); }, [loadItems]);

    return {
        ...state,
        ...actions,
        ...maintenance,
        openEditDialog
    };
};

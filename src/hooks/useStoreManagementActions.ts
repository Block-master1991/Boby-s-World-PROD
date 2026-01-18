'use client';

import { useToast } from '@/hooks/use-toast';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { apiFetch } from '@/utils/api';
import { createSignedAdminHeaders } from '@/utils/frontend-auth';
import { logger } from '@/utils/logger';
import { useCallback } from 'react';
import type { StoreItem, useStoreManagementState } from './useStoreManagementState';

export const useStoreManagementActions = (state: ReturnType<typeof useStoreManagementState>) => {
    const { toast } = useToast();
    const { signMessage, adapterPublicKey: wpk } = useSessionWallet();
    const { setItems, setLoading, setInitializing, setIsDialogOpen, resetForm, formData, editingItem } = state;

    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/admin/store-items');
            const data = await res.json();
            if (data.success) setItems(data.items);
        } catch (e) { logger.error('Load error', e); } finally { setLoading(false); }
    }, [setItems, setLoading]);

    const initializeItems = async () => {
        setInitializing(true);
        try {
            const h = await createSignedAdminHeaders(signMessage, wpk, {});
            const r = await apiFetch('/api/admin/init-store-items', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({}) });
            if ((await r.json()).success) { await loadItems(); toast({ title: 'Success', description: 'Initialized' }); }
        } finally { setInitializing(false); }
    };

    const saveItem = async () => {
        if (!formData.id || !formData.name || !formData.description || !formData.image) return;
        try {
            const method = editingItem ? 'PUT' : 'POST';
            const url = editingItem ? `/api/admin/store-items/${editingItem.id}` : '/api/admin/store-items';
            const h = await createSignedAdminHeaders(signMessage, wpk, formData);
            const r = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(formData) });
            if ((await r.json()).success) { setIsDialogOpen(false); resetForm(); await loadItems(); }
        } catch (e) { logger.error('Save error', e); }
    };

    const deleteItem = async (item: StoreItem) => {
        try {
            const h = await createSignedAdminHeaders(signMessage, wpk, { id: item.id });
            const r = await apiFetch(`/api/admin/store-items/${item.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify({ id: item.id }) });
            if ((await r.json()).success) { await loadItems(); toast({ title: 'Deleted', description: item.name }); }
        } catch (e) { logger.error('Delete error', e); }
    };

    return { loadItems, initializeItems, saveItem, deleteItem };
};

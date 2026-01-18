'use client';

import { useCallback, useState } from 'react';

export interface StoreItem {
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    dataAiHint: string;
    type: 'consumable' | 'permanent';
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface StoreItemFormData {
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    dataAiHint: string;
    type: 'consumable' | 'permanent';
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    isActive: boolean;
}

export const useStoreManagementState = () => {
    const [items, setItems] = useState<StoreItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [initializing, setInitializing] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [migratingImages, setMigratingImages] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [editingItem, setEditingItem] = useState<StoreItem | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [formData, setFormData] = useState<StoreItemFormData>({
        id: '', name: '', description: '', price: 0.001, image: '',
        dataAiHint: '', type: 'consumable', rarity: 'common', isActive: true,
    });

    const resetForm = useCallback(() => {
        setFormData({
            id: '', name: '', description: '', price: 0.001, image: '',
            dataAiHint: '', type: 'consumable', rarity: 'common', isActive: true,
        });
        setEditingItem(null);
    }, []);

    return {
        items, setItems, loading, setLoading, initializing, setInitializing,
        migrating, setMigrating, migratingImages, setMigratingImages,
        uploading, setUploading, editingItem, setEditingItem,
        isDialogOpen, setIsDialogOpen, formData, setFormData, resetForm
    };
};

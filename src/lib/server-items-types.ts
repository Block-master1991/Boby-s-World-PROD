import type { ElementType } from 'react';

// Update StoreItemDefinition interface for GraphQL and database compatibility
export interface StoreItemDefinition {
    id: string;
    name: string;
    description: string;
    price: number; // Price in USD
    image: string;
    dataAiHint: string;
    type: 'consumable' | 'permanent';
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    icon?: ElementType; // React component for use in JSX
}

// GraphQL interfaces
export interface CreateItemInput {
    id?: string; // Optional, will be generated automatically if not provided
    name: string;
    description: string;
    price: number;
    image: string;
    dataAiHint: string;
    type: 'consumable' | 'permanent';
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface UpdateItemInput {
    name?: string;
    description?: string;
    price?: number;
    image?: string;
    dataAiHint?: string;
    type?: 'consumable' | 'permanent';
    rarity?: 'common' | 'rare' | 'epic' | 'legendary';
    isActive?: boolean;
}

export interface ItemResult {
    success: boolean;
    item?: StoreItemDefinition;
    message: string;
}

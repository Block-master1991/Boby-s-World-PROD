import { Droplet, Magnet, Shield, Zap } from 'lucide-react';
import type { ElementType } from 'react';
import { logger } from 'utils/logger';

// Re-export functions and interfaces from client-items (safe for client)
export { getStoreItem, getStoreItems, getStoreItemsActive } from './client-items';
export type { StoreItemDefinition } from './client-items';

// Import functions and type for local use
import type { StoreItemDefinition } from './client-items';
import { getStoreItem, getStoreItems, getStoreItemsActive } from './client-items';

// Icon mapping for items
const itemIcons: { [key: string]: ElementType } = {
    '1': Droplet, // Protection Bottle
    '2': Shield,  // Guardian Shield
    '3': Zap,     // Speedy Paws
    '4': Magnet,  // Coin Magnet
};

// ===== Enhanced functions with icons =====

// Get all items with icons
export async function getStoreItemsWithIcons(): Promise<StoreItemDefinition[]> {
    try {
        const items = await getStoreItems();
        // Add icons to items (only if icon exists)
        return items.map(item => {
            const icon = itemIcons[item.id];
            return icon ? { ...item, icon } : item;
        });
    } catch (error) {
        logger.error('Error fetching store items with icons:', error);
        return [];
    }
}

// Get active items with icons
export async function getStoreItemsActiveWithIcons(): Promise<StoreItemDefinition[]> {
    try {
        const items = await getStoreItemsActive();
        // Add icons to items (only if icon exists)
        return items.map(item => {
            const icon = itemIcons[item.id];
            return icon ? { ...item, icon } : item;
        });
    } catch (error) {
        logger.error('Error fetching active store items with icons:', error);
        return [];
    }
}

// Get single item with icon
export async function getStoreItemWithIcon(id: string): Promise<StoreItemDefinition | null> {
    try {
        const item = await getStoreItem(id);
        if (item) {
            const icon = itemIcons[item.id];
            return icon ? { ...item, icon } : item;
        }
        return null;
    } catch (error) {
        logger.error('Error fetching store item with icon:', error);
        return null;
    }
}

// ===== Emergency fallback data =====
// In case of database failure, we use this data
export const fallbackStoreItems: StoreItemDefinition[] = [
    {
        id: '1',
        name: 'Protection Bottle',
        description: 'Consumed instead of your coins, protecting your wealth.',
        price: 0.001,
        image: '/items/ProtectionBottle.png',
        dataAiHint: 'sturdy Bottle',
        type: 'consumable',
        rarity: 'common',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '2',
        name: 'Guardian Shield',
        description: 'Provides temporary protection in fights.',
        price: 0.001,
        image: '/items/guardianShield.png',
        dataAiHint: 'dog shield',
        type: 'consumable',
        rarity: 'common',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '3',
        name: 'Speedy Paws',
        description: 'Boosts your running speed for a short time.',
        price: 0.001,
        image: '/items/speedyPawsTreat.png',
        dataAiHint: 'dog treat',
        type: 'consumable',
        rarity: 'common',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '4',
        name: 'Coin Magnet',
        description: 'When active, automatically collects nearby coins for a short duration.',
        price: 0.001,
        image: '/items/coinMagnetTreat.png',
        dataAiHint: 'dog magnet',
        type: 'consumable',
        rarity: 'common',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

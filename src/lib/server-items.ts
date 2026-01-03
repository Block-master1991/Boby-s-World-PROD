import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'utils/logger';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { fallbackStoreItems } from './items'; // Import fallback data

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
    icon?: any; // React icon for use in components
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

// Function to fetch single item from Firestore
export async function getStoreItemFromFirestore(itemId: string): Promise<StoreItemDefinition | null> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const itemDocRef = db.collection('storeItems').doc(itemId);
        const itemDoc = await itemDocRef.get();

        if (itemDoc.exists) {
            return itemDoc.data() as StoreItemDefinition;
        }
        return null;
    } catch (error) {
        logger.error("Error fetching item from Firestore:", error);
        return null;
    }
}

// Function to migrate initial items to Firestore
export async function initializeStoreItemsInFirestore(): Promise<void> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const batch = db.batch();
        let itemsAddedCount = 0;

        for (const item of fallbackStoreItems) {
            const itemDocRef = db.collection('storeItems').doc(item.id);
            const itemDoc = await itemDocRef.get();

            if (!itemDoc.exists) {
                // Add item only if it doesn't already exist
                const firestoreItem: StoreItemDefinition = {
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    price: item.price,
                    image: item.image,
                    dataAiHint: item.dataAiHint,
                    type: 'consumable' as const,
                    rarity: 'common' as const,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                batch.set(itemDocRef, firestoreItem);
                itemsAddedCount++;
            }
        }

        if (itemsAddedCount > 0) {
            await batch.commit();
            logger.log(`Successfully added ${itemsAddedCount} store items to Firestore.`);
        } else {
            logger.log("All store items already exist in Firestore. No new items added.");
        }
    } catch (error) {
        logger.error("Error initializing store items in Firestore:", error);
    }
}

// ===== New CRUD functions =====

// Read all items
export async function getAllStoreItems(): Promise<StoreItemDefinition[]> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const itemsSnapshot = await db.collection('storeItems')
            .orderBy('createdAt', 'desc')
            .get();

        const items: StoreItemDefinition[] = [];
        itemsSnapshot.forEach(doc => {
            items.push(doc.data() as StoreItemDefinition);
        });

        return items;
    } catch (error) {
        logger.error("Error fetching all store items:", error);
        return [];
    }
}

// Read active items only
export async function getActiveStoreItems(): Promise<StoreItemDefinition[]> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const itemsSnapshot = await db.collection('storeItems')
            .where('isActive', '==', true)
            .get();

        const items: StoreItemDefinition[] = [];
        itemsSnapshot.forEach(doc => {
            items.push(doc.data() as StoreItemDefinition);
        });

        // Sort in memory instead of using orderBy
        return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
        logger.error("Error fetching active store items:", error);
        return [];
    }
}

// Read single item by ID
export async function getStoreItemById(id: string): Promise<StoreItemDefinition | null> {
    return await getStoreItemFromFirestore(id);
}

// Create new item
export async function createStoreItem(input: CreateItemInput): Promise<ItemResult> {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        // Generate unique ID if not provided
        const itemId = input.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const { id, ...inputWithoutId } = input;

        const newItem: StoreItemDefinition = {
            id: itemId,
            ...inputWithoutId,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await db.collection('storeItems').doc(itemId).set(newItem);

        logger.log(`Created new store item: ${itemId}`);
        return {
            success: true,
            item: newItem,
            message: 'Item created successfully'
        };
    } catch (error) {
        logger.error("Error creating store item:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to create item'
        };
    }
}

// Update existing item
export async function updateStoreItem(id: string, updates: UpdateItemInput): Promise<ItemResult> {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        const itemRef = db.collection('storeItems').doc(id);
        const itemDoc = await itemRef.get();

        if (!itemDoc.exists) {
            return {
                success: false,
                message: 'Item not found'
            };
        }

        const updateData = {
            ...updates,
            updatedAt: new Date().toISOString(),
        };

        await itemRef.update(updateData);

        // Fetch updated item
        const updatedDoc = await itemRef.get();
        const updatedItem = updatedDoc.data() as StoreItemDefinition;

        logger.log(`Updated store item: ${id}`);
        return {
            success: true,
            item: updatedItem,
            message: 'Item updated successfully'
        };
    } catch (error) {
        logger.error("Error updating store item:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to update item'
        };
    }
}

// Update item price
export async function updateItemPrice(id: string, newPrice: number): Promise<ItemResult> {
    return await updateStoreItem(id, { price: newPrice });
}

// Activate/deactivate item
export async function toggleItemStatus(id: string, isActive: boolean): Promise<ItemResult> {
    return await updateStoreItem(id, { isActive });
}

// Delete item
export async function deleteStoreItem(id: string): Promise<ItemResult> {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        const itemRef = db.collection('storeItems').doc(id);
        const itemDoc = await itemRef.get();

        if (!itemDoc.exists) {
            return {
                success: false,
                message: 'Item not found'
            };
        }

        await itemRef.delete();

        logger.log(`Deleted store item: ${id}`);
        return {
            success: true,
            message: 'Item deleted successfully'
        };
    } catch (error) {
        logger.error("Error deleting store item:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to delete item'
        };
    }
}

// ===== Helper functions =====

// Check if item exists
export async function storeItemExists(id: string): Promise<boolean> {
    const item = await getStoreItemById(id);
    return item !== null;
}

// Count items by type
export async function countItemsByType(type: 'consumable' | 'permanent'): Promise<number> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const snapshot = await db.collection('storeItems')
            .where('type', '==', type)
            .where('isActive', '==', true)
            .get();

        return snapshot.size;
    } catch (error) {
        logger.error("Error counting items by type:", error);
        return 0;
    }
}

// Count items by rarity
export async function countItemsByRarity(rarity: 'common' | 'rare' | 'epic' | 'legendary'): Promise<number> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const snapshot = await db.collection('storeItems')
            .where('rarity', '==', rarity)
            .where('isActive', '==', true)
            .get();

        return snapshot.size;
    } catch (error) {
        logger.error("Error counting items by rarity:", error);
        return 0;
    }
}

// ===== Additional functions for item management =====

// Reinitialize items from initial data (for admin)
export async function reinitializeStoreItems(): Promise<ItemResult> {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        // Delete all existing items
        const itemsSnapshot = await db.collection('storeItems').get();
        const batch = db.batch();

        itemsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Add items from initial data
        for (const item of fallbackStoreItems) {
            const itemRef = db.collection('storeItems').doc(item.id);
            const firestoreItem: StoreItemDefinition = {
                id: item.id,
                name: item.name,
                description: item.description,
                price: item.price,
                image: item.image,
                dataAiHint: item.dataAiHint,
                type: 'consumable' as const,
                rarity: 'common' as const,
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            batch.set(itemRef, firestoreItem);
        }

        await batch.commit();

        logger.log(`Reinitialized store items with ${fallbackStoreItems.length} default items`);
        return {
            success: true,
            message: `Reinitialized with ${fallbackStoreItems.length} default items`
        };
    } catch (error) {
        logger.error("Error reinitializing store items:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to reinitialize items'
        };
    }
}

// Validate item data
export function validateItemData(input: CreateItemInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.name || input.name.trim().length < 2) {
        errors.push('Name must be at least 2 characters');
    }

    if (!input.description || input.description.trim().length < 10) {
        errors.push('Description must be at least 10 characters');
    }

    if (!input.price || input.price <= 0) {
        errors.push('Price must be greater than 0');
    }

    if (!input.image || !input.image.trim()) {
        errors.push('Image URL is required');
    }

    if (!['consumable', 'permanent'].includes(input.type)) {
        errors.push('Type must be either consumable or permanent');
    }

    if (!['common', 'rare', 'epic', 'legendary'].includes(input.rarity)) {
        errors.push('Rarity must be common, rare, epic, or legendary');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// Get item statistics
export async function getStoreItemsStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byType: { [key: string]: number };
    byRarity: { [key: string]: number };
}> {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        const allItems = await getAllStoreItems();
        const activeItems = allItems.filter(item => item.isActive);

        const stats = {
            total: allItems.length,
            active: activeItems.length,
            inactive: allItems.length - activeItems.length,
            byType: {
                consumable: await countItemsByType('consumable'),
                permanent: await countItemsByType('permanent')
            },
            byRarity: {
                common: await countItemsByRarity('common'),
                rare: await countItemsByRarity('rare'),
                epic: await countItemsByRarity('epic'),
                legendary: await countItemsByRarity('legendary')
            }
        };

        return stats;
    } catch (error) {
        logger.error("Error fetching store items stats:", error);
        return {
            total: 0,
            active: 0,
            inactive: 0,
            byType: { consumable: 0, permanent: 0 },
            byRarity: { common: 0, rare: 0, epic: 0, legendary: 0 }
        };
    }
}

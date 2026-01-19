import { initializeAdminApp } from '@/lib/firebase-admin';
import { logger } from '@/utils/logger';
import { getFirestore } from 'firebase-admin/firestore';
import type { StoreItemDefinition } from './server-items-types';

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
export function getStoreItemById(id: string): Promise<StoreItemDefinition | null> {
    return getStoreItemFromFirestore(id);
}

// Check if item exists
export async function storeItemExists(id: string): Promise<boolean> {
    const item = await getStoreItemById(id);
    return item !== null;
}

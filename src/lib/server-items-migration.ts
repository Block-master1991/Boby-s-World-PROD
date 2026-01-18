import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'utils/logger';
import { fallbackStoreItems } from './items';
import type { ItemResult, StoreItemDefinition } from './server-items-types';

// Function to migrate initial items to Firestore
export async function initializeStoreItemsInFirestore(): Promise<void> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const batch = db.batch();
        let itemsAddedCount = 0;

        // Optimize: Check existence of all items in parallel to avoid await-in-loop
        const checks = await Promise.all(
            fallbackStoreItems.map(async (item) => {
                const itemDocRef = db.collection('storeItems').doc(item.id);
                const itemDoc = await itemDocRef.get();
                return { item, exists: itemDoc.exists, ref: itemDocRef };
            })
        );

        for (const { item, exists, ref } of checks) {
            if (!exists) {
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
                batch.set(ref, firestoreItem);
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

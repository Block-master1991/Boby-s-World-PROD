/**
 * Store Items Initialization - TypeScript Version
 * Populates Firestore with initial store items if they don't exist.
 * Uses centralized Firebase Admin initialization and professional logging.
 */

import 'dotenv/config';
import { Timestamp } from 'firebase-admin/firestore';
import { db, initializeAdminApp } from '../src/lib/firebase-admin';
import { professionalLogger } from '../src/lib/logging';

// Initial items data
const initialItems = [
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
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
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
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
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
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
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
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    },
];

async function initializeStoreItems() {
    const correlationId = `init-store-${Date.now()}`;
    professionalLogger.info('🚀 Starting Firestore Store Items Initialization', { correlationId });

    try {
        await initializeAdminApp();
        if (!db) {
            throw new Error('Firestore database not initialized. Check your environment variables.');
        }

        professionalLogger.debug('🔍 Checking existing store items in Firestore...', { correlationId });
        const snapshot = await db.collection('storeItems').get();
        const existingItemIds = snapshot.docs.map(doc => doc.id);

        professionalLogger.info(`📊 Found ${existingItemIds.length} existing items`, { 
            correlationId, 
            items: existingItemIds 
        });

        const addedCount = await processStoreItems(existingItemIds, correlationId);

        if (addedCount > 0) {
            professionalLogger.info(`🎉 Successfully synchronized ${addedCount} new items!`, { correlationId });
        } else {
            professionalLogger.info('📋 Inventory is already up-to-date.', { correlationId });
        }

        await logInventorySummary(correlationId);
        process.exit(0);
    } catch (error: unknown) {
        const err = error as Error;
        professionalLogger.fatal('Store items initialization failed', { correlationId, error: err.message });
        process.exit(1);
    }
}

async function processStoreItems(existingIds: string[], correlationId: string): Promise<number> {
    const batch = db.batch();
    let addedCount = 0;

    for (const item of initialItems) {
        if (!existingIds.includes(item.id)) {
            professionalLogger.info(`➕ Adding new store item: ${item.name}`, { correlationId, itemId: item.id });
            const docRef = db.collection('storeItems').doc(item.id);
            batch.set(docRef, item);
            addedCount++;
        } else {
            professionalLogger.debug(`✅ Item already exists: ${item.name}`, { correlationId, itemId: item.id });
        }
    }

    if (addedCount > 0) {
        await batch.commit();
    }
    return addedCount;
}

async function logInventorySummary(correlationId: string) {
    const finalSnapshot = await db.collection('storeItems').get();
    const summary = finalSnapshot.docs.map(doc => {
        const data = doc.data();
        const name = data['name'] as string;
        const price = data['price'] as number;
        const isActive = data['isActive'] as boolean;
        return `${name} (${doc.id}): ${price} coins [${isActive ? 'ACTIVE' : 'INACTIVE'}]`;
    });

    professionalLogger.info('📋 Final Store Inventory Summary:', { correlationId, inventory: summary });
}

// Run the initialization
initializeStoreItems();

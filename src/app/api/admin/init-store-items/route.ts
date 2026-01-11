import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getAllStoreItems, createStoreItem, updateStoreItem } from '@/lib/server-items';
import type { AdminRequest } from '@/lib/admin-middleware';
import { withAdminAuth, withSignedAdminAuth } from '@/lib/admin-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';

// Initial items data
const initialItems = [
    {
        id: '1',
        name: 'Protection Bottle',
        description: 'Consumed instead of your coins, protecting your wealth.',
        price: 0.001,
        image: '/items/ProtectionBottle.png',
        dataAiHint: 'sturdy Bottle',
        type: 'consumable' as const,
        rarity: 'common' as const,
        isActive: true,
    },
    {
        id: '2',
        name: 'Guardian Shield',
        description: 'Provides temporary protection in fights.',
        price: 0.001,
        image: '/items/guardianShield.png',
        dataAiHint: 'dog shield',
        type: 'consumable' as const,
        rarity: 'common' as const,
        isActive: true,
    },
    {
        id: '3',
        name: 'Speedy Paws',
        description: 'Boosts your running speed for a short time.',
        price: 0.001,
        image: '/items/speedyPawsTreat.png',
        dataAiHint: 'dog treat',
        type: 'consumable' as const,
        rarity: 'common' as const,
        isActive: true,
    },
    {
        id: '4',
        name: 'Coin Magnet',
        description: 'When active, automatically collects nearby coins for a short duration.',
        price: 0.001,
        image: '/items/coinMagnetTreat.png',
        dataAiHint: 'dog magnet',
        type: 'consumable' as const,
        rarity: 'common' as const,
        isActive: true,
    },
];

export const POST = withSignedAdminAuth(withCsrfProtection(async (request: AdminRequest) => {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        logger.log('🔍 Checking existing store items...');

        // 1. ID Synchronization
        // Ensure Document ID matches internal id field
        logger.log('🔄 Checking for ID mismatches...');
        const storeSnapshot = await db.collection('storeItems').get();

        for (const doc of storeSnapshot.docs) {
            const data = doc.data();
            const documentId = doc.id;
            const internalId = data.id;

            if (internalId && documentId !== internalId) {
                logger.log(`⚠️ ID Mismatch found: Document ID "${documentId}" != Internal ID "${internalId}"`);
                logger.log(`🔄 Migrating document to correct ID...`);

                // Create new document with correct ID
                await db.collection('storeItems').doc(internalId).set(data);
                // Delete old document with random ID
                await db.collection('storeItems').doc(documentId).delete();

                logger.log(`✅ Migration complete for ID "${internalId}"`);
            }
        }

        // Get existing items after synchronization
        const existingItems = await getAllStoreItems();
        const existingIds = existingItems.map(item => item.id);

        logger.log(`📊 Found ${existingItems.length} existing items:`, existingIds);

        // Add missing items or update existing ones
        let addedCount = 0;
        const results = [];

        for (const item of initialItems) {
            if (!existingIds.includes(item.id)) {
                logger.log(`➕ Adding item: ${item.name} (ID: ${item.id})`);

                const newItem = await createStoreItem(item);
                results.push(newItem);
                addedCount++;

                logger.log(`✅ Successfully added: ${item.name}`);
            } else {
                logger.log(`🔄 Updating existing item: ${item.name} (ID: ${item.id})`);

                // Update existing item with new values from initialItems
                const updatedItem = await updateStoreItem(item.id, {
                    name: item.name,
                    description: item.description,
                    price: item.price,
                    image: item.image,
                    type: item.type,
                    rarity: item.rarity,
                    isActive: item.isActive,
                });

                results.push(updatedItem);
                logger.log(`✅ Successfully updated: ${item.name}`);
            }
        }

        logger.log(`\n🎉 Initialization complete!`);
        logger.log(`📊 Added ${addedCount} new items`);
        logger.log(`📊 Total items in store: ${existingItems.length + addedCount}`);

        const response = NextResponse.json({
            success: true,
            message: `Successfully initialized store items`,
            stats: {
                existingItems: existingItems.length,
                addedItems: addedCount,
                totalItems: existingItems.length + addedCount,
            },
            addedItems: results,
        });

        // Use unified helper to update CSRF
        const requestHost = request.headers.get('host') || undefined;
        return await setCsrfTokenResponse(response, request.user.sub, requestHost);

    } catch (error) {
        logger.error('❌ Error initializing store items:', error as Error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to initialize store items',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}));

export const GET = withAdminAuth(async (request: AdminRequest) => {
    try {
        const items = await getAllStoreItems();

        return NextResponse.json({
            success: true,
            items: items,
            count: items.length,
        });
    } catch (error) {
        logger.error('❌ Error fetching store items:', error as Error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch store items',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
});

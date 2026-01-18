/**
 * Inventory Data Migration Utility (V2) - TypeScript Version
 * Migrates user inventory from instance-based system to quantity-based system.
 * Uses centralized Firebase initialization and professional logging.
 */

import 'dotenv/config';
import { Timestamp } from 'firebase-admin/firestore';
import { db, initializeAdminApp } from '../src/lib/firebase-admin';
import { professionalLogger } from '../src/lib/logging';

// Improved Interface for ExactOptionalPropertyTypes compliance
interface InventoryItem {
    id: string;
    itemType?: string | undefined;
    name: string;
    quantity: number;
    rarity?: string | undefined;
    image?: string | undefined;
    description?: string | undefined;
    dataAiHint?: string | undefined;
    instanceId?: string | undefined; // Old system
}

interface MigrationBackup {
    userId: string;
    timestamp: string;
    oldInventory: unknown[];
    newInventory?: InventoryItem[];
    migratedAt: string | null;
    success: boolean;
}

interface MigrationStats {
    processed: number;
    migrated: number;
    items: number;
    skipped: number;
}

// Grouped Context to solving max-params
interface MigrationContext {
    stats: MigrationStats;
    backups: MigrationBackup[];
    correlationId: string;
}

async function migrateInventoryData() {
    const correlationId = `inventory-migration-${Date.now()}`;
    professionalLogger.info('🔄 Starting inventory data migration (V2.0)', { correlationId });

    try {
        await initializeAdminApp();
        if (!db) throw new Error('Firestore not initialized');

        professionalLogger.debug('📖 Scanning for players with obsolete inventory formats...', { correlationId });
        const usersSnapshot = await db.collection('players').where('inventory', '!=', null).get();

        professionalLogger.info(`👥 Found ${usersSnapshot.size} potential users to audit`, { correlationId });

        const context: MigrationContext = {
            stats: { processed: 0, migrated: 0, items: 0, skipped: 0 },
            backups: [],
            correlationId
        };

        await processMigrationBatch(usersSnapshot.docs, context);

        // Save migration report
        await db.collection('system').doc('inventory-migration-v2').set({
            stats: context.stats,
            completedAt: Timestamp.now(),
            correlationId
        });

        professionalLogger.info('🎉 Migration completed successfully!', { correlationId, statistics: context.stats });
        process.exit(0);
    } catch (error: unknown) {
        const err = error as Error;
        professionalLogger.fatal('Critical failure during inventory migration', { correlationId, error: err.message });
        process.exit(1);
    }
}

async function processMigrationBatch(
    docs: FirebaseFirestore.QueryDocumentSnapshot[],
    context: MigrationContext
) {
    const BATCH_SIZE = 10; // Process in chunks to avoid overwhelming DB but allow parallelism
    
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const chunk = docs.slice(i, i + BATCH_SIZE);
        // Process chunks sequentially, but items within chunk in parallel
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(chunk.map(userDoc => processSingleUser(userDoc, context)));
    }
}

async function processSingleUser(
    userDoc: FirebaseFirestore.QueryDocumentSnapshot,
    context: MigrationContext
) {
    const userId = userDoc.id;
    const userData = userDoc.data();
    const oldInventory = (userData['inventory'] as InventoryItem[]) || [];

    if (oldInventory.length === 0 || !oldInventory.some(item => item.instanceId)) {
        context.stats.skipped++;
        return;
    }

    professionalLogger.info(`📦 Migrating user ${userId} (${oldInventory.length} items)`, { correlationId: context.correlationId });
    await migrateUser(userId, oldInventory, context);
}

async function migrateUser(
    userId: string,
    oldInventory: InventoryItem[],
    context: MigrationContext
) {
    const newInventory = convertInventoryFormat(oldInventory);
    const validation = validateMigration(oldInventory, newInventory);

    if (!validation.isValid) {
        professionalLogger.error(`❌ Validation failed for user ${userId}`, { 
            correlationId: context.correlationId, 
            errors: validation.errors 
        });
        return;
    }

    await db.collection('players').doc(userId).update({
        inventory: newInventory,
        migratedAt: Timestamp.now(),
        migrationVersion: '2.0',
        lastUpdated: Timestamp.now()
    });

    context.backups.push({
        userId,
        timestamp: new Date().toISOString(),
        oldInventory: [...oldInventory],
        newInventory,
        migratedAt: new Date().toISOString(),
        success: true
    });

    context.stats.processed++;
    context.stats.migrated++;
    context.stats.items += oldInventory.length;

    professionalLogger.info(`✅ Migration successful for ${userId}`, { 
        correlationId: context.correlationId, 
        aggregatedCount: newInventory.length 
    });
}

function convertInventoryFormat(oldInventory: InventoryItem[]): InventoryItem[] {
    const itemMap = new Map<string, InventoryItem>();

    for (const item of oldInventory) {
        const itemId = String(item.id);
        if (!itemMap.has(itemId)) {
            itemMap.set(itemId, {
                id: itemId,
                itemType: item.itemType || getItemTypeFromId(itemId),
                name: item.name,
                quantity: 0,
                rarity: item.rarity || 'common',
                image: item.image,
                description: item.description,
                dataAiHint: item.dataAiHint
            });
        }
        const existing = itemMap.get(itemId)!;
        existing.quantity += item.quantity || 1;
    }
    return Array.from(itemMap.values());
}

function getItemTypeFromId(itemId: string): string {
    const types: Record<string, string> = { '1': 'consumable', '2': 'consumable', '3': 'consumable', '4': 'consumable' };
    return types[itemId] || 'consumable';
}

function validateMigration(oldInventory: InventoryItem[], newInventory: InventoryItem[]) {
    const errors: string[] = [];
    const oldTotal = oldInventory.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const newTotal = newInventory.reduce((sum, item) => sum + item.quantity, 0);

    if (oldTotal !== newTotal) {
        errors.push(`Total quantity mismatch: old=${oldTotal}, new=${newTotal}`);
    }

    const oldIds = new Set(oldInventory.map(item => String(item.id)));
    const newIds = new Set(newInventory.map(item => String(item.id)));

    if (oldIds.size !== newIds.size) {
        errors.push(`Unique ID count mismatch: old=${oldIds.size}, new=${newIds.size}`);
    }

    return { isValid: errors.length === 0, errors };
}

migrateInventoryData();

/**
 * Inventory Data Migration Utility (V2) - TypeScript Version
 * Migrates user inventory from instance-based system to quantity-based system.
 * Uses centralized Firebase initialization and professional logging.
 */

import 'dotenv/config';
import { initializeAdminApp, db } from '../src/lib/firebase-admin';
import { professionalLogger } from '../src/lib/logging';
import { Timestamp } from 'firebase-admin/firestore';

interface InventoryItem {
    id: string;
    itemType?: string;
    name: string;
    quantity: number;
    rarity?: string;
    image?: string;
    description?: string;
    dataAiHint?: string;
    instanceId?: string; // Old system
}

interface MigrationBackup {
    userId: string;
    timestamp: string;
    oldInventory: any[];
    newInventory?: InventoryItem[];
    migratedAt: string | null;
    success: boolean;
}

async function migrateInventoryData() {
    const correlationId = `inventory-migration-${Date.now()}`;
    professionalLogger.info('🔄 Starting inventory data migration (V2.0)', { correlationId });

    try {
        await initializeAdminApp();
        if (!db) throw new Error('Firestore not initialized');

        professionalLogger.debug('📖 Scanning for players with obsolete inventory formats...', { correlationId });
        const usersSnapshot = await db.collection('players')
            .where('inventory', '!=', null)
            .get();

        professionalLogger.info(`👥 Found ${usersSnapshot.size} potential users to audit`, { correlationId });

        let stats = {
            processed: 0,
            migrated: 0,
            items: 0,
            skipped: 0
        };
        const backups: MigrationBackup[] = [];

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();
            const oldInventory: any[] = userData.inventory || [];

            if (oldInventory.length === 0) {
                stats.skipped++;
                continue;
            }

            // Check if this user needs migration (look for instanceId)
            const needsMigration = oldInventory.some(item => item.instanceId);
            if (!needsMigration) {
                stats.skipped++;
                continue;
            }

            professionalLogger.info(`📦 Migrating user ${userId} (${oldInventory.length} items)`, { correlationId });

            const backup: MigrationBackup = {
                userId,
                timestamp: new Date().toISOString(),
                oldInventory: [...oldInventory],
                migratedAt: null,
                success: false
            };

            // Convert format
            const newInventory = convertInventoryFormat(oldInventory);
            
            // Validate
            const validation = validateMigration(oldInventory, newInventory);
            if (!validation.isValid) {
                professionalLogger.error(`❌ Validation failed for user ${userId}`, { 
                    correlationId, 
                    errors: validation.errors 
                });
                continue;
            }

            // Update database
            await db.collection('players').doc(userId).update({
                inventory: newInventory,
                migratedAt: Timestamp.now(),
                migrationVersion: '2.0',
                lastUpdated: Timestamp.now()
            });

            backup.migratedAt = new Date().toISOString();
            backup.success = true;
            backup.newInventory = newInventory;
            backups.push(backup);

            stats.processed++;
            stats.migrated++;
            stats.items += oldInventory.length;

            professionalLogger.info(`✅ Migration successful for ${userId}`, { 
                correlationId, 
                aggregatedCount: newInventory.length 
            });
        }

        // Save migration report
        await db.collection('system').doc('inventory-migration-v2').set({
            stats,
            completedAt: Timestamp.now(),
            correlationId
        });

        professionalLogger.info('🎉 Migration completed successfully!', { 
            correlationId, 
            statistics: stats 
        });
        process.exit(0);

    } catch (error: any) {
        professionalLogger.fatal('Critical failure during inventory migration', { 
            correlationId, 
            error: error.message 
        });
        process.exit(1);
    }
}

function convertInventoryFormat(oldInventory: any[]): InventoryItem[] {
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
    const types: Record<string, string> = {
        '1': 'consumable',
        '2': 'consumable',
        '3': 'consumable',
        '4': 'consumable'
    };
    return types[itemId] || 'consumable';
}

function validateMigration(oldInventory: any[], newInventory: InventoryItem[]) {
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

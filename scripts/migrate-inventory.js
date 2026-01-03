const admin = require('firebase-admin');

// Initialize Firebase Admin using environment variables (like the rest of the project)
const initializeAdminApp = async () => {
    // Check if Firebase app is already initialized
    if (admin.apps.length === 0) {
        // Use same method as server-items.ts
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

        if (!projectId || !clientEmail || !privateKey) {
            throw new Error('Firebase environment variables not found. Please check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY');
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey,
            }),
            projectId,
        });

        console.log('✅ Firebase Admin initialized successfully');
    }
};

let db = null;

async function migrateInventoryData() {
    console.log('🔄 Starting inventory data migration process...');

    try {
        // Initialize Firebase Admin
        await initializeAdminApp();

        // Initialize Firestore
        db = admin.firestore();

        // 1. Read all users who have inventory
        console.log('📖 Reading user data...');

        const usersSnapshot = await db.collection('players')
            .where('inventory', '!=', null)
            .get();

        console.log(`👥 Found ${usersSnapshot.size} users with inventory`);

        let totalUsersProcessed = 0;
        let totalUsersMigrated = 0;
        let totalItemsMigrated = 0;
        const backups = [];

        // 2. Process each user
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();
            const oldInventory = userData.inventory || [];

            console.log(`\n🔄 Processing user: ${userId}`);
            console.log(`📦 Old items: ${oldInventory.length}`);

            // Skip if inventory is empty
            if (oldInventory.length === 0) {
                console.log('⏭️ Skipping - empty inventory');
                continue;
            }

            // Verify that data is in old system (instanceId exists)
            const hasInstanceIds = oldInventory.some(item => item.instanceId);
            if (!hasInstanceIds) {
                console.log('✅ Skipping - data is already in new system');
                continue;
            }

            // 3. Create backup
            const backup = {
                userId,
                timestamp: new Date().toISOString(),
                oldInventory: JSON.parse(JSON.stringify(oldInventory)),
                migratedAt: null,
                success: false
            };

            // 4. Convert data from old system to new
            const newInventory = convertInventoryFormat(oldInventory);

            console.log(`🔄 Converting ${oldInventory.length} items to ${newInventory.length} aggregated items`);

            // 5. Verify data integrity
            const validation = validateMigration(oldInventory, newInventory);
            if (!validation.isValid) {
                console.error(`❌ Validation failed for user ${userId}:`, validation.errors);
                continue;
            }

            // 6. Save update in database
            await db.collection('players').doc(userId).update({
                inventory: newInventory,
                migratedAt: new Date(),
                migrationVersion: '2.0',
                lastUpdated: new Date()
            });

            // 7. Update backup
            backup.migratedAt = new Date().toISOString();
            backup.success = true;
            backup.newInventory = newInventory;

            backups.push(backup);

            totalUsersProcessed++;
            totalUsersMigrated++;
            totalItemsMigrated += oldInventory.length;

            console.log(`✅ Migration successful for user: ${userId}`);
            console.log(`📊 Old items: ${oldInventory.length}, aggregated: ${newInventory.length}`);
        }

        // 8. Save migration report
        await saveMigrationReport({
            totalUsersProcessed,
            totalUsersMigrated,
            totalItemsMigrated,
            backups,
            timestamp: new Date().toISOString()
        });

        // 9. Display final report
        console.log('\n🎉 Migration completed successfully!');
        console.log('📊 Migration statistics:');
        console.log(`   👥 Total users processed: ${totalUsersProcessed}`);
        console.log(`   ✅ Users migrated: ${totalUsersMigrated}`);
        console.log(`   📦 Items migrated: ${totalItemsMigrated}`);
        console.log(`   💾 Backups saved: ${backups.length}`);

    } catch (error) {
        console.error('❌ Error in migration process:', error);
        process.exit(1);
    } finally {
        await admin.app().delete();
    }
}

/**
 * Convert inventory from old system (instance-based) to new (count-based)
 */
function convertInventoryFormat(oldInventory) {
    const itemMap = new Map();

    // Group items by ID
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

        // Increase count
        const existingItem = itemMap.get(itemId);
        existingItem.quantity += item.quantity || 1;
    }

    return Array.from(itemMap.values());
}

/**
 * Get item type from ID
 */
function getItemTypeFromId(itemId) {
    // Known items
    const itemTypes = {
        '1': 'consumable', // Protection Bottle
        '2': 'consumable', // Guardian Shield
        '3': 'consumable', // Speedy Paws
        '4': 'consumable', // Coin Magnet
    };

    return itemTypes[itemId] || 'consumable';
}

/**
 * Verify migration integrity
 */
function validateMigration(oldInventory, newInventory) {
    const errors = [];
    let isValid = true;

    // Calculate total count in old system
    const oldTotalCount = oldInventory.reduce((sum, item) => sum + (item.quantity || 1), 0);

    // Calculate total count in new system
    const newTotalCount = newInventory.reduce((sum, item) => sum + item.quantity, 0);

    if (oldTotalCount !== newTotalCount) {
        errors.push(`Total count mismatch: old=${oldTotalCount}, new=${newTotalCount}`);
        isValid = false;
    }

    // Verify that all IDs exist
    const oldIds = new Set(oldInventory.map(item => String(item.id)));
    const newIds = new Set(newInventory.map(item => String(item.id)));

    if (oldIds.size !== newIds.size) {
        errors.push(`ID count mismatch: old=${oldIds.size}, new=${newIds.size}`);
        isValid = false;
    }

    // Verify that all old IDs exist in new
    for (const oldId of oldIds) {
        if (!newIds.has(oldId)) {
            errors.push(`ID missing in new system: ${oldId}`);
            isValid = false;
        }
    }

    // Verify data validity
    for (const item of newInventory) {
        if (!item.id || !item.name || item.quantity <= 0) {
            errors.push(`Invalid item: ${JSON.stringify(item)}`);
            isValid = false;
        }
    }

    return { isValid, errors };
}

/**
 * Save migration report
 */
async function saveMigrationReport(report) {
    try {
        await db.collection('system').doc('inventory-migration-v2').set({
            ...report,
            completedAt: new Date()
        });
        console.log('📄 Migration report saved');
    } catch (error) {
        console.error('❌ Error saving migration report:', error);
    }
}

// Run function
console.log('🚀 Starting migration script for item inventory...');
console.log('⚠️  Make sure you have a database backup before continuing!');
console.log('');

migrateInventoryData().then(() => {
    console.log('\n🎊 Migration process completed!');
    process.exit(0);
}).catch((error) => {
    console.error('\n❌ Migration process failed:', error);
    process.exit(1);
});

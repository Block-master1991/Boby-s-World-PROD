const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../firebase-service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
});

const db = admin.firestore();

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
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
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
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
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
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
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
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
    },
];

async function initializeStoreItems() {
    try {
        console.log('🔍 Checking existing store items...');

        const existingItems = [];
        const snapshot = await db.collection('storeItems').get();

        snapshot.forEach(doc => {
            existingItems.push(doc.id);
        });

        console.log(`📊 Found ${existingItems.length} existing items:`, existingItems);

        // Add missing items
        let addedCount = 0;
        const batch = db.batch();

        for (const item of initialItems) {
            if (!existingItems.includes(item.id)) {
                console.log(`➕ Adding item: ${item.name} (ID: ${item.id})`);
                const docRef = db.collection('storeItems').doc(item.id);
                batch.set(docRef, item);
                addedCount++;
            } else {
                console.log(`✅ Item already exists: ${item.name} (ID: ${item.id})`);
            }
        }

        if (addedCount > 0) {
            await batch.commit();
            console.log(`🎉 Successfully added ${addedCount} new items to Firestore!`);
        } else {
            console.log('📋 All items already exist in Firestore.');
        }

        // Display summary
        console.log('\n📋 Store Items Summary:');
        const finalSnapshot = await db.collection('storeItems').get();
        finalSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`  - ${data.name} (${doc.id}): ${data.price} coins, ${data.isActive ? 'Active' : 'Inactive'}`);
        });

    } catch (error) {
        console.error('❌ Error initializing store items:', error);
        process.exit(1);
    } finally {
        // Close connection
        await admin.app().delete();
        process.exit(0);
    }
}

// Run function
console.log('🚀 Initializing store items in Firestore...');
initializeStoreItems();

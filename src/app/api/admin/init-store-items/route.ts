import { NextRequest, NextResponse } from 'next/server';
import { getAllStoreItems, createStoreItem } from '@/lib/server-items';

// بيانات العناصر الأولية
const initialItems = [
    {
        id: '1',
        name: 'Protection Bottle',
        description: 'Consumed instead of your coins, protecting your wealth.',
        price: 50,
        usdPrice: 0.001,
        image: '/Boby-logo.png',
        dataAiHint: 'sturdy Bottle',
        type: 'consumable' as const,
        rarity: 'common' as const,
        isActive: true,
    },
    {
        id: '2',
        name: 'Guardian Shield',
        description: 'Provides temporary protection in fights.',
        price: 75,
        usdPrice: 0.001,
        image: '/guardianShield.png',
        dataAiHint: 'dog shield',
        type: 'consumable' as const,
        rarity: 'common' as const,
        isActive: true,
    },
    {
        id: '3',
        name: 'Speedy Paws',
        description: 'Boosts your running speed for a short time.',
        price: 100,
        usdPrice: 0.001,
        image: '/speedyPawsTreat.png',
        dataAiHint: 'dog treat',
        type: 'consumable' as const,
        rarity: 'common' as const,
        isActive: true,
    },
    {
        id: '4',
        name: 'Coin Magnet',
        description: 'When active, automatically collects nearby coins for a short duration.',
        price: 150,
        usdPrice: 0.001,
        image: '/coinMagnetTreat.png',
        dataAiHint: 'dog magnet',
        type: 'consumable' as const,
        rarity: 'common' as const,
        isActive: true,
    },
];

export async function POST(request: NextRequest) {
    try {
        console.log('🔍 Checking existing store items...');

        // جلب العناصر الموجودة
        const existingItems = await getAllStoreItems();
        const existingIds = existingItems.map(item => item.id);

        console.log(`📊 Found ${existingItems.length} existing items:`, existingIds);

        // إضافة العناصر المفقودة
        let addedCount = 0;
        const results = [];

        for (const item of initialItems) {
            if (!existingIds.includes(item.id)) {
                console.log(`➕ Adding item: ${item.name} (ID: ${item.id})`);

                const newItem = await createStoreItem(item);
                results.push(newItem);
                addedCount++;

                console.log(`✅ Successfully added: ${item.name}`);
            } else {
                console.log(`📋 Item already exists: ${item.name} (ID: ${item.id})`);
            }
        }

        console.log(`\n🎉 Initialization complete!`);
        console.log(`📊 Added ${addedCount} new items`);
        console.log(`📊 Total items in store: ${existingItems.length + addedCount}`);

        return NextResponse.json({
            success: true,
            message: `Successfully initialized store items`,
            stats: {
                existingItems: existingItems.length,
                addedItems: addedCount,
                totalItems: existingItems.length + addedCount,
            },
            addedItems: results,
        });

    } catch (error) {
        console.error('❌ Error initializing store items:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to initialize store items',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        const items = await getAllStoreItems();

        return NextResponse.json({
            success: true,
            items: items,
            count: items.length,
        });
    } catch (error) {
        console.error('❌ Error fetching store items:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch store items',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

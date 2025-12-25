
import type { ElementType } from 'react';
import { Zap, Shield, Droplet, Magnet } from 'lucide-react';

// إعادة تصدير الوظائف والواجهات من client-items (آمنة للعميل)
export { getStoreItems, getStoreItemsActive, getStoreItem } from './client-items';
export type { StoreItemDefinition } from './client-items';

// استيراد الوظائف والنوع للاستخدام المحلي
import { getStoreItems, getStoreItemsActive, getStoreItem } from './client-items';
import type { StoreItemDefinition } from './client-items';

// خريطة الأيقونات للأغراض
const itemIcons: { [key: string]: ElementType } = {
    '1': Droplet, // Protection Bottle
    '2': Shield,  // Guardian Shield
    '3': Zap,     // Speedy Paws
    '4': Magnet,  // Coin Magnet
};

// ===== وظائف محسنة مع الأيقونات =====

// جلب جميع الأغراض مع الأيقونات
export async function getStoreItemsWithIcons(): Promise<StoreItemDefinition[]> {
    try {
        const items = await getStoreItems();
        // إضافة الأيقونات للأغراض
        return items.map(item => ({
            ...item,
            icon: itemIcons[item.id]
        }));
    } catch (error) {
        console.error('Error fetching store items with icons:', error);
        return [];
    }
}

// جلب الأغراض النشطة مع الأيقونات
export async function getStoreItemsActiveWithIcons(): Promise<StoreItemDefinition[]> {
    try {
        const items = await getStoreItemsActive();
        // إضافة الأيقونات للأغراض
        return items.map(item => ({
            ...item,
            icon: itemIcons[item.id]
        }));
    } catch (error) {
        console.error('Error fetching active store items with icons:', error);
        return [];
    }
}

// جلب عنصر واحد مع الأيقونة
export async function getStoreItemWithIcon(id: string): Promise<StoreItemDefinition | null> {
    try {
        const item = await getStoreItem(id);
        if (item) {
            return {
                ...item,
                icon: itemIcons[item.id]
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching store item with icon:', error);
        return null;
    }
}

// ===== بيانات احتياطية للطوارئ =====
// في حالة فشل قاعدة البيانات، نستخدم هذه البيانات
export const fallbackStoreItems: StoreItemDefinition[] = [
    {
        id: '1',
        name: 'Protection Bottle',
        description: 'Consumed instead of your coins, protecting your wealth.',
        price: 50,
        usdPrice: 0.001,
        image: '/Boby-logo.png',
        dataAiHint: 'sturdy Bottle',
        type: 'consumable',
        rarity: 'common',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '2',
        name: 'Guardian Shield',
        description: 'Provides temporary protection in fights.',
        price: 75,
        usdPrice: 0.001,
        image: '/guardianShield.png',
        dataAiHint: 'dog shield',
        type: 'consumable',
        rarity: 'common',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '3',
        name: 'Speedy Paws',
        description: 'Boosts your running speed for a short time.',
        price: 100,
        usdPrice: 0.001,
        image: '/speedyPawsTreat.png',
        dataAiHint: 'dog treat',
        type: 'consumable',
        rarity: 'common',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '4',
        name: 'Coin Magnet',
        description: 'When active, automatically collects nearby coins for a short duration.',
        price: 150,
        usdPrice: 0.001,
        image: '/coinMagnetTreat.png',
        dataAiHint: 'dog magnet',
        type: 'consumable',
        rarity: 'common',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

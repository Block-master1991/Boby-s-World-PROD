import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { fallbackStoreItems } from './items'; // استيراد البيانات الاحتياطية

// تحديث واجهة StoreItemDefinition للتوافق مع GraphQL وقاعدة البيانات
export interface StoreItemDefinition {
    id: string;
    name: string;
    description: string;
    price: number; // السعر بالعملات الافتراضية
    usdPrice: number; // السعر بالدولار
    image: string;
    dataAiHint: string;
    type: 'consumable' | 'permanent';
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    icon?: any; // أيقونة React للاستخدام في المكونات
}

// واجهات GraphQL
export interface CreateItemInput {
    name: string;
    description: string;
    price: number;
    usdPrice: number;
    image: string;
    dataAiHint: string;
    type: 'consumable' | 'permanent';
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface UpdateItemInput {
    name?: string;
    description?: string;
    price?: number;
    usdPrice?: number;
    image?: string;
    dataAiHint?: string;
    type?: 'consumable' | 'permanent';
    rarity?: 'common' | 'rare' | 'epic' | 'legendary';
    isActive?: boolean;
}

export interface ItemResult {
    success: boolean;
    item?: StoreItemDefinition;
    message: string;
}

// وظيفة لجلب عنصر واحد من Firestore
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
        console.error("Error fetching item from Firestore:", error);
        return null;
    }
}

// وظيفة لترحيل العناصر الأولية إلى Firestore
export async function initializeStoreItemsInFirestore(): Promise<void> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const batch = db.batch();
        let itemsAddedCount = 0;

        for (const item of fallbackStoreItems) {
            const itemDocRef = db.collection('storeItems').doc(item.id);
            const itemDoc = await itemDocRef.get();

            if (!itemDoc.exists) {
                // إضافة العنصر فقط إذا لم يكن موجودًا بالفعل
                const firestoreItem: StoreItemDefinition = {
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    price: Math.round(item.price * 100000), // تحويل من USD إلى العملات الافتراضية
                    usdPrice: item.price,
                    image: item.image,
                    dataAiHint: item.dataAiHint,
                    type: 'consumable' as const,
                    rarity: 'common' as const,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                batch.set(itemDocRef, firestoreItem);
                itemsAddedCount++;
            }
        }

        if (itemsAddedCount > 0) {
            await batch.commit();
            console.log(`Successfully added ${itemsAddedCount} store items to Firestore.`);
        } else {
            console.log("All store items already exist in Firestore. No new items added.");
        }
    } catch (error) {
        console.error("Error initializing store items in Firestore:", error);
    }
}

// ===== وظائف CRUD الجديدة =====

// قراءة جميع الأغراض
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
        console.error("Error fetching all store items:", error);
        return [];
    }
}

// قراءة الأغراض النشطة فقط
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
        console.error("Error fetching active store items:", error);
        return [];
    }
}

// قراءة عنصر واحد بالمعرف
export async function getStoreItemById(id: string): Promise<StoreItemDefinition | null> {
    return await getStoreItemFromFirestore(id);
}

// إنشاء عنصر جديد
export async function createStoreItem(input: CreateItemInput): Promise<ItemResult> {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        // إنشاء معرف فريد
        const itemId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const newItem: StoreItemDefinition = {
            id: itemId,
            ...input,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await db.collection('storeItems').doc(itemId).set(newItem);

        console.log(`Created new store item: ${itemId}`);
        return {
            success: true,
            item: newItem,
            message: 'Item created successfully'
        };
    } catch (error) {
        console.error("Error creating store item:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to create item'
        };
    }
}

// تحديث عنصر موجود
export async function updateStoreItem(id: string, updates: UpdateItemInput): Promise<ItemResult> {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        const itemRef = db.collection('storeItems').doc(id);
        const itemDoc = await itemRef.get();

        if (!itemDoc.exists) {
            return {
                success: false,
                message: 'Item not found'
            };
        }

        const updateData = {
            ...updates,
            updatedAt: new Date().toISOString(),
        };

        await itemRef.update(updateData);

        // جلب العنصر المحدث
        const updatedDoc = await itemRef.get();
        const updatedItem = updatedDoc.data() as StoreItemDefinition;

        console.log(`Updated store item: ${id}`);
        return {
            success: true,
            item: updatedItem,
            message: 'Item updated successfully'
        };
    } catch (error) {
        console.error("Error updating store item:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to update item'
        };
    }
}

// تحديث سعر عنصر
export async function updateItemPrice(id: string, newPrice: number): Promise<ItemResult> {
    return await updateStoreItem(id, { price: newPrice });
}

// تفعيل/إلغاء تفعيل عنصر
export async function toggleItemStatus(id: string, isActive: boolean): Promise<ItemResult> {
    return await updateStoreItem(id, { isActive });
}

// حذف عنصر
export async function deleteStoreItem(id: string): Promise<ItemResult> {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        const itemRef = db.collection('storeItems').doc(id);
        const itemDoc = await itemRef.get();

        if (!itemDoc.exists) {
            return {
                success: false,
                message: 'Item not found'
            };
        }

        await itemRef.delete();

        console.log(`Deleted store item: ${id}`);
        return {
            success: true,
            message: 'Item deleted successfully'
        };
    } catch (error) {
        console.error("Error deleting store item:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to delete item'
        };
    }
}

// ===== وظائف مساعدة =====

// التحقق من وجود عنصر
export async function storeItemExists(id: string): Promise<boolean> {
    const item = await getStoreItemById(id);
    return item !== null;
}

// عد الأغراض حسب النوع
export async function countItemsByType(type: 'consumable' | 'permanent'): Promise<number> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const snapshot = await db.collection('storeItems')
            .where('type', '==', type)
            .where('isActive', '==', true)
            .get();

        return snapshot.size;
    } catch (error) {
        console.error("Error counting items by type:", error);
        return 0;
    }
}

// عد الأغراض حسب الندرة
export async function countItemsByRarity(rarity: 'common' | 'rare' | 'epic' | 'legendary'): Promise<number> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const snapshot = await db.collection('storeItems')
            .where('rarity', '==', rarity)
            .where('isActive', '==', true)
            .get();

        return snapshot.size;
    } catch (error) {
        console.error("Error counting items by rarity:", error);
        return 0;
    }
}

// ===== وظائف إضافية لإدارة العناصر =====

// إعادة تهيئة العناصر من البيانات الأولية (للأدمن)
export async function reinitializeStoreItems(): Promise<ItemResult> {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        // حذف جميع العناصر الموجودة
        const itemsSnapshot = await db.collection('storeItems').get();
        const batch = db.batch();

        itemsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        // إضافة العناصر من البيانات الأولية
        for (const item of fallbackStoreItems) {
            const itemRef = db.collection('storeItems').doc(item.id);
            const firestoreItem: StoreItemDefinition = {
                id: item.id,
                name: item.name,
                description: item.description,
                price: Math.round(item.price * 100000), // تحويل من USD إلى العملات الافتراضية
                usdPrice: item.price,
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

        console.log(`Reinitialized store items with ${fallbackStoreItems.length} default items`);
        return {
            success: true,
            message: `Reinitialized with ${fallbackStoreItems.length} default items`
        };
    } catch (error) {
        console.error("Error reinitializing store items:", error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to reinitialize items'
        };
    }
}

// التحقق من صحة بيانات العنصر
export function validateItemData(input: CreateItemInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.name || input.name.trim().length < 2) {
        errors.push('Name must be at least 2 characters');
    }

    if (!input.description || input.description.trim().length < 10) {
        errors.push('Description must be at least 10 characters');
    }

    if (!input.price || input.price <= 0) {
        errors.push('Price must be greater than 0');
    }

    if (!input.usdPrice || input.usdPrice <= 0) {
        errors.push('USD price must be greater than 0');
    }

    if (!input.image || !input.image.trim()) {
        errors.push('Image URL is required');
    }

    if (!['consumable', 'permanent'].includes(input.type)) {
        errors.push('Type must be either consumable or permanent');
    }

    if (!['common', 'rare', 'epic', 'legendary'].includes(input.rarity)) {
        errors.push('Rarity must be common, rare, epic, or legendary');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// جلب إحصائيات الأغراض
export async function getStoreItemsStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byType: { [key: string]: number };
    byRarity: { [key: string]: number };
}> {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        const allItems = await getAllStoreItems();
        const activeItems = allItems.filter(item => item.isActive);

        const stats = {
            total: allItems.length,
            active: activeItems.length,
            inactive: allItems.length - activeItems.length,
            byType: {
                consumable: await countItemsByType('consumable'),
                permanent: await countItemsByType('permanent')
            },
            byRarity: {
                common: await countItemsByRarity('common'),
                rare: await countItemsByRarity('rare'),
                epic: await countItemsByRarity('epic'),
                legendary: await countItemsByRarity('legendary')
            }
        };

        return stats;
    } catch (error) {
        console.error("Error fetching store items stats:", error);
        return {
            total: 0,
            active: 0,
            inactive: 0,
            byType: { consumable: 0, permanent: 0 },
            byRarity: { common: 0, rare: 0, epic: 0, legendary: 0 }
        };
    }
}

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { storeItems, StoreItemDefinition } from './items'; // استيراد storeItems وتعريفات الواجهات

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

        for (const item of storeItems) {
            const itemDocRef = db.collection('storeItems').doc(item.id);
            const itemDoc = await itemDocRef.get();

            if (!itemDoc.exists) {
                // إضافة العنصر فقط إذا لم يكن موجودًا بالفعل
                const firestoreItem: StoreItemDefinition = {
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    price: item.price,
                    image: item.image,
                    dataAiHint: item.dataAiHint,
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

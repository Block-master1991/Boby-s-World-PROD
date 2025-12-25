const admin = require('firebase-admin');

// تهيئة Firebase Admin باستخدام متغيرات البيئة (مثل باقي المشروع)
const initializeAdminApp = async () => {
    // التحقق من وجود Firebase app مُهيكل مسبقاً
    if (admin.apps.length === 0) {
        // استخدام نفس طريقة server-items.ts
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
    console.log('🔄 بدء عملية نقل بيانات المخزون...');

    try {
        // تهيئة Firebase Admin
        await initializeAdminApp();

        // تهيئة Firestore
        db = admin.firestore();

        // 1. قراءة جميع المستخدمين الذين لديهم inventory
        console.log('📖 قراءة بيانات المستخدمين...');

        const usersSnapshot = await db.collection('players')
            .where('inventory', '!=', null)
            .get();

        console.log(`👥 تم العثور على ${usersSnapshot.size} مستخدم لديهم مخزون`);

        let totalUsersProcessed = 0;
        let totalUsersMigrated = 0;
        let totalItemsMigrated = 0;
        const backups = [];

        // 2. معالجة كل مستخدم
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();
            const oldInventory = userData.inventory || [];

            console.log(`\n🔄 معالجة المستخدم: ${userId}`);
            console.log(`📦 العناصر القديمة: ${oldInventory.length}`);

            // تخطي إذا كان المخزون فارغ
            if (oldInventory.length === 0) {
                console.log('⏭️ تخطي - المخزون فارغ');
                continue;
            }

            // التحقق من أن البيانات بالنظام القديم (instanceId موجود)
            const hasInstanceIds = oldInventory.some(item => item.instanceId);
            if (!hasInstanceIds) {
                console.log('✅ تخطي - البيانات بالنظام الجديد بالفعل');
                continue;
            }

            // 3. إنشاء backup
            const backup = {
                userId,
                timestamp: new Date().toISOString(),
                oldInventory: JSON.parse(JSON.stringify(oldInventory)),
                migratedAt: null,
                success: false
            };

            // 4. تحويل البيانات من النظام القديم إلى الجديد
            const newInventory = convertInventoryFormat(oldInventory);

            console.log(`🔄 تحويل ${oldInventory.length} عنصر إلى ${newInventory.length} عنصر مجمع`);

            // 5. التحقق من سلامة البيانات
            const validation = validateMigration(oldInventory, newInventory);
            if (!validation.isValid) {
                console.error(`❌ فشل التحقق للمستخدم ${userId}:`, validation.errors);
                continue;
            }

            // 6. حفظ التحديث في قاعدة البيانات
            await db.collection('players').doc(userId).update({
                inventory: newInventory,
                migratedAt: new Date(),
                migrationVersion: '2.0',
                lastUpdated: new Date()
            });

            // 7. تحديث الـ backup
            backup.migratedAt = new Date().toISOString();
            backup.success = true;
            backup.newInventory = newInventory;

            backups.push(backup);

            totalUsersProcessed++;
            totalUsersMigrated++;
            totalItemsMigrated += oldInventory.length;

            console.log(`✅ تم النقل بنجاح للمستخدم: ${userId}`);
            console.log(`📊 العناصر القديمة: ${oldInventory.length}, المجمعة: ${newInventory.length}`);
        }

        // 8. حفظ تقرير الـ migration
        await saveMigrationReport({
            totalUsersProcessed,
            totalUsersMigrated,
            totalItemsMigrated,
            backups,
            timestamp: new Date().toISOString()
        });

        // 9. عرض التقرير النهائي
        console.log('\n🎉 تمت عملية النقل بنجاح!');
        console.log('📊 إحصائيات النقل:');
        console.log(`   👥 إجمالي المستخدمين المعالجين: ${totalUsersProcessed}`);
        console.log(`   ✅ المستخدمين المنقولين: ${totalUsersMigrated}`);
        console.log(`   📦 العناصر المنقولة: ${totalItemsMigrated}`);
        console.log(`   💾 النسخ الاحتياطية المحفوظة: ${backups.length}`);

    } catch (error) {
        console.error('❌ خطأ في عملية النقل:', error);
        process.exit(1);
    } finally {
        await admin.app().delete();
    }
}

/**
 * تحويل مخزون من النظام القديم (instance-based) إلى الجديد (count-based)
 */
function convertInventoryFormat(oldInventory) {
    const itemMap = new Map();

    // تجميع العناصر حسب ID
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

        // زيادة العدد
        const existingItem = itemMap.get(itemId);
        existingItem.quantity += item.quantity || 1;
    }

    return Array.from(itemMap.values());
}

/**
 * الحصول على نوع العنصر من ID
 */
function getItemTypeFromId(itemId) {
    // العناصر المعروفة
    const itemTypes = {
        '1': 'consumable', // Protection Bottle
        '2': 'consumable', // Guardian Shield
        '3': 'consumable', // Speedy Paws
        '4': 'consumable', // Coin Magnet
    };

    return itemTypes[itemId] || 'consumable';
}

/**
 * التحقق من سلامة النقل
 */
function validateMigration(oldInventory, newInventory) {
    const errors = [];
    let isValid = true;

    // حساب العدد الإجمالي في النظام القديم
    const oldTotalCount = oldInventory.reduce((sum, item) => sum + (item.quantity || 1), 0);

    // حساب العدد الإجمالي في النظام الجديد
    const newTotalCount = newInventory.reduce((sum, item) => sum + item.quantity, 0);

    if (oldTotalCount !== newTotalCount) {
        errors.push(`عدم تطابق العدد الإجمالي: القديم=${oldTotalCount}, الجديد=${newTotalCount}`);
        isValid = false;
    }

    // التحقق من أن جميع IDs موجودة
    const oldIds = new Set(oldInventory.map(item => String(item.id)));
    const newIds = new Set(newInventory.map(item => String(item.id)));

    if (oldIds.size !== newIds.size) {
        errors.push(`عدم تطابق عدد IDs: القديم=${oldIds.size}, الجديد=${newIds.size}`);
        isValid = false;
    }

    // التحقق من أن جميع IDs من القديم موجودة في الجديد
    for (const oldId of oldIds) {
        if (!newIds.has(oldId)) {
            errors.push(`ID مفقود في النظام الجديد: ${oldId}`);
            isValid = false;
        }
    }

    // التحقق من صحة البيانات
    for (const item of newInventory) {
        if (!item.id || !item.name || item.quantity <= 0) {
            errors.push(`عنصر غير صالح: ${JSON.stringify(item)}`);
            isValid = false;
        }
    }

    return { isValid, errors };
}

/**
 * حفظ تقرير النقل
 */
async function saveMigrationReport(report) {
    try {
        await db.collection('system').doc('inventory-migration-v2').set({
            ...report,
            completedAt: new Date()
        });
        console.log('📄 تم حفظ تقرير النقل');
    } catch (error) {
        console.error('❌ خطأ في حفظ تقرير النقل:', error);
    }
}

// تشغيل الدالة
console.log('🚀 بدء migration script لمخزون العناصر...');
console.log('⚠️  تأكد من وجود backup لقاعدة البيانات قبل المتابعة!');
console.log('');

migrateInventoryData().then(() => {
    console.log('\n🎊 انتهت عملية النقل!');
    process.exit(0);
}).catch((error) => {
    console.error('\n❌ فشلت عملية النقل:', error);
    process.exit(1);
});

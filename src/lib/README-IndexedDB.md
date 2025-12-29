# Advanced IndexedDB Management System

نظام إدارة متقدم لـ IndexedDB مصمم لإدارة موارد اللعبة بكفاءة واحترافية.

## المميزات الرئيسية

### 🗄️ إدارة قواعد البيانات
- **إصدارات تلقائية**: ترقية تلقائية لقاعدة البيانات مع الحفاظ على البيانات
- **Migration**: نقل البيانات من الإصدارات القديمة
- **Multiple Stores**: فواصل منفصلة للبيانات والإحصائيات والمعلومات الوصفية

### 📊 إحصائيات متقدمة
- **Hit/Miss Rate**: تتبع معدل الإصابات والإخفاقات
- **Cache Size Management**: إدارة حجم الـ cache تلقائياً
- **LRU Eviction**: إزالة البيانات الأقل استخداماً عند الحاجة
- **TTL Support**: انتهاء صلاحية البيانات تلقائياً

### 🔧 عمليات متقدمة
- **Batch Operations**: عمليات مجمعة لتحسين الأداء
- **Data Integrity**: فحص سلامة البيانات باستخدام checksum
- **Retry Logic**: إعادة المحاولة التلقائية عند فشل العمليات
- **Error Handling**: معالجة أخطاء شاملة مع أكواد محددة

### 📱 دعم الأجهزة
- **Mobile/Desktop**: حدود مختلفة للأجهزة المحمولة والمكتبية
- **Performance**: تحسينات خاصة للأجهزة ذات الموارد المحدودة
- **Availability Check**: فحص توفر IndexedDB

## واجهة برمجة التطبيقات (API)

### أنواع البيانات المدعومة
```typescript
type DataType = 'arraybuffer' | 'blob' | 'json' | 'text' | 'uint8array';
```

### تخزين مورد
```typescript
await putAsset({
  id: 'my-texture',
  name: 'Grass Texture',
  type: 'arraybuffer',
  size: 1024000, // bytes
  priority: 7,
  data: textureData,
  ttl: 24 * 60 * 60 * 1000 // 24 hours
});
```

### استرجاع مورد
```typescript
const asset = await getAsset('my-texture');
if (asset) {
  // استخدام asset.data
}
```

### إحصائيات الـ Cache
```typescript
const stats = await getCacheStats();
console.log(`Cache size: ${formatBytes(stats.totalSize)}`);
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

## التوافق الخلفي

النظام يحافظ على التوافق مع الكود الحالي:

```typescript
// الطرق القديمة ما زالت تعمل
await putModel('model-name', arrayBuffer);
const data = await getModel('model-name');
```

## الحدود والقيود

- **Mobile**: 50MB، 100 مورد كحد أقصى
- **Desktop**: 200MB، 500 مورد كحد أقصى
- **TTL**: تنظيف تلقائي كل 5 دقائق
- **Migration**: دعم نقل البيانات من الإصدار 1

## أدوات المطور

### تصدير/استيراد البيانات
```typescript
// تصدير جميع البيانات للنسخ الاحتياطي
const backup = await exportData();

// استيراد البيانات من النسخ الاحتياطي
await importData(backup);
```

### تنظيف يدوي
```typescript
// تنظيف البيانات المنتهية الصلاحية
const cleaned = await cleanExpiredAssets();

// حذف مورد محدد
await deleteAsset('asset-id');

// تنظيف جميع الموارد
await clearAssets();
```

## الأداء

- **Indexing**: فهارس متعددة للبحث السريع
- **Transactions**: معاملات محسنة للأداء
- **Memory Management**: إدارة الذاكرة التلقائية
- **Background Cleanup**: تنظيف دوري في الخلفية

## معالجة الأخطاء

```typescript
try {
  await putAsset(asset);
} catch (error) {
  if (error instanceof IndexedDBError) {
    console.error(`IndexedDB Error [${error.code}]:`, error.message);
  }
}
```

## الإعدادات

يمكن تخصيص الإعدادات من خلال متغيرات البيئة:

```typescript
// في المستقبل يمكن إضافة متغيرات بيئة
// INDEXEDDB_MAX_SIZE
// INDEXEDDB_MAX_ITEMS
// INDEXEDDB_CLEANUP_INTERVAL

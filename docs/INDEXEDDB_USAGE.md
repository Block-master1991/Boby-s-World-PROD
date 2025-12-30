# دليل استخدام نظام IndexedDB المحسّن

## نظرة عامة

هذا الدليل يشرح كيفية استخدام نظام IndexedDB المحسّن في مشروع Boby's World.

---

## 1. قياس موارد اللعبة

### الأمر الأساسي

```bash
# قياس جميع الموارد
node scripts/measureAssets.js
```

### النتائج

سيتم إنشاء ملف `scripts/measured-assets.json` يحتوي على:
- SHA-256 checksum لكل ملف
- الحجم الفعلي بالبايتات
- تاريخ آخر تعديل
- مقارنة مع الأحجام المقدّرة

### تحديث Manifest

```bash
# تحديث gameAssetManifest.ts بالبيانات الحقيقية
node scripts/updateManifest.js
```

سيتم إنشاء نسخة احتياطية تلقائياً قبل التحديث.

---

## 2. التحقق من سلامة الملفات

### الاستخدام البسيط

```typescript
import { verifyAssetIntegrity } from '@/lib/assetIntegrity';

const data = await fetch('/models/dog.glb').then(r => r.arrayBuffer());

const check = await verifyAssetIntegrity(
    '/models/dog.glb',
    data,
    'a3f5c9b2...', // SHA-256 (اختياري)
    913555       // الحجم المتوقع بالبايتات (اختياري)
);

if (!check.isValid) {
    console.error(`ملف تالف: ${check.error}`);
    // إعادة تحميل أو إخطار المستخدم
}
```

### فحص متعدد

```typescript
import { verifyMultipleAssets } from '@/lib/assetIntegrity';

const report = await verifyMultipleAssets([
    { path: '/models/dog.glb', data: buffer1, expectedSHA256: '...' },
    { path: '/models/coin.glb', data: buffer2, expectedSHA256: '...' },
]);

console.log(`تم التحقق: ${report.passed}/${report.totalChecked}`);
console.log(`فشل: ${report.failed}`);
```

---

## 3. نظام الضغط

### تخزين مع ضغط تلقائي

```typescript
import { putAssetCompressed } from '@/lib/indexedDBCompression';

const asset = {
    id: '/models/large-model.glb',
    name: 'Large Model',
    type: 'arraybuffer',
    size: data.byteLength,
    createdAt: Date.now(),
    accessedAt: Date.now(),
    priority: 5,
    data: data
};

// سيتم الضغط تلقائياً إذا كان الحجم > 5MB
await putAssetCompressed(asset, 5);
```

### استرجاع مع فك ضغط تلقائي

```typescript
import { getAssetDecompressed } from '@/lib/indexedDBCompression';

const asset = await getAssetDecompressed('/models/large-model.glb');
// البيانات مفكوكة تلقائياً
```

### تحليل فوائد الضغط

```typescript
import { calculateCompressionBenefit } from '@/lib/indexedDBCompression';

const benefit = await calculateCompressionBenefit(arrayBuffer);

console.log(`الحجم الأصلي: ${benefit.originalSizeMB}MB`);
console.log(`بعد الضغط: ${benefit.compressedSizeMB}MB`);
console.log(`التوفير: ${benefit.reductionPercent.toFixed(1)}%`);
console.log(`يستحق الضغط: ${benefit.worthCompressing ? 'نعم' : 'لا'}`);
```

---

## 4. نظام التحميل الأولي المحسّن

### الاستخدام الأساسي

```typescript
import { initialAssetPreloader } from '@/lib/initialAssetPreloader';

const success = await initialAssetPreloader.preloadAllAssets({
    onProgress: (progress) => {
        console.log(`التقدم: ${progress.loadedAssets}/${progress.totalAssets}`);
        console.log(`الحجم: ${progress.loadedSizeMB}/${progress.totalSizeMB}MB`);
        console.log(`السرعة: ${progress.downloadSpeed.toFixed(2)}MB/s`);
        console.log(`تم التحقق: ${progress.verifiedAssets}`);
        console.log(`تالف: ${progress.corruptedAssets}`);
    },
    maxConcurrentLoads: 3,
    timeoutMs: 300000,
    retryAttempts: 3
});

if (success) {
    console.log('جميع الموارد محملة بنجاح!');
} else {
    console.error('فشل تحميل بعض الموارد');
}
```

### الحصول على الحالة

```typescript
const status = initialAssetPreloader.getPreloadStatus();
const stats = initialAssetPreloader.getPreloadStats();

console.log(`معدل الإنجاز: ${stats.completionRate}%`);
console.log(`معدل النجاح: ${stats.successRate}%`);
console.log(`الأخطاء: ${stats.errors}`);
```

---

## 5. IndexedDB الأساسي

### التخزين

```typescript
import { putAsset } from './indexedDB';

const asset = {
    id: '/models/dog.glb',
    name: 'Dog Character',
    type: 'arraybuffer',
    size: data.byteLength,
    createdAt: Date.now(),
    accessedAt: Date.now(),
    priority: 10,
    data: data
};

await putAsset(asset);
```

### الاسترجاع

```typescript
import { getAsset } from './indexedDB';

const asset = await getAsset('/models/dog.glb');

if (asset) {
    console.log(`تم العثور على: ${asset.name}`);
    // استخدم asset.data
} else {
    console.log('الملف غير موجود في الذاكرة المؤقتة');
}
```

### إحصائيات الذاكرة المؤقتة

```typescript
import { getCacheStats } from './indexedDB';

const stats = await getCacheStats();

console.log(`الملفات المخزنة: ${stats.totalItems}`);
console.log(`المساحة المستخدمة: ${stats.totalSize / (1024*1024)}MB`);
console.log(`الحد الأقصى: ${stats.maxSize / (1024*1024)}MB`);
console.log(`معدل النجاح: ${(stats.hitRate * 100).toFixed(1)}%`);
```

---

## 6. واجهة المستخدم

### InitialAssetLoader Component

```tsx
import InitialAssetLoader from '@/components/InitialAssetLoader';

<InitialAssetLoader
    onComplete={() => {
        console.log('التحميل اكتمل!');
        // انتقل إلى اللعبة
    }}
    onError={(error) => {
        console.error('فشل التحميل:', error);
        // أظهر رسالة خطأ للمستخدم
    }}
/>
```

---

## 7. استكشاف الأخطاء

### ملف مفقود

```
✗ Error: File not found: /models/missing.glb
```

**الحل**: تأكد من وجود الملف في `/public` وأنه مدرج في `gameAssetManifest.ts`

### فشل التحقق من السلامة

```
⚠️ Integrity check failed: SHA-256 mismatch
```

**الحل**: 
1. احذف الملف من IndexedDB: `await deleteAsset(path)`
2. أعد قياس الملف: `node scripts/measureAssets.js`
3. حدّث manifest: `node scripts/updateManifest.js`

### ذاكرة ممتلئة

```
[IndexedDB] Evicting asset: /models/old-model.glb
```

**ملاحظة**: هذا طبيعي. النظام ينظف تلقائياً الملفات القديمة عند الحاجة.

### فشل الضغط

```
[Compression] CompressionStream not supported
```

**الحل**: المتصفح لا يدعم CompressionStream API. سيتم تخزين الملفات بدون ضغط.

---

## 8. الأداء

### نصائح لتحسين الأداء

1. **استخدم الأولويات بحكمة**
   - `critical`: الموارد الأساسية فقط
   - `high`: موارد اللعبة الرئيسية
   - `medium`: تحسينات بصرية
   - `low`: إضافات اختيارية

2. **اضبط التحميل المتوازي**
   ```typescript
   maxConcurrentLoads: isMobile ? 2 : 4
   ```

3. **استخدم الضغط للملفات الكبيرة**
   ```typescript
   await putAssetCompressed(asset, 5); // فقط إذا > 5MB
   ```

4. **راقب استخدام الذاكرة**
   ```typescript
   const stats = await getCacheStats();
   if (stats.totalSize > stats.maxSize * 0.8) {
       console.warn('الذاكرة المؤقتة شبه ممتلئة');
   }
   ```

---

## 9. أمثلة متقدمة

### تحديث ملف قديم

```typescript
import { getAsset, deleteAsset, putAsset } from '@/lib/indexedDB';
import { verifyAssetIntegrity } from '@/lib/assetIntegrity';

async function updateAsset(path: string, newData: ArrayBuffer, newSHA256: string) {
    // احذف النسخة القديمة
    await deleteAsset(path);
    
    // تحقق من السلامة
    const check = await verifyAssetIntegrity(path, newData, newSHA256);
    if (!check.isValid) {
        throw new Error('البيانات الجديدة تالفة');
    }
    
    // خزّن النسخة الجديدة
    await putAsset({
        id: path,
        name: path.split('/').pop(),
        type: 'arraybuffer',
        size: newData.byteLength,
        createdAt: Date.now(),
        accessedAt: Date.now(),
        priority: 5,
        data: newData
    });
}
```

### تحميل انتقائي

```typescript
import { GAME_ASSET_MANIFEST } from '@/lib/gameAssetManifest';

// حمّل فقط الموارد الحرجة والعالية الأولوية
const priorityAssets = GAME_ASSET_MANIFEST.filter(
    asset => asset.priority === 'critical' || asset.priority === 'high'
);

for (const asset of priorityAssets) {
    await loadAndStore(asset);
}
```

---

## 10. الدعم الفني

للمشاكل أو الأسئلة:
1. راجع القسم "استكشاف الأخطاء" أعلاه
2. تحقق من console logs للمعلومات التفصيلية
3. راجع [walkthrough.md](file:///home/mohamed/.gemini/antigravity/brain/b87d1143-0323-4092-b094-43cc4bbb88aa/walkthrough.md) للتفاصيل الكاملة

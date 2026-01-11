# Enhanced IndexedDB System Usage Guide

## Overview

This guide explains how to use the enhanced IndexedDB system in the Boby's World project.

---

## 1. Measuring Game Resources

### Basic Command

```bash
# Measure all resources
npm run script:measure
```

### Results

A file `scripts/measured-assets.json` will be created containing:

- SHA-256 checksum for each file
- Actual size in bytes
- Last modification date
- Comparison with estimated sizes

### Update Manifest

```bash
# Update gameAssetManifest.ts with real data
npm run script:update-manifest
```

A backup will be created automatically before updating.

---

## 2. File Integrity Verification

### Simple Usage

```typescript
import { verifyAssetIntegrity } from "@/lib/assetIntegrity";

const data = await fetch("/models/dog.glb").then((r) => r.arrayBuffer());

const check = await verifyAssetIntegrity(
  "/models/dog.glb",
  data,
  "a3f5c9b2...", // SHA-256 (optional)
  913555 // Expected size in bytes (optional)
);

if (!check.isValid) {
  console.error(`Corrupted file: ${check.error}`);
  // Reload or notify user
}
```

### Multiple Verification

```typescript
import { verifyMultipleAssets } from "@/lib/assetIntegrity";

const report = await verifyMultipleAssets([
  { path: "/models/dog.glb", data: buffer1, expectedSHA256: "..." },
  { path: "/models/coin.glb", data: buffer2, expectedSHA256: "..." },
]);

console.log(`Verified: ${report.passed}/${report.totalChecked}`);
console.log(`Failed: ${report.failed}`);
```

---

## 3. Compression System

### Storage with Automatic Compression

```typescript
import { putAssetCompressed } from "@/lib/indexedDBCompression";

const asset = {
  id: "/models/large-model.glb",
  name: "Large Model",
  type: "arraybuffer",
  size: data.byteLength,
  createdAt: Date.now(),
  accessedAt: Date.now(),
  priority: 5,
  data: data,
};

// Will be compressed automatically if size > 5MB
await putAssetCompressed(asset, 5);
```

### Retrieval with Automatic Decompression

```typescript
import { getAssetDecompressed } from "@/lib/indexedDBCompression";

const asset = await getAssetDecompressed("/models/large-model.glb");
// Data is decompressed automatically
```

### Compression Benefits Analysis

```typescript
import { calculateCompressionBenefit } from "@/lib/indexedDBCompression";

const benefit = await calculateCompressionBenefit(arrayBuffer);

console.log(`Original size: ${benefit.originalSizeMB}MB`);
console.log(`After compression: ${benefit.compressedSizeMB}MB`);
console.log(`Savings: ${benefit.reductionPercent.toFixed(1)}%`);
console.log(`Worth compressing: ${benefit.worthCompressing ? "Yes" : "No"}`);
```

---

## 4. Enhanced Initial Loading System

### Basic Usage

```typescript
import { initialAssetPreloader } from "@/lib/initialAssetPreloader";

const success = await initialAssetPreloader.preloadAllAssets({
  onProgress: (progress) => {
    console.log(`Progress: ${progress.loadedAssets}/${progress.totalAssets}`);
    console.log(`Size: ${progress.loadedSizeMB}/${progress.totalSizeMB}MB`);
    console.log(`Speed: ${progress.downloadSpeed.toFixed(2)}MB/s`);
    console.log(`Verified: ${progress.verifiedAssets}`);
    console.log(`Corrupted: ${progress.corruptedAssets}`);
  },
  maxConcurrentLoads: 3,
  timeoutMs: 300000,
  retryAttempts: 3,
});

if (success) {
  console.log("All resources loaded successfully!");
} else {
  console.error("Some resources failed to load");
}
```

### Get Status

```typescript
const status = initialAssetPreloader.getPreloadStatus();
const stats = initialAssetPreloader.getPreloadStats();

console.log(`Completion rate: ${stats.completionRate}%`);
console.log(`Success rate: ${stats.successRate}%`);
console.log(`Errors: ${stats.errors}`);
```

---

## 5. Basic IndexedDB

### Storage

```typescript
import { putAsset } from "./indexedDB";

const asset = {
  id: "/models/dog.glb",
  name: "Dog Character",
  type: "arraybuffer",
  size: data.byteLength,
  createdAt: Date.now(),
  accessedAt: Date.now(),
  priority: 10,
  data: data,
};

await putAsset(asset);
```

### Retrieval

```typescript
import { getAsset } from "./indexedDB";

const asset = await getAsset("/models/dog.glb");

if (asset) {
  console.log(`Found: ${asset.name}`);
  // Use asset.data
} else {
  console.log("File not in cache");
}
```

### Cache Statistics

```typescript
import { getCacheStats } from "./indexedDB";

const stats = await getCacheStats();

console.log(`Stored files: ${stats.totalItems}`);
console.log(`Used space: ${stats.totalSize / (1024 * 1024)}MB`);
console.log(`Maximum: ${stats.maxSize / (1024 * 1024)}MB`);
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

---

## 6. User Interface

### InitialAssetLoader Component

```tsx
import InitialAssetLoader from "@/components/InitialAssetLoader";

<InitialAssetLoader
  onComplete={() => {
    console.log("Loading completed!");
    // Navigate to game
  }}
  onError={(error) => {
    console.error("Loading failed:", error);
    // Show error message to user
  }}
/>;
```

---

## 7. Troubleshooting

### Missing File

```
✗ Error: File not found: /models/missing.glb
```

**Solution**: Make sure the file exists in `/public` and is listed in `gameAssetManifest.ts`

### Integrity Verification Failure

```
⚠️ Integrity check failed: SHA-256 mismatch
```

**Solution**:

1. Delete the file from IndexedDB: `await deleteAsset(path)`
2. Re-measure the file: `npm run script:measure`
3. Update manifest: `npm run script:update-manifest`

### Full Memory

```
[IndexedDB] Evicting asset: /models/old-model.glb
```

**Note**: This is normal. The system automatically cleans old files when needed.

### Compression Failure

```
[Compression] CompressionStream not supported
```

**Solution**: The browser doesn't support CompressionStream API. Files will be stored without compression.

---

## 8. Performance

### Performance Optimization Tips

1. **Use Priorities Wisely**

   - `critical`: Only essential resources
   - `high`: Main game resources
   - `medium`: Visual improvements
   - `low`: Optional additions

2. **Adjust Parallel Loading**

   ```typescript
   maxConcurrentLoads: isMobile ? 2 : 4;
   ```

3. **Use Compression for Large Files**

   ```typescript
   await putAssetCompressed(asset, 5); // Only if > 5MB
   ```

4. **Monitor Memory Usage**
   ```typescript
   const stats = await getCacheStats();
   if (stats.totalSize > stats.maxSize * 0.8) {
     console.warn("Cache almost full");
   }
   ```

---

## 9. Advanced Examples

### Update Old File

```typescript
import { getAsset, deleteAsset, putAsset } from "@/lib/indexedDB";
import { verifyAssetIntegrity } from "@/lib/assetIntegrity";

async function updateAsset(
  path: string,
  newData: ArrayBuffer,
  newSHA256: string
) {
  // Delete old version
  await deleteAsset(path);

  // Verify integrity
  const check = await verifyAssetIntegrity(path, newData, newSHA256);
  if (!check.isValid) {
    throw new Error("New data is corrupted");
  }

  // Store new version
  await putAsset({
    id: path,
    name: path.split("/").pop(),
    type: "arraybuffer",
    size: newData.byteLength,
    createdAt: Date.now(),
    accessedAt: Date.now(),
    priority: 5,
    data: newData,
  });
}
```

### Selective Loading

```typescript
import { GAME_ASSET_MANIFEST } from "@/lib/gameAssetManifest";

// Load only critical and high priority resources
const priorityAssets = GAME_ASSET_MANIFEST.filter(
  (asset) => asset.priority === "critical" || asset.priority === "high"
);

for (const asset of priorityAssets) {
  await loadAndStore(asset);
}
```

---

## 10. Technical Support

For issues or questions:

1. Review the "Troubleshooting" section above
2. Check console logs for detailed information
3. Refer to [walkthrough.md](file:///home/mohamed/.gemini/antigravity/brain/b87d1143-0323-4092-b094-43cc4bbb88aa/walkthrough.md) for complete details

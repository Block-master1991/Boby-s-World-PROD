# Advanced IndexedDB Management System

An advanced IndexedDB management system designed to efficiently and professionally manage game resources.

## Key Features

### 🗄️ Database Management

- **Automatic Versioning**: Automatic database upgrade while preserving data
- **Migration**: Data transfer from old versions
- **Multiple Stores**: Separate partitions for data, statistics, and metadata

### 📊 Advanced Statistics

- **Hit/Miss Rate**: Tracking hit and miss rates
- **Cache Size Management**: Automatic cache size management
- **LRU Eviction**: Removing least-used data when needed
- **TTL Support**: Automatic data expiration

### 🔧 Advanced Operations

- **Batch Operations**: Batched operations for improved performance
- **Data Integrity**: Data integrity checking using checksum
- **Retry Logic**: Automatic retry on operation failure
- **Error Handling**: Comprehensive error handling with specific codes

### 📱 Device Support

- **Mobile/Desktop**: Different limits for mobile and desktop devices
- **Performance**: Special optimizations for devices with limited resources
- **Availability Check**: IndexedDB availability check

## Application Programming Interface (API)

### Supported Data Types

```typescript
type DataType = "arraybuffer" | "blob" | "json" | "text" | "uint8array";
```

### Store Resource

```typescript
await putAsset({
  id: "my-texture",
  name: "Grass Texture",
  type: "arraybuffer",
  size: 1024000, // bytes
  priority: 7,
  data: textureData,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});
```

### Retrieve Resource

```typescript
const asset = await getAsset("my-texture");
if (asset) {
  // Use asset.data
}
```

### Cache Statistics

```typescript
const stats = await getCacheStats();
console.log(`Cache size: ${formatBytes(stats.totalSize)}`);
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

## Backward Compatibility

The system maintains compatibility with existing code:

```typescript
// Old methods still work
await putModel("model-name", arrayBuffer);
const data = await getModel("model-name");
```

## Limits and Constraints

- **Mobile**: 50MB, maximum 100 resources
- **Desktop**: 200MB, maximum 500 resources
- **TTL**: Automatic cleanup every 5 minutes
- **Migration**: Support for data transfer from version 1

## Developer Tools

### Data Export/Import

```typescript
// Export all data for backup
const backup = await exportData();

// Import data from backup
await importData(backup);
```

### Manual Cleanup

```typescript
// Clean expired data
const cleaned = await cleanExpiredAssets();

// Delete specific resource
await deleteAsset("asset-id");

// Clear all resources
await clearAssets();
```

## Performance

- **Indexing**: Multiple indexes for fast search
- **Transactions**: Optimized transactions for performance
- **Memory Management**: Automatic memory management
- **Background Cleanup**: Periodic cleanup in background

## Error Handling

```typescript
try {
  await putAsset(asset);
} catch (error) {
  if (error instanceof IndexedDBError) {
    console.error(`IndexedDB Error [${error.code}]:`, error.message);
  }
}
```

## Settings

Settings can be customized through environment variables:

```typescript
// Future environment variables can be added
// INDEXEDDB_MAX_SIZE
// INDEXEDDB_MAX_ITEMS
// INDEXEDDB_CLEANUP_INTERVAL
```

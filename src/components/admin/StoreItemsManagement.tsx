"use client";

import { useStoreItemsManagement } from "@/hooks/store/useStoreItemsManagement";
import { StoreItemsGrid } from "./store/StoreItemsGrid";
import { StoreItemsStats } from "./store/StoreItemsStats";
import { StoreManagementHeader } from "./store/StoreManagementHeader";

export function StoreItemsManagement() {
  const s = useStoreItemsManagement();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <StoreManagementHeader
        loading={s.loading}
        initializing={s.initializing}
        migrating={s.migrating}
        migratingImages={s.migratingImages}
        uploading={s.uploading}
        isDialogOpen={s.isDialogOpen}
        setIsDialogOpen={s.setIsDialogOpen}
        formData={s.formData}
        setFormData={s.setFormData}
        isEditing={!!s.editingItem}
        onRefresh={s.loadItems}
        onInitialize={s.initializeItems}
        onMigrateInventory={s.runMigration}
        onMigrateImages={s.runImageMigration}
        onImageUpload={s.handleImageUpload}
        onSave={s.saveItem}
        onResetForm={s.resetForm}
      />

      <StoreItemsStats items={s.items} loading={s.loading} />

      <StoreItemsGrid
        items={s.items}
        loading={s.loading}
        onEdit={s.openEditDialog}
        onDelete={s.deleteItem}
        onInitialize={s.initializeItems}
      />
    </div>
  );
}

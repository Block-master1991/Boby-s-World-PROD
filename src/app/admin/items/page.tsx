"use client";

import { AdminItemForm } from "@/components/admin/items/AdminItemForm";
import { AdminItemsGrid } from "@/components/admin/items/AdminItemsGrid";
import { AdminItemsHeader } from "@/components/admin/items/AdminItemsHeader";
import { AdminItemsStats } from "@/components/admin/items/AdminItemsStats";
import { useAdminItems } from "@/hooks/admin/useAdminItems";

function PageHeader({ logic }: { logic: ReturnType<typeof useAdminItems> }) {
  return (
    <AdminItemsHeader
      loading={logic.loading}
      initializing={logic.initializing}
      migrating={logic.migrating}
      onInitialize={logic.initializeItems}
      onRefresh={logic.loadItems}
      onMigrate={logic.runMigration}
      onResetForm={logic.resetForm}
      isDialogOpen={logic.isDialogOpen}
      setIsDialogOpen={logic.setIsDialogOpen}
      isMigrationDialogOpen={logic.isMigrationDialogOpen}
      setIsMigrationDialogOpen={logic.setIsMigrationDialogOpen}
      editingItem={!!logic.editingItem}
    >
      <AdminItemForm
        formData={logic.formData}
        setFormData={logic.setFormData}
        onCancel={() => logic.setIsDialogOpen(false)}
        onSave={logic.saveItem}
        isEditing={!!logic.editingItem}
      />
    </AdminItemsHeader>
  );
}

export default function AdminItemsPage() {
  const logic = useAdminItems();

  return (
    <div className="container mx-auto p-6">
      <PageHeader logic={logic} />
      <AdminItemsStats items={logic.items} />
      <AdminItemsGrid
        items={logic.items}
        loading={logic.loading}
        initializing={logic.initializing}
        onEdit={logic.openEditDialog}
        onDelete={logic.deleteItem}
        onInitialize={logic.initializeItems}
      />
    </div>
  );
}

'use client';

import { AdminItemCard } from '@/components/admin/items/AdminItemCard';
import { Button } from '@/components/ui/button';
import type { StoreItemDocument } from '@/types/database';
import { Package, Plus } from 'lucide-react';

interface AdminItemsGridProps {
  items: StoreItemDocument[];
  loading: boolean;
  initializing: boolean;
  onEdit: (item: StoreItemDocument) => void;
  onDelete: (itemId: string) => void;
  onInitialize: () => void;
}

export function AdminItemsGrid({
  items,
  loading,
  initializing,
  onEdit,
  onDelete,
  onInitialize,
}: AdminItemsGridProps) {
  if (loading) {
    return <div className="text-center py-8">Loading items...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No items found</h3>
        <p className="text-muted-foreground mb-4">
          Get started by initializing the default store items or adding your first item.
        </p>
        <Button onClick={onInitialize} disabled={initializing}>
          <Plus className="h-4 w-4 mr-2" />
          Initialize Default Items
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item) => (
        <AdminItemCard key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}

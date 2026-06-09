"use client";

import { Button } from "@/components/ui/button";
import type { StoreItem } from "@/hooks/store/useStoreItemsManagement";
import { Package } from "lucide-react";
import React from "react";
import { AdminItemSkeleton } from "../AdminItemSkeleton";
import { StoreItemCard } from "./StoreItemCard";

interface StoreItemsGridProps {
  items: StoreItem[];
  loading: boolean;
  onEdit: (item: StoreItem) => void;
  onDelete: (item: StoreItem) => void;
  onInitialize: () => void;
}

export const StoreItemsGrid: React.FC<StoreItemsGridProps> = ({
  items,
  loading,
  onEdit,
  onDelete,
  onInitialize,
}) => {
  if (loading)
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <AdminItemSkeleton key={i} />
        ))}
      </div>
    );

  if (items.length === 0)
    return (
      <div className="text-center py-20 bg-card/50 rounded-2xl border-2 border-dashed border-muted/50">
        <Package className="h-20 w-20 mx-auto text-muted-foreground/30 mb-4 animate-bounce" />
        <h3 className="text-xl font-bold">No items found</h3>
        <p className="text-muted-foreground mb-6">
          Your store is currently empty. Initialize default items to get started.
        </p>
        <Button
          onClick={onInitialize}
          size="lg"
          className="shadow-lg hover:shadow-xl transition-all"
        >
          Initialize Defaults
        </Button>
      </div>
    );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map(item => (
        <StoreItemCard key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
};

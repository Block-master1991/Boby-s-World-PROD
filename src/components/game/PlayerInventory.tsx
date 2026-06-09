/**
 * Component for player inventory management
 */

"use client";

import InventoryItemSkeleton from "@/components/shared/InventoryItemSkeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useInventoryData } from "@/hooks/misc/useInventoryData";
import Image from "next/image";
import React from "react";
import InventoryItemCard from "./InventoryItemCard";
import InventoryState from "./InventoryState";

interface PlayerInventoryProps {
  onUseConsumableItem: (itemId: string, amount: number) => Promise<void>;
  speedyPawsTreatCount: number;
  guardianShieldCount: number;
  protectionBottleCount: number;
  coinMagnetTreatCount: number;
}

const PlayerInventory: React.FC<PlayerInventoryProps> = props => {
  const {
    showSkeletons,
    graphqlError,
    storeItemsLoaded,
    aggregatedInventory,
    useItemLoading,
    handleUseItem,
    refetchInventory,
  } = useInventoryData(props, props.onUseConsumableItem);

  return (
    <>
      <SheetHeader className="p-6 pb-4 border-b">
        <SheetTitle className="text-2xl font-headline flex items-center gap-2">
          <Image src="/PlayerInventory.png" alt="Icon" width={28} height={28} className="h-7 w-7" />{" "}
          Inventory
        </SheetTitle>
        <SheetDescription>Items you own and the count of each.</SheetDescription>
      </SheetHeader>
      <ScrollArea className="flex-grow">
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {showSkeletons && (
            <>
              <InventoryItemSkeleton />
              <InventoryItemSkeleton />
              <InventoryItemSkeleton />
              <InventoryItemSkeleton />
            </>
          )}
          {!showSkeletons && graphqlError && (
            <InventoryState type="error" onRetry={refetchInventory} />
          )}
          {!showSkeletons &&
            !graphqlError &&
            storeItemsLoaded &&
            aggregatedInventory.length === 0 && <InventoryState type="empty" />}
          {!showSkeletons &&
            !graphqlError &&
            storeItemsLoaded &&
            aggregatedInventory.map(item => (
              <InventoryItemCard
                key={item.definition.id}
                definition={item.definition}
                currentCount={item.count}
                isLoading={useItemLoading}
                onUse={handleUseItem}
              />
            ))}
        </div>
      </ScrollArea>
      <SheetFooter className="p-4 border-t mt-auto" />
    </>
  );
};

export default PlayerInventory;

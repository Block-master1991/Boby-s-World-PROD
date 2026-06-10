/**
 * Component for individual inventory item cards
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoreItemDefinition } from "@/lib/items";
import Image from "next/image";
import React, { useCallback, useState } from "react";
import ItemQuantitySelector from "./ItemQuantitySelector";

interface InventoryItemCardProps {
  definition: StoreItemDefinition;
  currentCount: number;
  isLoading: boolean;
  onUse: (itemId: string, amount: number) => Promise<void>;
}

const InventoryItemCard: React.FC<InventoryItemCardProps> = ({
  definition,
  currentCount,
  isLoading,
  onUse,
}) => {
  const [quantity, setQuantity] = useState(1);
  const isAutomated = definition.id === "1"; // Protection Bottle

  const handleQuantityChange = useCallback(
    (val: number) => setQuantity(Math.max(1, Math.min(val, currentCount))),
    [currentCount]
  );
  const handleIncrement = () => setQuantity(p => Math.min(p + 1, currentCount));
  const handleDecrement = () => setQuantity(p => Math.max(p - 1, 1));
  const handleMax = () => setQuantity(currentCount);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex-row items-center gap-3 p-4 space-y-0">
        <Image
          src={definition.image || "https://placehold.co/60x60.png"}
          alt={definition.name}
          width={48}
          height={48}
          className="rounded-md border"
        />
        <div>
          <CardTitle className="text-lg">{definition.name}</CardTitle>
          <Badge variant="secondary" className="mt-1">
            Quantity: {currentCount}
          </Badge>
        </div>
      </CardHeader>
      {definition.description && (
        <CardDescription className="text-xs p-4 pt-2 overflow-auto max-h-32">
          {definition.description}
        </CardDescription>
      )}
      {!isAutomated && currentCount > 0 && (
        <div className="mt-auto p-4">
          <ItemQuantitySelector
            quantity={quantity}
            maxCount={currentCount}
            isDisabled={isLoading}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            onMax={handleMax}
            onChange={handleQuantityChange}
          />
          <Button
            variant="default"
            size="sm"
            className="mt-4 w-full text-xs px-2 py-1"
            onClick={() => onUse(definition.id, quantity)}
            disabled={isLoading}
          >
            {isLoading ? "Using..." : `Use ${quantity} Item(s)`}
          </Button>
        </div>
      )}
    </Card>
  );
};

export default InventoryItemCard;

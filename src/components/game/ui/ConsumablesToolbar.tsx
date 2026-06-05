"use client";

import { Button } from "@/components/ui/button";
import type { StoreItemDefinition } from "@/lib/items";
import Image from "next/image";
import React from "react";

interface ConsumablesToolbarProps {
  coinMagnetTreatDef?: StoreItemDefinition | undefined;
  speedyPawsTreatDef?: StoreItemDefinition | undefined;
  guardianShieldDef?: StoreItemDefinition | undefined;
  coinMagnetTreatCount: number;
  speedyPawsTreatCount: number;
  guardianShieldCount: number;
  isGameEffectivelyPaused: boolean;
  isCoinMagnetActive: boolean;
  isSpeedBoostActive: boolean;
  isShieldActive: boolean;
  onUseConsumableItem: (itemId: string, amount: number) => void;
}

export const ConsumablesToolbar: React.FC<ConsumablesToolbarProps> = ({
  coinMagnetTreatDef,
  speedyPawsTreatDef,
  guardianShieldDef,
  coinMagnetTreatCount,
  speedyPawsTreatCount,
  guardianShieldCount,
  isGameEffectivelyPaused,
  isCoinMagnetActive,
  isSpeedBoostActive,
  isShieldActive,
  onUseConsumableItem,
}) => (
  <div className="absolute bottom-[calc(4rem+var(--sab))] left-[calc(0.5rem+var(--sal))] z-10 flex flex-col space-y-3">
    {coinMagnetTreatDef && (
      <Button
        onClick={() => onUseConsumableItem("4", 1)}
        disabled={coinMagnetTreatCount === 0 || (isGameEffectivelyPaused && !isCoinMagnetActive)}
        className="relative h-14 w-14 p-0 bg-transparent hover:bg-transparent shadow-none"
      >
        <Image
          src="/items/coinMagnetTreat.png"
          alt="Coin Magnet"
          width={56}
          height={56}
          className="h-full w-full object-contain"
        />
        {coinMagnetTreatCount > 0 && (
          <span className="absolute -bottom-1 -right-1 text-black font-bold text-xs flex items-center justify-center">
            {coinMagnetTreatCount}
          </span>
        )}
      </Button>
    )}
    {speedyPawsTreatDef && (
      <Button
        onClick={() => onUseConsumableItem("3", 1)}
        disabled={speedyPawsTreatCount === 0 || (isGameEffectivelyPaused && !isSpeedBoostActive)}
        className="relative h-14 w-14 p-0 bg-transparent hover:bg-transparent shadow-none"
      >
        <Image
          src="/items/speedyPawsTreat.png"
          alt="Speedy Paws"
          width={56}
          height={56}
          className="h-full w-full object-contain"
        />
        {speedyPawsTreatCount > 0 && (
          <span className="absolute -bottom-1 -right-1 text-black font-bold text-xs flex items-center justify-center">
            {speedyPawsTreatCount}
          </span>
        )}
      </Button>
    )}
    {guardianShieldDef && (
      <Button
        onClick={() => onUseConsumableItem("2", 1)}
        disabled={guardianShieldCount === 0 || (isGameEffectivelyPaused && !isShieldActive)}
        className="relative h-14 w-14 p-0 bg-transparent hover:bg-transparent shadow-none"
      >
        <Image
          src="/items/guardianShield.png"
          alt="Guardian Shield"
          width={56}
          height={56}
          className="h-full w-full object-contain"
        />
        {guardianShieldCount > 0 && (
          <span className="absolute -bottom-1 -right-1 text-black font-bold text-xs flex items-center justify-center">
            {guardianShieldCount}
          </span>
        )}
      </Button>
    )}
  </div>
);

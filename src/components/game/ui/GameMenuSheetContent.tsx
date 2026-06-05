"use client";

import DogMovement from "@/components/game/DogMovement";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import type { PublicKey } from "@solana/web3.js";
import { Trophy, Users } from "lucide-react";
import React from "react";
import { MenuBanners } from "./MenuBanners";
import { SecuritySection } from "./SecuritySection";

interface GameMenuSheetContentProps {
  isWalletMismatch: boolean;
  isAuthenticated: boolean;
  authUserPublicKey: string | undefined;
  sessionPublicKey: PublicKey | null;
  adapterPublicKey: PublicKey | null;
}

const GameMenuSheetContent: React.FC<GameMenuSheetContentProps> = ({
  isWalletMismatch,
  isAuthenticated,
  sessionPublicKey,
  adapterPublicKey,
}) => {
  const { securityLevel, isOnline, performanceStats } = useAuth();

  return (
    <>
      <SheetHeader className="p-4 pb-2 border-b">
        <SheetTitle className="text-2xl font-headline">Game Menu</SheetTitle>
        <MenuBanners
          isWalletMismatch={isWalletMismatch}
          isAuthenticated={isAuthenticated}
          sessionPublicKey={sessionPublicKey}
          adapterPublicKey={adapterPublicKey}
        />
      </SheetHeader>
      <ScrollArea className="flex-grow">
        <div className="p-4 space-y-3">
          <Button
            variant="ghost"
            className="w-full justify-start text-base py-3"
            disabled={isWalletMismatch}
          >
            <Users className="mr-2 rtl:ml-2 h-5 w-5" /> Friends
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-base py-3"
            disabled={isWalletMismatch}
          >
            <Trophy className="mr-2 rtl:ml-2 h-5 w-5" /> Achievements
          </Button>

          {isAuthenticated && (
            <SecuritySection
              securityLevel={securityLevel}
              isOnline={isOnline}
              performanceStats={performanceStats}
            />
          )}

          <DogMovement />
        </div>
      </ScrollArea>
      <SheetFooter className="p-4 border-t mt-auto flex flex-col sm:flex-col space-y-2 sm:space-y-2 sm:justify-start" />
    </>
  );
};

export default GameMenuSheetContent;

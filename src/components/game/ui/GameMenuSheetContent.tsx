"use client";

import DisconnectButton from "@/components/shared/DisconnectButton";
import DogMovement from "@/components/game/DogMovement";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

/**
 * UserInfoCard - Displays user connection status and address inside the menu
 */
const UserInfoCard: React.FC<{ authUserPublicKey: string }> = ({ authUserPublicKey }) => (
  <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-xl">
    <CardContent className="p-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
          <div className="font-mono text-xs sm:text-sm bg-muted px-2 py-1 rounded border break-all flex-grow sm:flex-grow-0">
            {authUserPublicKey.substring(0, 4)}...
            {authUserPublicKey.substring(authUserPublicKey.length - 4)}
          </div>
        </div>
        <DisconnectButton
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs border-destructive/20 hover:border-destructive/40 flex-shrink-0 w-full sm:w-auto"
          redirectPath="/"
        />
      </div>
    </CardContent>
  </Card>
);

const GameMenuSheetContent: React.FC<GameMenuSheetContentProps> = ({
  isWalletMismatch,
  isAuthenticated,
  authUserPublicKey,
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
      {isAuthenticated && authUserPublicKey && (
        <div className="px-4 pt-3">
          <UserInfoCard authUserPublicKey={authUserPublicKey} />
        </div>
      )}
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

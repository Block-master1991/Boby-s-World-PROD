"use client";

import BobyPriceDisplay from "@/components/game/BobyPriceDisplay";
import TokenBalance from "@/components/game/TokenBalance";
import DisconnectButton from "@/components/shared/DisconnectButton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PublicKey } from "@solana/web3.js";
import Image from "next/image";
import React from "react";
import { AuthenticatedWalletInfo } from "./AuthenticatedWalletInfo";
import { MenuBanners } from "./MenuBanners";
import { USDTBalanceCard } from "./USDTBalanceCard";

interface PlayerWalletProps {
  isWalletMismatch: boolean;
  isAuthenticated: boolean;
  authUserPublicKey: string | undefined;
  sessionPublicKey: PublicKey | null;
  adapterPublicKey: PublicKey | null;
  isFetchingPlayerUSDT: boolean;
  playerGameUSDT: number;
  MIN_WITHDRAWAL_USDT: number;
  isWithdrawing: boolean;
  onWithdrawUSDT: () => void;
  dbAppOptionsProjectId?: string | null;
}

const PlayerWallet: React.FC<PlayerWalletProps> = props => {
  const firebaseNotConfigured =
    !props.dbAppOptionsProjectId || props.dbAppOptionsProjectId.includes("YOUR_PROJECT_ID");

  return (
    <>
      <SheetHeader className="p-4 pb-2 border-b">
        <SheetTitle className="text-2xl font-headline flex items-center gap-2">
          <Image src="/wallet.png" alt="Wallet Icon" width={28} height={28} className="h-7 w-7" />{" "}
          Wallet
        </SheetTitle>
        <BobyPriceDisplay />
        <MenuBanners
          isWalletMismatch={props.isWalletMismatch}
          isAuthenticated={props.isAuthenticated}
          sessionPublicKey={props.sessionPublicKey}
          adapterPublicKey={props.adapterPublicKey}
        />
      </SheetHeader>
      <ScrollArea className="flex-grow">
        <div className="p-4 space-y-3">
          <TokenBalance />
          <Separator className="my-3" />
          <USDTBalanceCard
            isFetchingPlayerUSDT={props.isFetchingPlayerUSDT}
            playerGameUSDT={props.playerGameUSDT}
            MIN_WITHDRAWAL_USDT={props.MIN_WITHDRAWAL_USDT}
            isWithdrawing={props.isWithdrawing}
            onWithdrawUSDT={props.onWithdrawUSDT}
            isWalletMismatch={props.isWalletMismatch}
            firebaseNotConfigured={firebaseNotConfigured}
          />
          <Separator className="my-3" />
        </div>
      </ScrollArea>
      <SheetFooter className="p-4 border-t mt-auto flex flex-col sm:flex-col space-y-2 sm:space-y-2 sm:justify-start">
        <AuthenticatedWalletInfo
          isAuthenticated={props.isAuthenticated}
          authUserPublicKey={props.authUserPublicKey}
        />
        <DisconnectButton data-testid="disconnect-button-test" />
      </SheetFooter>
    </>
  );
};

export default PlayerWallet;

import InGameStore from "@/components/game/InGameStore";
import PlayerInventory from "@/components/game/PlayerInventory";
import GameMenuSheetContent from "@/components/game/ui/GameMenuSheetContent";
import PlayerWallet from "@/components/game/ui/PlayerWallet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetLoading, SheetTrigger } from "@/components/ui/sheet";
import type { PublicKey } from "@solana/web3.js";
import Image from "next/image";
import React, { useMemo } from "react";

interface GameSheetsProps {
  sheets: { menu: boolean; store: boolean; wallet: boolean; inventory: boolean };
  toggleSheet: (key: "menu" | "store" | "wallet" | "inventory", val: boolean) => void;
  isPaused: boolean;
  isWalletMismatch: boolean;
  isAuthenticated: boolean;
  authUserPublicKey: string | undefined;
  sessionPublicKey: PublicKey | null;
  adapterPublicKey: PublicKey | null;
  isWalletConnectedAndMatching: boolean;
  gameData: {
    isStoreLoading: boolean;
    isInventoryLoading: boolean;
    isWalletLoading: boolean;
    isFetchingPlayerUSDT: boolean;
    fetchPlayerData: () => Promise<void>;
  };
  economy: {
    displayedPlayerGameUSDT: number;
    MIN_WITHDRAWAL_USDT: number;
    isWithdrawing: boolean;
    handleWithdrawUSDT: () => Promise<void>;
  };
  inventory: {
    handleUseConsumableItem: (id: string, amt: number) => Promise<void>;
    displayedSpeedyPawsTreatCount: number;
    displayedGuardianShieldCount: number;
    displayedProtectionBottleCount: number;
    displayedCoinMagnetTreatCount: number;
  };
}

const SheetBtn: React.FC<{ onClick: () => void; disabled: boolean; src: string; alt: string }> = ({
  onClick,
  disabled,
  src,
  alt,
}) => (
  <Button
    onClick={onClick}
    disabled={disabled}
    className="h-12 w-12 overflow-hidden flex items-center justify-center p-0 border-none bg-transparent hover:bg-transparent"
  >
    <Image src={src} alt={alt} width={48} height={48} className="h-full w-full object-contain" />
  </Button>
);

const Wrapper: React.FC<{
  open: boolean;
  setOpen: (v: boolean) => void;
  disabled: boolean;
  src: string;
  alt: string;
  children: React.ReactNode;
}> = ({ open, setOpen, disabled, src, alt, children }) => (
  <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>
      <SheetBtn onClick={() => setOpen(true)} disabled={disabled} src={src} alt={alt} />
    </SheetTrigger>
    <SheetContent
      side="center"
      className="p-0 flex flex-col rounded-xl border-2 shadow-xl overflow-y-auto"
    >
      {children}
    </SheetContent>
  </Sheet>
);

export const GameSheets: React.FC<GameSheetsProps> = p => {
  const {
    sheets: s,
    toggleSheet: t,
    isPaused: iP,
    isWalletMismatch: iWM,
    gameData: gD,
    economy: ec,
    inventory: inv,
  } = p;
  const common = { disabled: (iP && !s.menu) || iWM };

  const menu = useMemo(
    () => (
      <GameMenuSheetContent
        isWalletMismatch={iWM}
        isAuthenticated={p.isAuthenticated}
        authUserPublicKey={p.authUserPublicKey}
        sessionPublicKey={p.sessionPublicKey}
        adapterPublicKey={p.adapterPublicKey}
      />
    ),
    [p, iWM]
  );
  const store = useMemo(
    () => (
      <div className="w-full h-full">
        {gD.isStoreLoading ? (
          <SheetLoading />
        ) : (
          <InGameStore
            isAuthenticated={p.isAuthenticated}
            authUserPublicKey={p.authUserPublicKey}
            isWalletConnectedAndMatching={p.isWalletConnectedAndMatching}
            onPurchaseSuccess={gD.fetchPlayerData}
          />
        )}
      </div>
    ),
    [p, gD]
  );
  const wallet = useMemo(
    () => (
      <div className="w-full h-full">
        {gD.isWalletLoading ? (
          <SheetLoading />
        ) : (
          <PlayerWallet
            isAuthenticated={p.isAuthenticated}
            authUserPublicKey={p.authUserPublicKey}
            isWalletMismatch={iWM}
            sessionPublicKey={p.sessionPublicKey}
            adapterPublicKey={p.adapterPublicKey}
            isFetchingPlayerUSDT={gD.isFetchingPlayerUSDT}
            playerGameUSDT={ec.displayedPlayerGameUSDT}
            MIN_WITHDRAWAL_USDT={ec.MIN_WITHDRAWAL_USDT}
            isWithdrawing={ec.isWithdrawing}
            onWithdrawUSDT={ec.handleWithdrawUSDT}
          />
        )}
      </div>
    ),
    [p, gD, ec, iWM]
  );
  const invent = useMemo(
    () => (
      <div className="w-full h-full">
        {gD.isInventoryLoading ? (
          <SheetLoading />
        ) : (
          <PlayerInventory
            onUseConsumableItem={inv.handleUseConsumableItem}
            speedyPawsTreatCount={inv.displayedSpeedyPawsTreatCount}
            guardianShieldCount={inv.displayedGuardianShieldCount}
            protectionBottleCount={inv.displayedProtectionBottleCount}
            coinMagnetTreatCount={inv.displayedCoinMagnetTreatCount}
          />
        )}
      </div>
    ),
    [gD, inv]
  );

  return (
    <>
      <div className="absolute top-[calc(1rem+var(--sat))] left-[calc(1rem+var(--sal))] z-10">
        <Wrapper
          open={s.menu}
          setOpen={v => t("menu", v)}
          disabled={common.disabled}
          src="/GameMenu.png"
          alt="Menu"
        >
          {menu}
        </Wrapper>
      </div>
      <div className="absolute bottom-[calc(4rem+var(--sab))] right-[calc(0.5rem+var(--sar))] z-10 flex flex-col space-y-3">
        <Wrapper
          open={s.store}
          setOpen={v => t("store", v)}
          disabled={(iP && !s.store) || iWM}
          src="/GameStore-lg.png"
          alt="Store"
        >
          {store}
        </Wrapper>
        <Wrapper
          open={s.wallet}
          setOpen={v => t("wallet", v)}
          disabled={(iP && !s.wallet) || iWM}
          src="/wallet.png"
          alt="Wallet"
        >
          {wallet}
        </Wrapper>
        <Wrapper
          open={s.inventory}
          setOpen={v => t("inventory", v)}
          disabled={(iP && !s.inventory) || iWM}
          src="/PlayerInventory.png"
          alt="Inventory"
        >
          {invent}
        </Wrapper>
      </div>
    </>
  );
};

"use client";

import { TOTPVerificationDialog } from "@/components/auth/TOTPVerificationDialog";
import { PurchaseStatusOverlay } from "@/components/game/PurchaseStatusOverlay";
import StoreItemSkeleton from "@/components/shared/StoreItemSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuthContext } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSessionWallet } from "@/hooks/useSessionWallet";
import { useActiveStoreItems } from "@/hooks/useStoreItems";
import { useStorePurchase } from "@/hooks/useStorePurchase";
import { useStoreState } from "@/hooks/useStoreState";
import type { StoreItemDefinition } from "@/lib/server-items";
import { useConnection } from "@solana/wallet-adapter-react";
import type { PublicKey } from "@solana/web3.js";
import { AlertCircle, Minus, PawPrint, Plus, RefreshCw, Send } from "lucide-react";
import Image from "next/image";
import React from "react";

interface InGameStoreProps {
  isAuthenticated: boolean;
  authUserPublicKey: string | undefined;
  isWalletConnectedAndMatching: boolean;
  onPurchaseSuccess?: () => Promise<void>;
}

const BOBY_TOKEN_DECIMALS = 6;

const StorePriceInfo: React.FC<{
  bobyUsdPrice: number | null;
  isBobyPriceLoading: boolean;
  bobyPriceError: string | null;
  onRefresh: () => void;
}> = ({ bobyUsdPrice, isBobyPriceLoading, bobyPriceError, onRefresh }) => {
  if (bobyPriceError)
    return (
      <div className="flex flex-col items-center justify-center py-4 text-xs text-destructive">
        <p className="flex items-center">
          <AlertCircle className="h-3 w-3 mr-1" /> {bobyPriceError}
        </p>
        <Button
          variant="link"
          size="sm"
          onClick={onRefresh}
          className="text-destructive h-auto p-0"
        >
          Retry
        </Button>
      </div>
    );
  if (!bobyUsdPrice || bobyUsdPrice <= 0)
    return isBobyPriceLoading ? (
      <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
        <PawPrint className="h-3 w-3 mr-1 animate-pulse" /> Loading Price...
      </div>
    ) : null;
  return (
    <div className="text-[10px] text-muted-foreground text-center mb-2 p-1 bg-secondary/30 rounded flex items-center justify-center">
      1 BOBY = ${bobyUsdPrice.toLocaleString(undefined, { maximumFractionDigits: 10 })}
      <Button variant="ghost" size="icon" onClick={onRefresh} className="ml-1 h-4 w-4">
        {isBobyPriceLoading ? (
          <PawPrint className="h-2 w-2 animate-pulse" />
        ) : (
          <RefreshCw className="h-2 w-2" />
        )}
      </Button>
    </div>
  );
};

interface ItemCardProps {
  item: StoreItemDefinition;
  qty: number;
  price: number | null;
  loading: boolean;
  disabled: boolean;
  onBuy: (i: StoreItemDefinition, q: number) => Promise<void>;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onChg: (id: string, v: string) => void;
}

const StoreItemCard: React.FC<ItemCardProps> = ({
  item,
  qty,
  price,
  loading,
  disabled,
  onBuy,
  onInc,
  onDec,
  onChg,
}) => (
  <Card className="flex flex-col">
    <CardHeader className="flex-row items-center gap-2 p-3 space-y-0">
      <Image src={item.image} alt={item.name} width={40} height={40} className="rounded border" />
      <div className="min-w-0 flex-1">
        <CardTitle className="text-sm truncate">{item.name}</CardTitle>
        <p className="text-xs font-bold text-primary">${item.price.toFixed(3)}</p>
      </div>
    </CardHeader>
    <CardContent className="p-3 pt-0 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDec(item.id)}
            disabled={qty <= 1}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="number"
            value={qty}
            onChange={e => onChg(item.id, e.target.value)}
            className="h-7 w-12 text-center text-xs p-0"
          />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onInc(item.id)}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground underline decoration-primary/30">Total</p>
          <p className="text-xs font-bold">
            {price
              ? ((item.price * qty) / price).toLocaleString(undefined, {
                  maximumFractionDigits: BOBY_TOKEN_DECIMALS,
                })
              : "--"}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => {
          onBuy(item, qty).catch(() => {});
        }}
        disabled={disabled || loading}
        className="w-full text-xs h-8"
      >
        {loading ? (
          <span className="animate-pulse">Wait...</span>
        ) : (
          <>
            <Send className="mr-1 h-3 w-3" /> Purchase
          </>
        )}
      </Button>
    </CardContent>
  </Card>
);

const StoreGrid: React.FC<{
  items: StoreItemDefinition[];
  state: ReturnType<typeof useStoreState>;
  purchase: ReturnType<typeof useStorePurchase>;
  onBuy: (item: StoreItemDefinition, qty: number) => Promise<void>;
  auth: boolean;
  wall: boolean;
}> = ({ items, state, purchase, onBuy, auth, wall }) => {
  if (!auth || !wall)
    return (
      <div className="text-center py-10 text-xs text-muted-foreground">
        Reconnect wallet to browse.
      </div>
    );
  if (state.showSkeletons && items.length === 0)
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array(4)
          .fill(0)
          .map((_, i) => (
            <StoreItemSkeleton key={i} />
          ))}
      </div>
    );
  if (items.length === 0)
    return <div className="text-center py-10 text-xs text-muted-foreground">Empty store.</div>;
  const disabled = purchase.isLoading !== null || state.isBobyPriceLoading || !state.bobyUsdPrice;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map(it => (
        <StoreItemCard
          key={it.id}
          item={it}
          qty={state.quantities[it.id] || 1}
          price={state.bobyUsdPrice}
          loading={purchase.isLoading === it.id}
          disabled={disabled}
          onBuy={onBuy}
          onInc={state.handleIncrement}
          onDec={state.handleDecrement}
          onChg={state.handleQuantityChange}
        />
      ))}
    </div>
  );
};

const InGameStore: React.FC<InGameStoreProps> = ({
  isAuthenticated,
  authUserPublicKey,
  isWalletConnectedAndMatching,
  onPurchaseSuccess,
}) => {
  const { connection } = useConnection();
  const { isWalletMismatch, sendTransaction, wallet, adapterPublicKey } = useSessionWallet();
  const isMobile = useIsMobile();
  const { items, loading } = useActiveStoreItems();
  const state = useStoreState(items, loading);
  const { hasPasskey, totpEnabled, authMethod } = useAuthContext();
  const [passkeySupported, setPasskeySupported] = React.useState(false);
  const [totpResolver, setTotpResolver] = React.useState<{
    resolve: (v: string | null) => void;
  } | null>(null);
  const [pendingPurchase, setPendingPurchase] = React.useState<{
    item: StoreItemDefinition;
    qty: number;
  } | null>(null);
  const [isAuthChoiceOpen, setIsAuthChoiceOpen] = React.useState(false);

  React.useEffect(() => {
    const checkPasskeySupport = async () => {
      if (typeof window === "undefined" || !("PublicKeyCredential" in window)) {
        setPasskeySupported(false);
        return;
      }

      const isAvailable =
        typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
          ? await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
          : true;

      setPasskeySupported(isAvailable);
    };

    checkPasskeySupport().catch(() => {});
  }, []);

  const purchase = useStorePurchase({
    isAuthenticated,
    isWalletConnectedAndMatching,
    authUserPublicKey,
    wallet: wallet as { publicKey: PublicKey | null } | null,
    sendTransaction,
    connection,
    adapterPublicKey,
    isWalletMismatch,
    isMobile,
    bobyUsdPrice: state.bobyUsdPrice,
    onPurchaseSuccess,
    hasPasskey,
    totpEnabled,
    authMethod,
    onTOTPRequired: () =>
      new Promise<string | null>(resolve => {
        setTotpResolver({ resolve });
      }),
  });

  const requestPurchase = async (item: StoreItemDefinition, qty: number) => {
    const sessionPreferredMethod =
      authMethod === "biometric"
        ? "passkey"
        : authMethod === "totp" || authMethod === "mfa"
        ? "totp"
        : totpEnabled
        ? "totp"
        : undefined;

    if (!sessionPreferredMethod && isMobile && hasPasskey && totpEnabled && passkeySupported) {
      setPendingPurchase({ item, qty });
      setIsAuthChoiceOpen(true);
      return;
    }

    await purchase.handlePurchase(item, qty, sessionPreferredMethod);
  };

  const handleAuthMethodSelection = async (method: "passkey" | "totp") => {
    if (!pendingPurchase) return;
    setIsAuthChoiceOpen(false);
    const { item, qty } = pendingPurchase;
    setPendingPurchase(null);
    await purchase.handlePurchase(item, qty, method);
  };

  return (
    <>
      <SheetHeader className="p-4 pb-2 border-b">
        <SheetTitle className="text-xl font-headline flex items-center gap-1.5">
          <Image src="/GameStore-lg.png" alt="S" width={24} height={24} /> Store
        </SheetTitle>
        <SheetDescription className="text-xs">Power up with Boby.</SheetDescription>
        {isWalletMismatch && (
          <div className="mt-1 p-1.5 text-[10px] bg-destructive/10 text-destructive rounded-sm border flex items-center gap-1">
            <AlertCircle size={12} /> <span>Wallet mismatch.</span>
          </div>
        )}
      </SheetHeader>
      <ScrollArea className="flex-grow">
        <div className="p-3 pb-0">
          <StorePriceInfo {...state} onRefresh={state.fetchBobyUsdPrice} />
        </div>
        <div className="p-4 pt-0">
          <StoreGrid
            items={items}
            state={state}
            purchase={purchase}
            onBuy={requestPurchase}
            auth={isAuthenticated}
            wall={isWalletConnectedAndMatching}
          />
        </div>
      </ScrollArea>
      <SheetFooter className="p-3 border-t text-[10px] text-muted-foreground text-center">
        Confirm rates before buying.
      </SheetFooter>
      <PurchaseStatusOverlay
        progress={purchase.purchaseProgress}
        onClose={() => purchase.setPurchaseProgress({ phase: "idle", message: "" })}
      />

      <Dialog open={isAuthChoiceOpen} onOpenChange={open => {
        if (!open) {
          setIsAuthChoiceOpen(false);
          setPendingPurchase(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose verification method</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Please choose a verification method to proceed with your purchase.
            </p>
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={() => handleAuthMethodSelection("passkey")}
                disabled={purchase.isLoading !== null}
              >
                Use device passkey
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleAuthMethodSelection("totp")}
                disabled={purchase.isLoading !== null}
              >
                Use authenticator app
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TOTPVerificationDialog
        isOpen={!!totpResolver}
        onOpenChange={open => {
          if (!open && totpResolver) {
            totpResolver.resolve(null);
            setTotpResolver(null);
          }
        }}
        onVerify={async token => {
          if (totpResolver) {
            totpResolver.resolve(token);
            setTotpResolver(null);
          }
          await Promise.resolve();
        }}
        loading={purchase.isLoading !== null}
      />
    </>
  );
};

export default InGameStore;

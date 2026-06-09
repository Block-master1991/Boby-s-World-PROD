"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessionWallet } from "@/hooks/auth/useSessionWallet";
import {
  BOBY_TOKEN_MINT_ADDRESS,
  LAMPORTS_PER_SOL,
  USDT_TOKEN_MINT_ADDRESS,
} from "@/lib/constants";
import { logger } from "@/utils/logger";
import { useConnection } from "@solana/wallet-adapter-react";
import type { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { AlertTriangle, PawPrint, WalletCards } from "lucide-react";
import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type ErrorType = "rpc" | "other" | null;

// --- Helpers ---

const getErrorMessage = (error: unknown): ErrorType => {
  if (error instanceof Error && error.message.includes("RPC")) return "rpc";
  return "other";
};

const fetchSolBalance = async (conn: Connection, pubkey: PublicKey): Promise<number> => {
  const lamports = await conn.getBalance(pubkey);
  return lamports / LAMPORTS_PER_SOL;
};

const fetchSplBalance = async (
  conn: Connection,
  owner: PublicKey,
  mint: string
): Promise<number> => {
  const mintPk = new PublicKey(mint);
  const accounts = await conn.getParsedTokenAccountsByOwner(owner, { mint: mintPk });
  if (accounts.value.length > 0) {
    return accounts.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
  }
  return 0;
};

// --- Hooks ---

interface TokenState {
  bal: number | null;
  loading: boolean;
  err: ErrorType;
}

const useTokenBalances = () => {
  const { connection } = useConnection();
  const { sessionPublicKey, isAdapterConnected } = useSessionWallet();

  const [sol, setSol] = useState<TokenState>({ bal: null, loading: true, err: null });
  const [boby, setBoby] = useState<TokenState>({ bal: null, loading: true, err: null });
  const [usdt, setUsdt] = useState<TokenState>({ bal: null, loading: true, err: null });

  const fetchAll = useCallback(async () => {
    if (!connection || !sessionPublicKey || !isAdapterConnected) {
      const empty = { bal: null, loading: false, err: null };
      setSol(empty);
      setBoby(empty);
      setUsdt(empty);
      return;
    }

    // Atomic fetchers with state updates
    const run = async (
      setter: React.Dispatch<React.SetStateAction<TokenState>>,
      fetcher: () => Promise<number>,
      name: string
    ) => {
      setter(prev => ({ ...prev, loading: true, err: null }));
      try {
        const result = await fetcher();
        setter({ bal: result, loading: false, err: null });
      } catch (e) {
        logger.error(`Error fetching ${name} balance:`, e);
        setter({ bal: null, loading: false, err: getErrorMessage(e) });
      }
    };

    await Promise.allSettled([
      run(setSol, () => fetchSolBalance(connection, sessionPublicKey), "SOL"),
      run(
        setBoby,
        () => fetchSplBalance(connection, sessionPublicKey, BOBY_TOKEN_MINT_ADDRESS),
        "Boby"
      ),
      run(
        setUsdt,
        () => fetchSplBalance(connection, sessionPublicKey, USDT_TOKEN_MINT_ADDRESS),
        "USDT"
      ),
    ]);
  }, [connection, sessionPublicKey, isAdapterConnected]);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 30000);
    return () => clearInterval(id);
  }, [fetchAll]);

  return { sol, boby, usdt, fetchAll, sessionPublicKey };
};

// --- Components ---

interface BalanceDisplayProps {
  state: TokenState;
  currencyName: string;
  icon: React.ReactNode;
  onRetry: () => void;
}

const BalanceDisplay: React.FC<BalanceDisplayProps> = ({ state, currencyName, icon, onRetry }) => {
  const { loading, bal, err } = state;
  const formatted = useMemo(() => {
    if (bal === null) return "---";
    return bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }, [bal]);

  return (
    <div className="flex items-center justify-between p-2.5 rounded-md bg-secondary/30 hover:bg-secondary/50 transition-colors duration-150">
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-base font-medium text-foreground">{currencyName}</span>
      </div>
      <div className="text-right">
        {loading && <PawPrint className="h-5 w-5 animate-pulse text-primary" />}
        {!loading && err && (
          <div className="flex items-center text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 mr-1 rtl:ml-1" /> Error
            <Button onClick={onRetry} size="sm" variant="ghost" className="ml-1 h-auto p-1 text-xs">
              Retry
            </Button>
          </div>
        )}
        {!loading && !err && (
          <span className="text-base font-semibold text-primary">{formatted}</span>
        )}
      </div>
    </div>
  );
};

const DisconnectedView = () => (
  <Card className="w-full shadow-md bg-background/80 backdrop-blur-sm border-primary/50">
    <CardHeader className="p-3 pb-2">
      <CardTitle className="text-md font-headline flex items-center gap-2">
        <WalletCards /> Your Balances
      </CardTitle>
    </CardHeader>
    <CardContent className="p-3 pt-0">
      <p className="text-sm text-muted-foreground text-center">
        Connect your wallet to see balances.
      </p>
    </CardContent>
  </Card>
);

const TokenBalance: React.FC = () => {
  const { sol, boby, usdt, fetchAll, sessionPublicKey } = useTokenBalances();

  if (!sessionPublicKey) return <DisconnectedView />;

  const hasError = sol.err || boby.err || usdt.err;
  const isRpcError = sol.err === "rpc" || boby.err === "rpc" || usdt.err === "rpc";

  return (
    <Card className="w-full shadow-md bg-background/80 backdrop-blur-sm">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-md font-headline flex items-center gap-2">
          <WalletCards /> Your Balances
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-2.5">
        <BalanceDisplay
          state={sol}
          currencyName="SOL"
          onRetry={fetchAll}
          icon={
            <Image
              src="/Solana-logo.png"
              alt="SOL"
              width={24}
              height={24}
              className="rounded-full"
              priority
            />
          }
        />
        <BalanceDisplay
          state={boby}
          currencyName="Boby"
          onRetry={fetchAll}
          icon={
            <Image
              src="/Boby-logo.png"
              alt="Boby"
              width={24}
              height={24}
              className="rounded-none"
              priority
            />
          }
        />
        <BalanceDisplay
          state={usdt}
          currencyName="USDT"
          onRetry={fetchAll}
          icon={
            <Image
              src="/USDT-logo.png"
              alt="USDT"
              width={24}
              height={24}
              className="rounded-full"
              priority
            />
          }
        />

        {hasError && (
          <CardDescription className="text-xs text-destructive/80 pt-2 text-center px-2">
            {isRpcError
              ? "A network error (RPC) occurred. Try again later."
              : "An error occurred while fetching balances."}
          </CardDescription>
        )}
        {[boby, usdt].map(
          (t, i) =>
            t.bal === 0 &&
            !t.loading &&
            !t.err && (
              <CardDescription
                key={i}
                className="text-xs text-muted-foreground pt-1 text-center px-2"
              >
                No {i === 0 ? "Boby" : "USDT"} token balance found.
              </CardDescription>
            )
        )}
      </CardContent>
    </Card>
  );
};

export default TokenBalance;

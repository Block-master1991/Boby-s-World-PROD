"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PawPrint, Send } from "lucide-react";
import Image from "next/image";
import React from "react";

interface USDTBalanceCardProps {
  isFetchingPlayerUSDT: boolean;
  playerGameUSDT: number;
  MIN_WITHDRAWAL_USDT: number;
  isWithdrawing: boolean;
  onWithdrawUSDT: () => void;
  isWalletMismatch: boolean;
  firebaseNotConfigured: boolean;
}

export const USDTBalanceCard: React.FC<USDTBalanceCardProps> = ({
  isFetchingPlayerUSDT,
  playerGameUSDT,
  MIN_WITHDRAWAL_USDT,
  isWithdrawing,
  onWithdrawUSDT,
  isWalletMismatch,
  firebaseNotConfigured,
}) => (
  <Card className="bg-secondary/30">
    <CardHeader className="pb-2 pt-3">
      <CardTitle className="text-md font-headline flex items-center gap-2">
        <Image src="/USDT-logo.png" alt="USDT Icon" width={20} height={20} className="h-5 w-5" />{" "}
        In-Game USDT Balance
      </CardTitle>
    </CardHeader>
    <CardContent className="pb-3 pt-1">
      {isFetchingPlayerUSDT ? (
        <PawPrint className="h-6 w-6 animate-pulse text-primary mx-auto" />
      ) : (
        <p className="text-2xl font-bold text-center text-primary">
          {playerGameUSDT.toFixed(4)} USDT
        </p>
      )}
      <Button
        className="w-full mt-3 text-sm py-2"
        onClick={onWithdrawUSDT}
        disabled={
          playerGameUSDT < MIN_WITHDRAWAL_USDT ||
          isWithdrawing ||
          isFetchingPlayerUSDT ||
          isWalletMismatch ||
          firebaseNotConfigured
        }
      >
        {isWithdrawing ? (
          <PawPrint className="mr-2 rtl:ml-2 h-4 w-4 animate-pulse" />
        ) : (
          <Send className="mr-2 rtl:ml-2 h-4 w-4" />
        )}
        Withdraw {MIN_WITHDRAWAL_USDT} USDT (Min)
      </Button>
      <p className="text-xs text-muted-foreground mt-1.5 text-center">Withdrawals are simulated.</p>
    </CardContent>
  </Card>
);

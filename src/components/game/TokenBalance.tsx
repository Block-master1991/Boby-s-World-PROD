
'use client';

import React, { useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { PublicKey } from '@solana/web3.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BOBY_TOKEN_MINT_ADDRESS, USDT_TOKEN_MINT_ADDRESS, LAMPORTS_PER_SOL } from '@/lib/constants';
import { Gem, AlertTriangle, Loader2, Coins, WalletCards, CircleDollarSign } from 'lucide-react';
import Image from 'next/image';
import BobyLogo from '@/app/Boby-logo.png';
import SolanaLogo from '@/app/Solana-logo.png'; // Assuming you have a Solana logo image
import UsdtLogo from '@/app/USDT-logo.png'; // Assuming you have a USDT logo image

type ErrorType = 'rpc' | 'other' | null;

interface BalanceDisplayProps {
    isLoading: boolean;
    balance: number | null;
    error: ErrorType;
    currencyName: string;
    icon: React.ReactNode;
    onRetry?: () => void;
}

const BalanceDisplay: React.FC<BalanceDisplayProps> = ({ isLoading, balance, error, currencyName, icon, onRetry }) => {
    const simpleFormatBalance = (bal: number | null): string => {
      if (bal === null) return '---';
      return bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    };

    return (
        <div className="flex items-center justify-between p-2.5 rounded-md bg-secondary/30 hover:bg-secondary/50 transition-colors duration-150">
            <div className="flex items-center gap-2.5">
                {icon}
                <span className="text-base font-medium text-foreground">{currencyName}</span>
            </div>
            <div className="text-right">
                {isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                {!isLoading && error && (
                    <div className="flex items-center text-destructive text-sm">
                        <AlertTriangle className="h-4 w-4 mr-1 rtl:ml-1" /> Error
                        {/* {onRetry && <Button onClick={onRetry} size="sm" variant="ghost" className="ml-1 h-auto p-1 text-xs">Retry</Button>} */}
                    </div>
                )}
                {!isLoading && !error && (
                    <span className="text-base font-semibold text-primary">{simpleFormatBalance(balance)}</span>
                )}
            </div>
        </div>
    );
};


const TokenBalance: React.FC = () => {
    const { connection } = useConnection();
    const { sessionPublicKey, isAdapterConnected } = useSessionWallet();
    
    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [bobyBalance, setBobyBalance] = useState<number | null>(null);
    const [usdtBalance, setUsdtBalance] = useState<number | null>(null); 

    const [isLoadingSol, setIsLoadingSol] = useState(true);
    const [isLoadingBoby, setIsLoadingBoby] = useState(true);
    const [isLoadingUsdt, setIsLoadingUsdt] = useState(true); 

    const [solError, setSolError] = useState<ErrorType>(null);
    const [bobyError, setBobyError] = useState<ErrorType>(null);
    const [usdtError, setUsdtError] = useState<ErrorType>(null); 

    const fetchBalances = async () => {
        if (!connection || !sessionPublicKey || !isAdapterConnected) {
            setSolBalance(null); setBobyBalance(null); setUsdtBalance(null); 
            setIsLoadingSol(false); setIsLoadingBoby(false); setIsLoadingUsdt(false); 
            setSolError(null); setBobyError(null); setUsdtError(null); 
            return;
        }

        setIsLoadingSol(true); setSolError(null);
        setIsLoadingBoby(true); setBobyError(null);
        setIsLoadingUsdt(true); setUsdtError(null); 
        
        try {
            const balanceInLamports = await connection.getBalance(sessionPublicKey);
            setSolBalance(balanceInLamports / LAMPORTS_PER_SOL);
        } catch (error: any) {
            console.error("Error fetching SOL balance:", error);
            setSolError(error.message.includes('RPC') ? 'rpc' : 'other');
            setSolBalance(null);
        } finally {
            setIsLoadingSol(false);
        }

        try {
            const bobyMintPublicKey = new PublicKey(BOBY_TOKEN_MINT_ADDRESS);
            const accounts = await connection.getParsedTokenAccountsByOwner(sessionPublicKey, { mint: bobyMintPublicKey });
            if (accounts.value.length > 0 && accounts.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount) {
                setBobyBalance(accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount);
            } else {
                setBobyBalance(0);
            }
        } catch (error: any) {
            console.error("Error fetching Boby balance:", error);
            setBobyError(error.message.includes('RPC') ? 'rpc' : 'other');
            setBobyBalance(null);
        } finally {
            setIsLoadingBoby(false);
        }

        try {
            const usdtMintPublicKey = new PublicKey(USDT_TOKEN_MINT_ADDRESS); 
            const accounts = await connection.getParsedTokenAccountsByOwner(sessionPublicKey, { mint: usdtMintPublicKey });
            if (accounts.value.length > 0 && accounts.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount) {
                setUsdtBalance(accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount); 
            } else {
                setUsdtBalance(0); 
            }
        } catch (error: any) {
            console.error("Error fetching USDT balance:", error); 
            setUsdtError(error.message.includes('RPC') ? 'rpc' : 'other'); 
            setUsdtBalance(null); 
        } finally {
            setIsLoadingUsdt(false); 
        }
    };

    useEffect(() => {
        fetchBalances();
        const intervalId = setInterval(fetchBalances, 30000); 
        return () => clearInterval(intervalId);
    }, [connection, sessionPublicKey, isAdapterConnected]);


    if (!sessionPublicKey) {
        return (
            <Card className="w-full shadow-md bg-background/80 backdrop-blur-sm border-primary/50">
                <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-md font-headline flex items-center gap-2"><WalletCards /> Your Balances</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <p className="text-sm text-muted-foreground text-center">Connect your wallet to see balances.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full shadow-md bg-opacity-80 backdrop-blur-sm">
            <CardHeader className="p-4 pb-2">
                 <CardTitle className="text-md font-headline flex items-center gap-2"><WalletCards /> Your Balances</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-2.5">
                <BalanceDisplay
                    isLoading={isLoadingSol}
                    balance={solBalance}
                    error={solError}
                    currencyName="SOL"
                    icon={<Image src={SolanaLogo} alt="Solana Token" width={24} height={24} className="rounded-full" priority />}
                    onRetry={fetchBalances}
                />
                <BalanceDisplay
                    isLoading={isLoadingBoby}
                    balance={bobyBalance}
                    error={bobyError}
                    currencyName="Boby"
                    icon={<Image src={BobyLogo} alt="Boby Token" width={24} height={24} className="rounded-none" priority />}
                    onRetry={fetchBalances}
                />
                <BalanceDisplay
                    isLoading={isLoadingUsdt} 
                    balance={usdtBalance} 
                    error={usdtError} 
                    currencyName="USDT" 
                    icon={<Image src={UsdtLogo} alt="USDT-sol Token" width={24} height={24} className="rounded-full" priority />}
                    onRetry={fetchBalances}
                />
                
                {(solError || bobyError || usdtError) && ( 
                    <CardDescription className="text-xs text-destructive/80 pt-2 text-center px-2">
                        { (solError === 'rpc' || bobyError === 'rpc' || usdtError === 'rpc') 
                            ? "A network error (RPC) occurred. You may need to try again later or check your connection." 
                            : "An error occurred while fetching some balances."}
                    </CardDescription>
                )}
                {bobyBalance === 0 && !isLoadingBoby && !bobyError && (
                     <CardDescription className="text-xs text-muted-foreground pt-1 text-center px-2">
                        No Boby token balance found.
                    </CardDescription>
                )}
                 {usdtBalance === 0 && !isLoadingUsdt && !usdtError && ( 
                     <CardDescription className="text-xs text-muted-foreground pt-1 text-center px-2">
                        No USDT token balance found.
                    </CardDescription>
                )}
            </CardContent>
        </Card>
    );
};
export default TokenBalance;

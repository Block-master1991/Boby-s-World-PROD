
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { useConnection } from '@solana/wallet-adapter-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, AlertCircle, PawPrint, RefreshCw, Plus, Minus, Smartphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { BOBY_TOKEN_MINT_ADDRESS, STORE_TREASURY_WALLET_ADDRESS } from '@/lib/constants';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
    Token,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useActiveStoreItems } from '@/hooks/useStoreItems';
import { useApiFetch } from '@/utils/api'; // استيراد useApiFetch
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';
import StoreItemSkeleton from '@/components/shared/StoreItemSkeleton';
import { useMarketData, useGraphQLMutation } from '@/hooks/useGraphQL';
import { GAME_MUTATIONS } from '@/lib/graphql-client';
import { StoreItemDefinition } from '@/lib/server-items';

interface InGameStoreProps {
    isAuthenticated: boolean;
    authUserPublicKey: string | undefined;
    isWalletConnectedAndMatching: boolean;
    onPurchaseSuccess?: () => Promise<void>;
}

const BOBY_TOKEN_DECIMALS = 6; // Boby token has 6 decimal places

const InGameStore: React.FC<InGameStoreProps> = ({
    isAuthenticated,
    authUserPublicKey,
    isWalletConnectedAndMatching,
    onPurchaseSuccess,
}) => {
    const { connection } = useConnection();
    const {
        sessionPublicKey, // Keep for reference if needed, but authUserPublicKey is primary for data
        isWalletMismatch, // Keep for display warnings
        sendTransaction,
        wallet, // Wallet adapter instance
        adapterPublicKey // Current connected wallet's public key
    } = useSessionWallet();
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const { apiFetch } = useApiFetch();

    const { items: storeItems, loading: itemsLoading, error: itemsError } = useActiveStoreItems();

    // Debug logs (remove in production)
    // console.log('[InGameStore] storeItems:', storeItems?.length || 0, 'itemsLoading:', itemsLoading, 'itemsError:', itemsError);
    // console.log('[InGameStore] isAuthenticated:', isAuthenticated, 'isWalletConnectedAndMatching:', isWalletConnectedAndMatching);

    const [isLoading, setIsLoading] = useState<string | null>(null); // For individual item purchase loading
    const [showSkeletons, setShowSkeletons] = useState(true);
    const [storeItemsLoaded, setStoreItemsLoaded] = useState(false);
    const [quantities, setQuantities] = useState<Record<string, number>>(() => {
        const initialQuantities: Record<string, number> = {};
        // Initialize quantities when items are loaded
        if (storeItems && storeItems.length > 0) {
            storeItems.forEach(item => { initialQuantities[item.id] = 1; });
        }
        return initialQuantities;
    });

    // Using secure GraphQL hook with useApiFetch integration
    const { data: marketData, loading: isBobyPriceLoading, error: bobyPriceError, execute: fetchBobyUsdPrice } = useMarketData();

    // Extract price data from GraphQL response
    const bobyUsdPrice = marketData?.marketData?.bobyPrice || null;

    // Track store items loading state
    useEffect(() => {
        if (!itemsLoading) {
            setStoreItemsLoaded(true);
        }
    }, [itemsLoading]);

    // Control skeleton display with smooth transition
    useEffect(() => {
        if (!itemsLoading && storeItemsLoaded) {
            // Add a small delay before hiding skeletons for smooth transition
            const timer = setTimeout(() => {
                setShowSkeletons(false);
            }, 300);
            return () => clearTimeout(timer);
        } else {
            setShowSkeletons(true);
        }
    }, [itemsLoading, storeItemsLoaded]);

    useEffect(() => {
        // Fetch price on mount
        fetchBobyUsdPrice();

        // Set up refresh interval
        const intervalId = setInterval(() => {
            fetchBobyUsdPrice();
        }, 5000); // Refresh every 5 seconds
        return () => clearInterval(intervalId);
    }, [fetchBobyUsdPrice]);

    const handleQuantityChange = (itemId: string, value: string) => {
        const numberValue = parseInt(value, 10);
        const newQuantity = Math.max(1, isNaN(numberValue) ? 1 : numberValue);
        setQuantities(prev => ({ ...prev, [itemId]: newQuantity }));
    };

    const handleIncrement = useCallback((itemId: string) => {
        setQuantities(prev => {
            const currentQuantity = prev[itemId] || 0;
            return { ...prev, [itemId]: currentQuantity + 1 };
        });
    }, []);

    const handleDecrement = useCallback((itemId: string) => {
        setQuantities(prev => {
            const currentQuantity = prev[itemId] || 0;
            return { ...prev, [itemId]: Math.max(currentQuantity - 1, 1) }; // Minimum 1
        });
    }, []);

    const handlePurchase = async (item: StoreItemDefinition) => {
        // Check if authenticated and wallet is connected and matching
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUserPublicKey || !wallet || !sendTransaction) {
            toast({ title: 'Action Blocked', description: 'Please connect and authenticate your wallet to make purchases.', variant: 'destructive' });
            return;
        }
        // isWalletMismatch is handled by isWalletConnectedAndMatching, but keep the toast for explicit feedback
        if (isWalletMismatch) {
            toast({ title: 'Wallet Mismatch', description: 'Purchase paused. Your active wallet does not match your game session. Please align them or reconnect.', variant: 'destructive', duration: 7000 });
            return;
        }
        if (STORE_TREASURY_WALLET_ADDRESS === 'REPLACE_WITH_YOUR_STORE_TREASURY_WALLET_ADDRESS' || STORE_TREASURY_WALLET_ADDRESS === 'EXAMPLE_DO_NOT_USE') {
            toast({ title: 'Setup Required', description: 'Store owner: Configure STORE_TREASURY_WALLET_ADDRESS.', variant: 'destructive' });
            return;
        }
        if (!bobyUsdPrice || bobyUsdPrice <= 0) {
            toast({ title: 'Price Error', description: 'Cannot calculate Boby price. Please try refreshing the price or wait for it to load.', variant: 'destructive' });
            return;
        }

        const quantity = quantities[item.id] || 1;
        const totalUsdValue = item.price * quantity;
        const calculatedBobyAmount = totalUsdValue / bobyUsdPrice;

        setIsLoading(item.id);
        const mobileMessage = isMobile ? 'Check your wallet app for approval.' : 'Approve the transaction in your wallet.';
        toast({ title: 'Purchase Initiated', description: `Buying ${quantity} ${item.name} for ~${calculatedBobyAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} Boby ($${totalUsdValue.toFixed(2)}). ${mobileMessage}` });

        let signature: string | undefined = undefined;
        let retryCount = 0;
        const maxRetries = isMobile ? 2 : 1;

        const attemptPurchase = async (): Promise<void> => {
            try {
                const bobyMintPublicKey = new PublicKey(BOBY_TOKEN_MINT_ADDRESS);
                if (!STORE_TREASURY_WALLET_ADDRESS) {
                    throw new Error("STORE_TREASURY_WALLET_ADDRESS is not set.");
                }
                const treasuryPublicKey = new PublicKey(STORE_TREASURY_WALLET_ADDRESS);
                if (!adapterPublicKey) {
                    throw new Error("Adapter public key not available for transaction.");
                }

                const fromTokenAccountAddress = await Token.getAssociatedTokenAddress(
                    ASSOCIATED_TOKEN_PROGRAM_ID,
                    TOKEN_PROGRAM_ID,
                    bobyMintPublicKey,
                    adapterPublicKey
                );
                const toTokenAccountAddress = await Token.getAssociatedTokenAddress(
                    ASSOCIATED_TOKEN_PROGRAM_ID,
                    TOKEN_PROGRAM_ID,
                    bobyMintPublicKey,
                    treasuryPublicKey
                );

                // Check if user's token account exists and has sufficient balance
                let userTokenAccountInfo;
                try {
                    userTokenAccountInfo = await connection.getAccountInfo(fromTokenAccountAddress);
                } catch (error) {
                    // Account doesn't exist
                    userTokenAccountInfo = null;
                }

                if (!userTokenAccountInfo) {
                    throw new Error("Your BOBY token account does not exist. You may need to receive BOBY tokens first to initialize it.");
                }

                // Get token balance
                const userTokenAccount = await connection.getTokenAccountBalance(fromTokenAccountAddress);
                const userBalance = userTokenAccount.value.uiAmount || 0;

                if (userBalance < calculatedBobyAmount) {
                    throw new Error(`Insufficient BOBY balance. You have ${userBalance.toLocaleString()} BOBY but need ${calculatedBobyAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} BOBY.`);
                }

                // Check SOL balance for transaction fees
                let solBalance = 0;
                try {
                    solBalance = await connection.getBalance(adapterPublicKey);
                } catch (error) {
                    // Account doesn't exist, balance is 0
                    console.warn('SOL account not found, assuming balance 0:', error);
                }
                const minSolForFees = 10000; // 0.00001 SOL in lamports (adjust as needed)
                if (solBalance < minSolForFees) {
                    throw new Error(`Insufficient SOL balance for transaction fees. You have ${(solBalance / 1000000000).toFixed(6)} SOL but need at least 0.00001 SOL.`);
                }

                const transaction = new Transaction();
                try {
                    await connection.getAccountInfo(toTokenAccountAddress);
                } catch (error) {
                    transaction.add(
                        Token.createAssociatedTokenAccountInstruction(
                            ASSOCIATED_TOKEN_PROGRAM_ID,
                            TOKEN_PROGRAM_ID,
                            bobyMintPublicKey,
                            toTokenAccountAddress,
                            treasuryPublicKey,
                            adapterPublicKey
                        )
                    );
                }

                const bobyAmountInSmallestUnit = Math.round(calculatedBobyAmount * (10 ** BOBY_TOKEN_DECIMALS));

                transaction.add(
                    Token.createTransferInstruction(
                        TOKEN_PROGRAM_ID,
                        fromTokenAccountAddress,
                        toTokenAccountAddress,
                        adapterPublicKey,
                        [],
                        bobyAmountInSmallestUnit
                    )
                );

                // Ensure transaction has required fields (especially for mobile wallets)
                if (!transaction.recentBlockhash || !transaction.feePayer) {
                    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
                    transaction.recentBlockhash = blockhash;
                    transaction.lastValidBlockHeight = lastValidBlockHeight;
                    transaction.feePayer = adapterPublicKey;
                }

                // Set transaction timeout for mobile
                const timeoutMs = isMobile ? 60000 : 30000; // 60 seconds for mobile, 30 for desktop
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Transaction timeout')), timeoutMs);
                });

                const sendPromise = sendTransaction(transaction, connection);
                signature = await Promise.race([sendPromise, timeoutPromise]) as string;

                toast({ title: 'Purchase Successful!', description: `Bought ${quantity} ${item.name}. Sig: ${signature.substring(0, 10)}... Processing inventory update.` });

                // Wait a bit longer for transaction confirmation before calling backend API
                console.log('[Purchase] Waiting 10 seconds for transaction confirmation...');
                await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

                // Call backend API to update inventory with timeout
                const apiTimeoutMs = isMobile ? 45000 : 30000; // 45 seconds for mobile, 30 for desktop
                const controller = new AbortController();
                const apiTimeout = setTimeout(() => controller.abort(), apiTimeoutMs);

                const inventoryUpdateResponse = await apiFetch('/api/game/purchaseItem', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ itemId: item.id, quantity, transactionSignature: signature }),
                    signal: controller.signal
                });

                clearTimeout(apiTimeout);
                const inventoryUpdateData = await inventoryUpdateResponse.json();

                if (inventoryUpdateResponse.ok) {
                    toast({ title: 'Inventory Updated', description: inventoryUpdateData.message || `${quantity} ${item.name} added to inventory.` });
                    if (onPurchaseSuccess) {
                        await onPurchaseSuccess();
                    }
                    return; // Success, exit function
                } else {
                    // Handle specific API errors
                    const errorCode = inventoryUpdateData.code;
                    if (errorCode === 'TRANSACTION_NOT_FOUND' && retryCount < maxRetries) {
                        console.log(`Transaction not found, retrying... (${retryCount + 1}/${maxRetries})`);
                        retryCount++;
                        toast({ title: 'Retrying...', description: 'Transaction verification in progress. Please wait.' });
                        await new Promise(resolve => setTimeout(resolve, 8000)); // Wait 8 seconds
                        return attemptPurchase(); // Retry
                    }
                    throw new Error(inventoryUpdateData.error || 'Failed to update inventory after purchase.');
                }

            } catch (error) {
                console.error('Purchase attempt failed:', error);
                let errorMessage = error instanceof Error ? error.message : 'Could not complete purchase.';

                // Improve error messages for better user experience
                if (errorMessage.includes('debit an account') || errorMessage.includes('no record of a prior credit')) {
                    errorMessage = 'Insufficient SOL balance for transaction fees. Please ensure your wallet has enough SOL (at least 0.00001 SOL) to cover network fees.';
                }

                // Check if it's a timeout or user rejection error
                if (errorMessage.includes('timeout') || errorMessage.includes('User rejected')) {
                    if (retryCount < maxRetries) {
                        console.log(`Retrying purchase due to: ${errorMessage} (${retryCount + 1}/${maxRetries})`);
                        retryCount++;
                        toast({ title: 'Retrying...', description: 'Transaction failed, retrying automatically.' });
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return attemptPurchase();
                    }
                }

                // If all retries failed or it's a different error
                toast({ title: 'Purchase Failed', description: errorMessage, variant: 'destructive' });

                // On mobile, offer manual retry for certain errors
                if (isMobile && (errorMessage.includes('User rejected') || errorMessage.includes('timeout') || errorMessage.includes('not found'))) {
                    setTimeout(() => {
                        toast({
                            title: 'Retry Purchase?',
                            description: 'The transaction may need more time to confirm. Try again?',
                            action: (
                                <Button size="sm" onClick={() => handlePurchase(item)}>
                                    Retry
                                </Button>
                            ),
                        });
                    }, 5000);
                }

                throw error; // Re-throw to be caught by outer catch
            }
        };

        try {
            await attemptPurchase();
        } catch (error) {
            // Final error handling - all retries exhausted
            console.error('All purchase attempts failed:', error);
            const finalErrorMessage = error instanceof Error ? error.message : 'Purchase failed after multiple attempts.';
            toast({
                title: 'Purchase Failed',
                description: finalErrorMessage,
                variant: 'destructive',
                duration: 10000
            });
        } finally {
            setIsLoading(null);
        }
    };

    return (
        <>
            <SheetHeader className="p-6 pb-4 border-b">
                <SheetTitle className="text-2xl font-headline flex items-center gap-2">
                    <Image src="/GameStore-lg.png" alt="Store Icon" width={28} height={28} className="h-7 w-7" /> Store
                </SheetTitle>
                <SheetDescription>
                    Purchase items using Boby tokens.
                </SheetDescription>
                {isWalletMismatch && sessionPublicKey && adapterPublicKey && (
                    <div className="mt-2 p-2 text-xs bg-destructive/10 text-destructive rounded-md border border-destructive/30 flex items-center gap-2">
                        <AlertCircle size={16} />
                        <span>Warning! Wallet in Solflare ({adapterPublicKey.toBase58().substring(0, 4)}...) differs from your session wallet ({sessionPublicKey.toBase58().substring(0, 4)}...). You will not be able to make purchases.</span>
                    </div>
                )}
            </SheetHeader>
            <ScrollArea className="flex-grow">
                <div className="p-4 space-y-1">
                    {isBobyPriceLoading && bobyUsdPrice === null && (
                        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                            <PawPrint className="h-4 w-4 mr-2 rtl:ml-2 animate-pulse" /> Loading Boby price...
                        </div>
                    )}
                    {bobyPriceError && (
                        <div className="flex flex-col items-center justify-center py-4 text-sm text-destructive">
                            <p className="flex items-center text-center"><AlertCircle className="h-4 w-4 mr-2 rtl:ml-2" /> {bobyPriceError}</p>
                            <Button variant="link" size="sm" onClick={() => fetchBobyUsdPrice()} className="text-destructive hover:text-destructive/80">
                                <RefreshCw className="h-3 w-3 mr-1 rtl:ml-1" /> Try Again
                            </Button>
                        </div>
                    )}
                    {bobyUsdPrice !== null && bobyUsdPrice > 0 && (
                        <div className="text-xs text-muted-foreground text-center mb-3 p-2 bg-secondary/30 rounded-md flex items-center justify-center">
                            Current Price: 1 BOBY = ${bobyUsdPrice.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 10 })} USD
                            <Button variant="ghost" size="icon" onClick={() => fetchBobyUsdPrice()} className="ml-2 rtl:mr-2 h-5 w-5 text-muted-foreground hover:text-primary">
                                {isBobyPriceLoading ? <PawPrint className="h-3 w-3 animate-pulse" /> : <RefreshCw className="h-3 w-3" />}
                                <span className="sr-only">Refresh Price</span>
                            </Button>
                        </div>
                    )}
                </div>

                <div className="p-6 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Display message if not authenticated or wallet mismatch */}
                    {(!isAuthenticated || !isWalletConnectedAndMatching) && (
                        <div className="text-center py-8 sm:col-span-2">
                            <p className="text-lg text-muted-foreground mb-4">
                                Please connect and authenticate your wallet to access the store.
                            </p>
                            {/* Optionally add a button to trigger wallet connection/login if not already handled by GameContainer */}
                            {/* <WalletMultiButton /> */}
                        </div>
                    )}

                    {/* Show loading state while fetching items */}
                    {isAuthenticated && isWalletConnectedAndMatching && showSkeletons && storeItems.length === 0 && (
                        <>
                            <StoreItemSkeleton />
                            <StoreItemSkeleton />
                            <StoreItemSkeleton />
                            <StoreItemSkeleton />
                        </>
                    )}

                    {/* Show error state */}
                    {isAuthenticated && isWalletConnectedAndMatching && itemsError && !itemsLoading && (
                        <div className="text-center py-8 sm:col-span-2">
                            <p className="text-destructive mb-4">Failed to load store items</p>
                            <Button onClick={() => window.location.reload()} variant="outline">
                                Retry
                            </Button>
                        </div>
                    )}

                    {/* Show empty state only after loading is complete */}
                    {isAuthenticated && isWalletConnectedAndMatching && !itemsLoading && !itemsError && storeItemsLoaded && storeItems.length === 0 && (
                        <div className="text-center py-8 sm:col-span-2">
                            <p className="text-muted-foreground">No items available at the moment</p>
                        </div>
                    )}

                    {/* Render store items only if authenticated, wallet is connected and matching, and items are loaded */}
                    {isAuthenticated && isWalletConnectedAndMatching && !itemsLoading && !itemsError && storeItemsLoaded && storeItems.map((item) => {
                        const quantity = quantities[item.id] || 1;
                        const totalUsdPrice = item.price * quantity;
                        const calculatedBobyPricePerUnit = bobyUsdPrice && bobyUsdPrice > 0 ? (item.price / bobyUsdPrice) : null;
                        const totalBobyPrice = bobyUsdPrice && bobyUsdPrice > 0 ? (totalUsdPrice / bobyUsdPrice) : null;

                        return (
                            <Card key={item.id} className="flex flex-col"> {/* Added flex flex-col */}
                                <CardHeader className="flex-row items-center gap-3 p-4 space-y-0">
                                    <div className="relative">
                                        <Image src={item.image} alt={item.name} width={60} height={60} className="rounded-md border" data-ai-hint={item.dataAiHint} priority={item.id === '1'} />
                                        {item.id === '1' && <Badge className="absolute -top-2 -right-2 text-xs">New</Badge>}
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg">{item.name}</CardTitle> {/* Changed h3 to CardTitle */}
                                        <CardDescription className="text-xs">{item.description}</CardDescription> {/* Changed p to CardDescription */}
                                        <p className="text-sm font-semibold text-primary flex items-center justify-center sm:justify-start gap-1 mt-1">
                                            ${item.price.toFixed(3)} USD
                                            {calculatedBobyPricePerUnit !== null && (
                                                <span className="text-xs text-muted-foreground ml-1 rtl:mr-1">
                                                    (~{calculatedBobyPricePerUnit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} BOBY)
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-0 flex flex-col flex-grow"> {/* New CardContent */}
                                    <div className="flex items-center justify-center space-x-2 mt-4">
                                        {/* Removed Label for Quantity as it's not in PlayerInventory's quantity controls */}
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9"
                                            onClick={() => handleDecrement(item.id)}
                                            disabled={quantity <= 1}
                                        >
                                            <Minus className="h-4 w-4" />
                                        </Button>
                                        <Input id={`quantity-${item.id}`} type="number" min="1" value={quantity} onChange={(e) => handleQuantityChange(item.id, e.target.value)} className="h-9 w-24 text-center no-spinners flex-grow" />
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9"
                                            onClick={() => handleIncrement(item.id)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <p className="text-xs font-semibold text-primary flex items-center justify-center gap-1 mt-2">
                                        Total:
                                        {totalBobyPrice !== null ? (
                                            <>
                                                {totalBobyPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: BOBY_TOKEN_DECIMALS })}
                                                <Image src="/Boby-logo.png" alt="Boby Token" width={14} height={14} className="rounded-none" priority={false} />
                                            </>
                                        ) : (
                                            '--- BOBY'
                                        )}
                                        <span className="text-muted-foreground ml-2">(${totalUsdPrice.toFixed(3)} USD)</span> {/* Increased ml-1 to ml-2 */}
                                    </p>
                                    <Button variant="default" size="sm" onClick={() => handlePurchase(item)}
                                        disabled={isLoading === item.id || !isAuthenticated || !isWalletConnectedAndMatching || !authUserPublicKey || STORE_TREASURY_WALLET_ADDRESS === 'REPLACE_WITH_YOUR_STORE_TREASURY_WALLET_ADDRESS' || STORE_TREASURY_WALLET_ADDRESS === 'EXAMPLE_DO_NOT_USE' || isBobyPriceLoading || !bobyUsdPrice || bobyUsdPrice <= 0}
                                        className="bg-accent hover:bg-accent/90 text-accent-foreground w-full mt-4 text-xs px-2 py-1 relative overflow-hidden">
                                        {isLoading === item.id ? (
                                            <div className="flex items-center justify-center">
                                                <div className="w-4 h-4 border-2 border-accent-foreground/20 border-t-accent-foreground rounded-full animate-spin mr-2"></div>
                                                <span className="animate-pulse">Processing...</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center">
                                                <Send className="mr-2 rtl:ml-2 h-4 w-4" />
                                                <span>Purchase ({quantity})</span>
                                            </div>
                                        )}
                                        {isLoading === item.id && (
                                            <div className="absolute inset-0 bg-accent/10 animate-pulse"></div>
                                        )}
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </ScrollArea>
            <SheetFooter className="p-4 border-t">
                {STORE_TREASURY_WALLET_ADDRESS === 'REPLACE_WITH_YOUR_STORE_TREASURY_WALLET_ADDRESS' || STORE_TREASURY_WALLET_ADDRESS === 'EXAMPLE_DO_NOT_USE' && (
                    <p className="text-xs text-destructive text-center">
                        Warning to store owner: Please configure `STORE_TREASURY_WALLET_ADDRESS` in `src/lib/constants.ts`.
                    </p>
                )}
                <p className="text-xs text-muted-foreground text-center w-full">
                    Prices displayed in Boby are dynamically converted. Final amount may vary slightly due to price fluctuations and rounding.
                </p>
            </SheetFooter>
        </>
    );
};
export default InGameStore;

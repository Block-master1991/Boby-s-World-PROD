
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { useConnection } from '@solana/wallet-adapter-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShoppingCart, Send, PackagePlus, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { BOBY_TOKEN_MINT_ADDRESS, STORE_TREASURY_WALLET_ADDRESS } from '@/lib/constants';
import { PublicKey, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, getAccount, TokenAccountNotFoundError } from '@solana/spl-token';
import BobyLogo from '@/app/Boby-logo.png';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { storeItems, type StoreItemDefinition } from '@/lib/items';

const BOBY_TOKEN_DECIMALS = 6; // Boby token has 6 decimal places

const InGameStore: React.FC = () => {
    const { connection } = useConnection();
    const {
        sessionPublicKey,
        isWalletMismatch,
        sendTransaction,
        wallet,
        adapterPublicKey
    } = useSessionWallet();
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState<string | null>(null); // For individual item purchase loading
    const [quantities, setQuantities] = useState<Record<string, number>>(() => {
        const initialQuantities: Record<string, number> = {};
        storeItems.forEach(item => { initialQuantities[item.id] = 1; });
        return initialQuantities;
    });

    const [bobyUsdPrice, setBobyUsdPrice] = useState<number | null>(null);
    const [isBobyPriceLoading, setIsBobyPriceLoading] = useState<boolean>(true);
    const [bobyPriceError, setBobyPriceError] = useState<string | null>(null);

    const fetchBobyUsdPrice = useCallback(async (isInitialLoad = false) => {
        if (!isInitialLoad) {
             setIsBobyPriceLoading(true);
        }
        setBobyPriceError(null);
        try {
            // Fetch from API endpoint
            const response = await fetch('/api/boby-price-jup');
            if (!response.ok) {
                let errorMsg = 'Failed to fetch Boby price for store';
                let errorDetails = `Status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                    errorDetails = errorData.details || errorDetails;
                    if (errorData.statusCode === 429 || response.status === 429) {
                        errorMsg = 'Price API rate limit. Try later.';
                    }
                } catch (e) {
                    if (response.status === 429) {
                         errorMsg = 'Price API rate limit. Try later.';
                    }
                }
                throw new Error(`${errorMsg} (${errorDetails})`);
            }
            const data = await response.json();
            if (typeof data.price === 'number') {
                setBobyUsdPrice(data.price);
            } else {
                throw new Error('Invalid price data received for store.');
            }
        } catch (error: any) {
            console.error("[InGameStore] Error fetching Boby/USD price for store:", error);
            setBobyPriceError(error.message || 'Could not load Boby price for store.');
            setBobyUsdPrice(null);
        } finally {
            setIsBobyPriceLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBobyUsdPrice(true); // Initial fetch
        const intervalId = setInterval(() => fetchBobyUsdPrice(false), 5000); // Refresh every 5 seconds
        return () => clearInterval(intervalId);
    }, [fetchBobyUsdPrice]);

    const handleQuantityChange = (itemId: string, value: string) => {
        const numberValue = parseInt(value, 10);
        const newQuantity = Math.max(1, isNaN(numberValue) ? 1 : numberValue);
        setQuantities(prev => ({ ...prev, [itemId]: newQuantity }));
    };

    const handlePurchase = async (item: StoreItemDefinition) => {
        if (!sessionPublicKey || !wallet || !sendTransaction) {
            toast({ title: 'Wallet Not Connected', description: 'Please connect your wallet for the game session.', variant: 'destructive' });
            return;
        }
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
        toast({ title: 'Purchase Initiated', description: `Buying ${quantity} ${item.name} for ~${calculatedBobyAmount.toLocaleString(undefined, {maximumFractionDigits: 2})} Boby ($${totalUsdValue.toFixed(2)}). Approve in wallet.` });
        let signature: string | undefined = undefined;

        try {
            const bobyMintPublicKey = new PublicKey(BOBY_TOKEN_MINT_ADDRESS);
            if (!STORE_TREASURY_WALLET_ADDRESS) {
            throw new Error("STORE_TREASURY_WALLET_ADDRESS is not set.");
            }
            const treasuryPublicKey = new PublicKey(STORE_TREASURY_WALLET_ADDRESS);
            if (!adapterPublicKey) {
                throw new Error("Adapter public key not available for transaction.");
            }
            
            const fromTokenAccountAddress = await getAssociatedTokenAddress(bobyMintPublicKey, adapterPublicKey);
            const toTokenAccountAddress = await getAssociatedTokenAddress(bobyMintPublicKey, treasuryPublicKey);
            
            const transaction = new Transaction();
            try {
                await getAccount(connection, toTokenAccountAddress);
            } catch (error: any) {
                 if (error instanceof TokenAccountNotFoundError) {
                    transaction.add(createAssociatedTokenAccountInstruction(adapterPublicKey, toTokenAccountAddress, treasuryPublicKey, bobyMintPublicKey));
                } else { 
                    toast({ title: 'Transaction Setup Failed', description: 'Could not prepare store token account.', variant: 'destructive' }); setIsLoading(null); return;
                }
            }
            const bobyAmountInSmallestUnit = Math.round(calculatedBobyAmount * (10 ** BOBY_TOKEN_DECIMALS));

            transaction.add(createTransferInstruction(fromTokenAccountAddress, toTokenAccountAddress, adapterPublicKey, bobyAmountInSmallestUnit, [], TOKEN_PROGRAM_ID));
            
            signature = await sendTransaction(transaction, connection);
            toast({ title: 'Purchase Successful!', description: `Bought ${quantity} ${item.name}. Sig: ${signature.substring(0,10)}... Adding to inventory.` });

            const playerDocRef = doc(db, 'players', sessionPublicKey.toBase58());
            const itemsToAdd = Array(quantity).fill(null).map(() => ({
                id: item.id, name: item.name, image: item.image, description: item.description, dataAiHint: item.dataAiHint,
                instanceId: `item-${Date.now()}-${Math.random().toString(36).substring(2, 11)}` 
            }));
            await updateDoc(playerDocRef, { inventory: arrayUnion(...itemsToAdd) });
            toast({ title: 'Items Added to Inventory', description: `${quantity} ${item.name} now in Firestore.` });

        } catch (error: any) { 
            console.error('Purchase failed:', error);
            toast({ title: 'Purchase Failed', description: `${error.message || 'Could not complete purchase.'}`, variant: 'destructive' });
        } finally {
            setIsLoading(null);
        }
    };
    
    return (
        <>
            <SheetHeader className="p-6 pb-4 border-b">
                <SheetTitle className="text-2xl font-headline flex items-center gap-2">
                    <ShoppingCart className="h-6 w-6" /> Store
                </SheetTitle>
                <SheetDescription>
                    Purchase items using Boby tokens.
                </SheetDescription>
                 {isWalletMismatch && sessionPublicKey && adapterPublicKey && (
                    <div className="mt-2 p-2 text-xs bg-destructive/10 text-destructive rounded-md border border-destructive/30 flex items-center gap-2">
                        <AlertCircle size={16}/>
                        <span>Warning! Wallet in Solflare ({adapterPublicKey.toBase58().substring(0,4)}...) differs from your session wallet ({sessionPublicKey.toBase58().substring(0,4)}...). You will not be able to make purchases.</span>
                    </div>
                )}
            </SheetHeader>
            <ScrollArea className="flex-grow">
                <div className="p-4 space-y-1">
                    {isBobyPriceLoading && bobyUsdPrice === null && ( 
                        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 mr-2 rtl:ml-2 animate-spin"/> Loading Boby price...
                        </div>
                    )}
                    {bobyPriceError && (
                        <div className="flex flex-col items-center justify-center py-4 text-sm text-destructive">
                            <p className="flex items-center text-center"><AlertCircle className="h-4 w-4 mr-2 rtl:ml-2"/> {bobyPriceError}</p>
                            <Button variant="link" size="sm" onClick={() => fetchBobyUsdPrice(false)} className="text-destructive hover:text-destructive/80">
                                <RefreshCw className="h-3 w-3 mr-1 rtl:ml-1"/> Try Again
                            </Button>
                        </div>
                    )}
                    {bobyUsdPrice !== null && bobyUsdPrice > 0 && (
                      <div className="text-xs text-muted-foreground text-center mb-3 p-2 bg-secondary/30 rounded-md flex items-center justify-center">
                          Current Price: 1 BOBY = ${bobyUsdPrice.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 10 })} USD
                          <Button variant="ghost" size="icon" onClick={() => fetchBobyUsdPrice(false)} className="ml-2 rtl:mr-2 h-5 w-5 text-muted-foreground hover:text-primary">
                            {isBobyPriceLoading ? <Loader2 className="h-3 w-3 animate-spin"/> : <RefreshCw className="h-3 w-3"/>}
                            <span className="sr-only">Refresh Price</span>
                          </Button>
                      </div>
                    )}
                </div>

                <div className="p-6 pt-0 space-y-4">
                    {!sessionPublicKey && ( <p className="text-sm text-muted-foreground text-center py-8">Connect your wallet to access the store.</p> )}
                    {sessionPublicKey && storeItems.map((item) => {
                        const quantity = quantities[item.id] || 1;
                        const totalUsdPrice = item.price * quantity;
                        const calculatedBobyPricePerUnit = bobyUsdPrice && bobyUsdPrice > 0 ? (item.price / bobyUsdPrice) : null;
                        const totalBobyPrice = bobyUsdPrice && bobyUsdPrice > 0 ? (totalUsdPrice / bobyUsdPrice) : null;

                        return (
                            <Card key={item.id} className="p-3 bg-card shadow-sm hover:shadow-md transition-shadow group">
                                <div className="flex flex-col sm:flex-row items-center gap-3">
                                    <Image src={item.image} alt={item.name} width={60} height={60} className="rounded-md border" data-ai-hint={item.dataAiHint} priority={item.id === '1'}/>
                                    <div className="flex-grow text-center sm:text-left">
                                        <h3 className="font-semibold text-md">{item.name}</h3>
                                        <p className="text-xs text-muted-foreground">{item.description}</p>
                                        <p className="text-sm font-semibold text-primary flex items-center justify-center sm:justify-start gap-1 mt-1">
                                            ${item.price.toFixed(2)} USD
                                            {calculatedBobyPricePerUnit !== null && (
                                                <span className="text-xs text-muted-foreground ml-1 rtl:mr-1">
                                                    (~{calculatedBobyPricePerUnit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})} BOBY)
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-center sm:items-end gap-2 mt-2 sm:mt-0">
                                        <div className='flex items-center gap-2'>
                                            <Label htmlFor={`quantity-${item.id}`} className="text-xs whitespace-nowrap">Quantity:</Label>
                                            <Input id={`quantity-${item.id}`} type="number" min="1" value={quantity} onChange={(e) => handleQuantityChange(item.id, e.target.value)} className="h-8 w-16 text-sm p-1 text-center" />
                                        </div>
                                        <p className="text-xs font-semibold text-primary flex items-center justify-center sm:justify-end gap-1">
                                            Total:
                                            {totalBobyPrice !== null ? (
                                                <>
                                                    {totalBobyPrice.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: BOBY_TOKEN_DECIMALS})}
                                                    <Image src={BobyLogo} alt="Boby Token" width={14} height={14} className="rounded-full" priority={false} />
                                                </>
                                            ) : (
                                                '--- BOBY'
                                            )}
                                        </p>
                                         <p className="text-xs text-muted-foreground -mt-1">(${totalUsdPrice.toFixed(2)} USD)</p>
                                    </div>
                                </div>
                                 <Button variant="default" size="sm" onClick={() => handlePurchase(item)}
                                    disabled={isLoading === item.id || !sessionPublicKey || isWalletMismatch || STORE_TREASURY_WALLET_ADDRESS === 'REPLACE_WITH_YOUR_STORE_TREASURY_WALLET_ADDRESS' || STORE_TREASURY_WALLET_ADDRESS === 'EXAMPLE_DO_NOT_USE' || isBobyPriceLoading || !bobyUsdPrice || bobyUsdPrice <= 0}
                                    className="bg-accent hover:bg-accent/90 text-accent-foreground w-full mt-3 py-2 px-4">
                                    {isLoading === item.id ? <Loader2 className="mr-2 rtl:ml-2 h-4 w-4 animate-spin" /> : ( <><Send className="mr-2 rtl:ml-2 h-4 w-4" /> Purchase ({quantity})</> )}
                                </Button>
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

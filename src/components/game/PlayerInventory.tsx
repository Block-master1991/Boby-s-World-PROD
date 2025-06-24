
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Backpack, PackageSearch, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { storeItems, type StoreItemDefinition } from '@/lib/items';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button'; // Import Button for item usage

interface AggregatedInventoryItem {
    definition: StoreItemDefinition;
    count: number;
}

interface PlayerInventoryProps {
    isAuthenticated: boolean;
    authUserPublicKey: string | undefined;
    isWalletConnectedAndMatching: boolean;
    speedyPawsTreatCount: number;
    guardianShieldCount: number;
    protectionBoneCount: number;
    coinMagnetTreatCount: number;
    onUseConsumableItem: (itemId: string) => Promise<void>;
}

const PlayerInventory: React.FC<PlayerInventoryProps> = ({
    isAuthenticated,
    authUserPublicKey,
    isWalletConnectedAndMatching,
    speedyPawsTreatCount,
    guardianShieldCount,
    protectionBoneCount,
    coinMagnetTreatCount,
    onUseConsumableItem,
}) => {
    const { toast } = useToast();
    const [aggregatedInventory, setAggregatedInventory] = useState<AggregatedInventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Only fetch inventory if authenticated and user public key is available
        if (!isAuthenticated || !authUserPublicKey || !db) {
            setAggregatedInventory([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const playerDocRef = doc(db, 'players', authUserPublicKey);

        const unsubscribe = onSnapshot(playerDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const playerData = docSnap.data();
                const currentRawInventory: any[] = playerData.inventory || [];
                
                const itemCounts: Record<string, { definition: StoreItemDefinition | undefined, count: number }> = {};

                currentRawInventory.forEach((entry: any) => {
                    let itemId: string | undefined;
                    let itemDefinition: StoreItemDefinition | undefined;

                    if (typeof entry === 'string') {
                        itemDefinition = storeItems.find(si => si.name === entry);
                        itemId = itemDefinition?.id;
                    } else if (typeof entry === 'object' && entry !== null && entry.id) {
                        itemId = entry.id;
                        itemDefinition = storeItems.find(si => si.id === itemId);
                    }

                    if (itemId && itemDefinition) {
                        if (itemCounts[itemId]) {
                            itemCounts[itemId].count++;
                        } else {
                            itemCounts[itemId] = { definition: itemDefinition, count: 1 };
                        }
                    } else {
                        console.warn(`[PlayerInventory] Unrecognized item or definition not found in storeItems for inventory entry:`, entry);
                    }
                });

                const processedItems: AggregatedInventoryItem[] = Object.values(itemCounts)
                    .filter(item => item.definition !== undefined)
                    .map(item => ({ definition: item.definition!, count: item.count }));

                setAggregatedInventory(processedItems);
            } else {
                setAggregatedInventory([]);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("[PlayerInventory] Error fetching inventory snapshot:", error);
            toast({ title: 'Inventory Error', description: 'Could not fetch inventory.', variant: 'destructive' });
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthenticated, authUserPublicKey, toast]);
    
    // Helper to get current count for a specific item ID
    const getItemCount = useCallback((itemId: string) => {
        switch (itemId) {
            case '3': return speedyPawsTreatCount;
            case '2': return guardianShieldCount;
            case '1': return protectionBoneCount;
            case '4': return coinMagnetTreatCount;
            default: return 0;
        }
    }, [speedyPawsTreatCount, guardianShieldCount, protectionBoneCount, coinMagnetTreatCount]);

    return (
        <>
            <SheetHeader className="p-6 pb-4 border-b">
                <SheetTitle className="text-2xl font-headline flex items-center gap-2">
                    <Backpack className="h-6 w-6" /> Inventory
                </SheetTitle>
                <SheetDescription>Items you own and the count of each.</SheetDescription>
            </SheetHeader>
            <ScrollArea className="flex-grow">
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(!isAuthenticated || !isWalletConnectedAndMatching) && (
                        <div className="text-center py-8 sm:col-span-2">
                            <p className="text-lg text-muted-foreground mb-4">
                                Please connect and authenticate your wallet to view your inventory.
                            </p>
                            {/* Optionally add a button to trigger wallet connection/login */}
                            {/* <WalletMultiButton /> */}
                        </div>
                    )}
                    {isAuthenticated && isWalletConnectedAndMatching && isLoading && (
                        <div className="flex justify-center items-center py-8 sm:col-span-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="ml-2 rtl:mr-2 text-muted-foreground">Loading inventory...</p>
                        </div>
                    )}
                    {isAuthenticated && isWalletConnectedAndMatching && !isLoading && aggregatedInventory.length === 0 && (
                        <div className="text-center py-8 sm:col-span-2">
                            <PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                            <p className="text-muted-foreground">Your inventory is currently empty.</p>
                            <p className="text-xs text-muted-foreground mt-1">Visit the store to buy some items!</p>
                        </div>
                    )}
                    {isAuthenticated && isWalletConnectedAndMatching && !isLoading && aggregatedInventory.length > 0 && (
                        aggregatedInventory.map((itemGroup) => {
                            const currentCount = getItemCount(itemGroup.definition.id);
                            const isConsumable = ['1', '2', '3', '4'].includes(itemGroup.definition.id); // Check if item is consumable
                            return (
                                <Card key={itemGroup.definition.id} className="flex flex-col">
                                    <CardHeader className="flex-row items-center gap-3 p-4 space-y-0">
                                        <Image 
                                            src={itemGroup.definition.image || 'https://placehold.co/60x60.png'} 
                                            alt={itemGroup.definition.name} 
                                            width={48} 
                                            height={48} 
                                            className="rounded-md border"
                                            data-ai-hint={itemGroup.definition.dataAiHint || 'item placeholder'} 
                                        />
                                        <div>
                                            <CardTitle className="text-lg">{itemGroup.definition.name}</CardTitle>
                                            <Badge variant="secondary" className="mt-1">Quantity: {currentCount}</Badge>
                                        </div>
                                    </CardHeader>
                                    {itemGroup.definition.description && (
                                        <CardContent className="p-4 pt-0">
                                            <CardDescription className="text-xs">{itemGroup.definition.description}</CardDescription>
                                            {isConsumable && currentCount > 0 && (
                                                <Button 
                                                    variant="default" 
                                                    size="sm" 
                                                    className="mt-3 w-full"
                                                    onClick={() => onUseConsumableItem(itemGroup.definition.id)}
                                                >
                                                    Use Item
                                                </Button>
                                            )}
                                        </CardContent>
                                    )}
                                </Card>
                            );
                        })
                    )}
                </div>
            </ScrollArea>
             <SheetFooter className="p-4 border-t mt-auto">
                {/* The requested text to remove was here. It is now gone. */}
            </SheetFooter>
        </>
    );
};
export default PlayerInventory;

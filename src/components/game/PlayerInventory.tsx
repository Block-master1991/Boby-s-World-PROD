
'use client';

import React, { useState, useEffect } from 'react';
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

interface AggregatedInventoryItem {
    definition: StoreItemDefinition;
    count: number;
}

const PlayerInventory: React.FC = () => {
    const { sessionPublicKey } = useSessionWallet();
    const { toast } = useToast();
    const [aggregatedInventory, setAggregatedInventory] = useState<AggregatedInventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!sessionPublicKey || !db) {
            setAggregatedInventory([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const playerDocRef = doc(db, 'players', sessionPublicKey.toBase58());

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
    }, [sessionPublicKey, toast]);
    
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
                    {!sessionPublicKey && (
                        <p className="text-sm text-muted-foreground text-center py-8 sm:col-span-2">Connect your wallet to view your inventory.</p>
                    )}
                    {sessionPublicKey && isLoading && (
                        <div className="flex justify-center items-center py-8 sm:col-span-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="ml-2 rtl:mr-2 text-muted-foreground">Loading inventory...</p>
                        </div>
                    )}
                    {sessionPublicKey && !isLoading && aggregatedInventory.length === 0 && (
                        <div className="text-center py-8 sm:col-span-2">
                            <PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                            <p className="text-muted-foreground">Your inventory is currently empty.</p>
                            <p className="text-xs text-muted-foreground mt-1">Visit the store to buy some items!</p>
                        </div>
                    )}
                    {sessionPublicKey && !isLoading && aggregatedInventory.length > 0 && (
                        aggregatedInventory.map((itemGroup) => (
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
                                        <Badge variant="secondary" className="mt-1">Quantity: {itemGroup.count}</Badge>
                                    </div>
                                </CardHeader>
                                {itemGroup.definition.description && (
                                    <CardContent className="p-4 pt-0">
                                        <CardDescription className="text-xs">{itemGroup.definition.description}</CardDescription>
                                    </CardContent>
                                )}
                            </Card>
                        ))
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

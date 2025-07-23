'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PackageSearch, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { storeItems, type StoreItemDefinition } from '@/lib/items';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Import Input component
import { Plus, Minus } from 'lucide-react'; // Removed Maximize icon, will use text

interface AggregatedInventoryItem {
    definition: StoreItemDefinition;
    count: number;
}

interface PlayerInventoryProps {
    onUseConsumableItem: (itemId: string, amount: number) => Promise<void>;
    speedyPawsTreatCount: number;
    guardianShieldCount: number;
    protectionBoneCount: number;
    coinMagnetTreatCount: number;
}

const PlayerInventory: React.FC<PlayerInventoryProps> = ({
    onUseConsumableItem,
    speedyPawsTreatCount,
    guardianShieldCount,
    protectionBoneCount,
    coinMagnetTreatCount,
}) => {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false); // Inventory counts are now passed as props, no need to fetch here
    const [error, setError] = useState<string | null>(null);
    // New state to manage quantity to use for each item
    const [quantitiesToUse, setQuantitiesToUse] = useState<Record<string, number>>({});

    // Aggregate inventory items based on passed counts
    const aggregatedInventory = React.useMemo(() => {
        const items: AggregatedInventoryItem[] = [];
        if (protectionBoneCount > 0) {
            const def = storeItems.find(item => item.id === '1');
            if (def) items.push({ definition: def, count: protectionBoneCount });
        }
        if (guardianShieldCount > 0) {
            const def = storeItems.find(item => item.id === '2');
            if (def) items.push({ definition: def, count: guardianShieldCount });
        }
        if (speedyPawsTreatCount > 0) {
            const def = storeItems.find(item => item.id === '3');
            if (def) items.push({ definition: def, count: speedyPawsTreatCount });
        }
        if (coinMagnetTreatCount > 0) {
            const def = storeItems.find(item => item.id === '4');
            if (def) items.push({ definition: def, count: coinMagnetTreatCount });
        }
        return items;
    }, [protectionBoneCount, guardianShieldCount, speedyPawsTreatCount, coinMagnetTreatCount]);

    // Initialize quantitiesToUse when aggregatedInventory changes
    useEffect(() => {
        const initialQuantities: Record<string, number> = {};
        aggregatedInventory.forEach(item => {
            initialQuantities[item.definition.id] = item.count > 0 ? 1 : 0;
        });
        setQuantitiesToUse(initialQuantities);
    }, [aggregatedInventory]);
    
    // Helper to get current count for a specific item ID from props
    const getItemCount = useCallback((itemId: string) => {
        switch (itemId) {
            case '1': return protectionBoneCount;
            case '2': return guardianShieldCount;
            case '3': return speedyPawsTreatCount;
            case '4': return coinMagnetTreatCount;
            default: return 0;
        }
    }, [protectionBoneCount, guardianShieldCount, speedyPawsTreatCount, coinMagnetTreatCount]);

    // Handlers for quantity input
    const handleQuantityChange = useCallback((itemId: string, value: number) => {
        const currentCount = getItemCount(itemId);
        const newQuantity = Math.max(1, Math.min(value, currentCount)); // Ensure quantity is between 1 and currentCount
        setQuantitiesToUse(prev => ({ ...prev, [itemId]: newQuantity }));
    }, [getItemCount]);

    const handleIncrement = useCallback((itemId: string) => {
        const currentCount = getItemCount(itemId);
        setQuantitiesToUse(prev => {
            const currentQuantity = prev[itemId] || 0;
            return { ...prev, [itemId]: Math.min(currentQuantity + 1, currentCount) };
        });
    }, [getItemCount]);

    const handleDecrement = useCallback((itemId: string) => {
        setQuantitiesToUse(prev => {
            const currentQuantity = prev[itemId] || 0;
            return { ...prev, [itemId]: Math.max(currentQuantity - 1, 1) }; // Minimum 1
        });
    }, []);

    const handleMaximize = useCallback((itemId: string) => {
        const currentCount = getItemCount(itemId);
        setQuantitiesToUse(prev => ({ ...prev, [itemId]: currentCount }));
    }, [getItemCount]);


    return (
        <>
            <SheetHeader className="p-6 pb-4 border-b">
                <SheetTitle className="text-2xl font-headline flex items-center gap-2">
                    <Image src="/PlayerInventory.png" alt="Inventory Icon" width={28} height={28} className="h-7 w-7" /> Inventory
                </SheetTitle>
                <SheetDescription>Items you own and the count of each.</SheetDescription>
            </SheetHeader>
            <ScrollArea className="flex-grow">
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {isLoading && (
                        <div className="flex justify-center items-center py-8 sm:col-span-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="ml-2 rtl:mr-2 text-muted-foreground">Loading inventory...</p>
                        </div>
                    )}
                    {error && (
                        <div className="text-center py-8 sm:col-span-2 text-red-500">
                            <p className="text-lg mb-4">Error: {error}</p>
                            <p className="text-sm">Please ensure you are logged in.</p>
                        </div>
                    )}
                    {!isLoading && !error && aggregatedInventory.length === 0 && (
                        <div className="text-center py-8 sm:col-span-2">
                            <PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                            <p className="text-muted-foreground">Your inventory is currently empty.</p>
                            <p className="text-xs text-muted-foreground mt-1">Visit the store to buy some items!</p>
                        </div>
                    )}
                    {!isLoading && !error && aggregatedInventory.length > 0 && (
                        aggregatedInventory.map((itemGroup) => {
                            const currentCount = getItemCount(itemGroup.definition.id);
                            const isConsumable = ['1', '2', '3', '4'].includes(itemGroup.definition.id); // Check if item is consumable
                            const quantity = quantitiesToUse[itemGroup.definition.id] || 1; // Default to 1

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
                                        <CardContent className="p-4 pt-0 flex flex-col flex-grow">
                                        <CardDescription className="text-xs mb-2">{itemGroup.definition.description}</CardDescription>
                                        {isConsumable && currentCount > 0 && (
                                            <>
                                                <div className="flex items-center justify-center space-x-2 mt-4">
                                                    <Button 
                                                        variant="outline" 
                                                        size="icon" 
                                                        className="h-9 w-9" // Standardized height and width
                                                        onClick={() => handleDecrement(itemGroup.definition.id)}
                                                        disabled={quantity <= 1}
                                                    >
                                                        <Minus className="h-4 w-4" />
                                                    </Button>
                                                    <Input
                                                        type="number"
                                                        value={quantity}
                                                        onChange={(e) => handleQuantityChange(itemGroup.definition.id, parseInt(e.target.value))}
                                                        className="w-24 text-center no-spinners flex-grow h-9" // Added h-9 to match button height
                                                        min={1}
                                                        max={currentCount}
                                                    />
                                                    <Button 
                                                        variant="outline" 
                                                        size="icon" 
                                                        className="h-9 w-9" // Standardized height and width
                                                        onClick={() => handleIncrement(itemGroup.definition.id)}
                                                        disabled={quantity >= currentCount}
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="h-9 text-xs px-2 py-1" // Standardized height, kept text-xs and padding
                                                        onClick={() => handleMaximize(itemGroup.definition.id)}
                                                        disabled={quantity === currentCount}
                                                    >
                                                        Max
                                                    </Button>
                                                </div>
                                                <Button 
                                                    variant="default" 
                                                    size="sm" 
                                                    className="mt-4 w-full text-xs px-2 py-1" // Changed mt-3 to mt-4
                                                    onClick={() => onUseConsumableItem(itemGroup.definition.id, quantity)}
                                                    disabled={quantity === 0}
                                                >
                                                    Use {quantity} Item(s)
                                                </Button>
                                            </>
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

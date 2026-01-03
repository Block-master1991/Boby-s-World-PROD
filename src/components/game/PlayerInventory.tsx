'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PackageSearch } from 'lucide-react';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getStoreItemsActiveWithIcons, type StoreItemDefinition } from '@/lib/items';
import { Badge } from '@/components/ui/badge';
import InventoryItemSkeleton from '@/components/shared/InventoryItemSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // Import Input component
import { Plus, Minus } from 'lucide-react'; // Removed Maximize icon, will use text
import { useUserInventory, useConsumableItem } from '@/hooks/useGraphQL';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { logger } from '@/utils/logger';
import { useToast } from '@/hooks/use-toast';

interface AggregatedInventoryItem {
    definition: StoreItemDefinition;
    count: number;
}

interface PlayerInventoryProps {
    onUseConsumableItem: (itemId: string, amount: number) => Promise<void>;
    speedyPawsTreatCount: number;
    guardianShieldCount: number;
    protectionBottleCount: number;
    coinMagnetTreatCount: number;
}

const PlayerInventory: React.FC<PlayerInventoryProps> = ({
    onUseConsumableItem,
    speedyPawsTreatCount,
    guardianShieldCount,
    protectionBottleCount,
    coinMagnetTreatCount,
}) => {
    const { sessionPublicKey } = useSessionWallet();
    const [quantitiesToUse, setQuantitiesToUse] = useState<Record<string, number>>({});
    const [storeItemsData, setStoreItemsData] = useState<StoreItemDefinition[]>([]);
    const [storeItemsLoaded, setStoreItemsLoaded] = useState(false);
    const [showSkeletons, setShowSkeletons] = useState(true);

    const { toast } = useToast();

    // Load store items on component mount
    useEffect(() => {
        async function loadStoreItems() {
            try {
                const items = await getStoreItemsActiveWithIcons();
                setStoreItemsData(items);
                setStoreItemsLoaded(true);
            } catch (error) {
                logger.error('Error loading store items:', error);
                setStoreItemsLoaded(true); // Even on error, consider it loaded
            }
        }
        loadStoreItems();
    }, []);
    // GraphQL inventory data (primary source)
    const { data: inventoryData, loading: graphqlLoading, error: graphqlError, execute: refetchInventory } = useUserInventory(sessionPublicKey?.toBase58() || '');
    const { useItem, loading: useItemLoading } = useConsumableItem();

    // Control skeleton display with smooth transition
    useEffect(() => {
        if (!graphqlLoading && storeItemsLoaded) {
            // Add a small delay before hiding skeletons for smooth transition
            const timer = setTimeout(() => {
                setShowSkeletons(false);
            }, 300);
            return () => clearTimeout(timer);
        } else {
            setShowSkeletons(true);
        }
    }, [graphqlLoading, storeItemsLoaded]);

    // Extract counts from GraphQL data or fallback to props
    const protectionBottleCountFinal = inventoryData?.userInventory?.protectionBottleCount ?? protectionBottleCount;
    const guardianShieldCountFinal = inventoryData?.userInventory?.guardianShieldCount ?? guardianShieldCount;
    const speedyPawsTreatCountFinal = inventoryData?.userInventory?.speedyPawsTreatCount ?? speedyPawsTreatCount;
    const coinMagnetTreatCountFinal = inventoryData?.userInventory?.coinMagnetTreatCount ?? coinMagnetTreatCount;

    // Aggregate inventory items based on counts (GraphQL preferred, props fallback)
    const aggregatedInventory = React.useMemo(() => {
        const items: AggregatedInventoryItem[] = [];
        if (protectionBottleCountFinal > 0) {
            const def = storeItemsData.find(item => item.id === '1');
            if (def) items.push({ definition: def, count: protectionBottleCountFinal });
        }
        if (guardianShieldCountFinal > 0) {
            const def = storeItemsData.find(item => item.id === '2');
            if (def) items.push({ definition: def, count: guardianShieldCountFinal });
        }
        if (speedyPawsTreatCountFinal > 0) {
            const def = storeItemsData.find(item => item.id === '3');
            if (def) items.push({ definition: def, count: speedyPawsTreatCountFinal });
        }
        if (coinMagnetTreatCountFinal > 0) {
            const def = storeItemsData.find(item => item.id === '4');
            if (def) items.push({ definition: def, count: coinMagnetTreatCountFinal });
        }
        return items;
    }, [protectionBottleCountFinal, guardianShieldCountFinal, speedyPawsTreatCountFinal, coinMagnetTreatCountFinal, storeItemsData]);

    // Initialize quantitiesToUse when aggregatedInventory changes
    useEffect(() => {
        const initialQuantities: Record<string, number> = {};
        aggregatedInventory.forEach(item => {
            initialQuantities[item.definition.id] = item.count > 0 ? 1 : 0;
        });
        setQuantitiesToUse(initialQuantities);
    }, [aggregatedInventory]);

    // Helper to get current count for a specific item ID
    const getItemCount = useCallback((itemId: string) => {
        switch (itemId) {
            case '1': return protectionBottleCountFinal;
            case '2': return guardianShieldCountFinal;
            case '3': return speedyPawsTreatCountFinal;
            case '4': return coinMagnetTreatCountFinal;
            default: return 0;
        }
    }, [protectionBottleCountFinal, guardianShieldCountFinal, speedyPawsTreatCountFinal, coinMagnetTreatCountFinal]);

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
                    {/* Show loading state while fetching GraphQL data */}
                    {showSkeletons && (
                        <>
                            <InventoryItemSkeleton />
                            <InventoryItemSkeleton />
                            <InventoryItemSkeleton />
                            <InventoryItemSkeleton />
                        </>
                    )}

                    {/* Show error state */}
                    {graphqlError && !graphqlLoading && (
                        <div className="text-center py-8 sm:col-span-2">
                            <p className="text-destructive mb-4">Failed to load inventory</p>
                            <Button onClick={() => refetchInventory()} variant="outline">
                                Retry
                            </Button>
                        </div>
                    )}

                    {/* Show empty state only after loading is complete */}
                    {!graphqlLoading && !graphqlError && storeItemsLoaded && aggregatedInventory.length === 0 && (
                        <div className="text-center py-8 sm:col-span-2">
                            <PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                            <p className="text-muted-foreground">Your inventory is currently empty.</p>
                            <p className="text-xs text-muted-foreground mt-1">Visit the store to buy some items!</p>
                        </div>
                    )}

                    {/* Render inventory items only after loading is complete and no errors */}
                    {!graphqlLoading && !graphqlError && storeItemsLoaded && aggregatedInventory.length > 0 && (
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
                                                        onClick={async () => {
                                                            try {
                                                                // Use the prop method because it triggers game effects (speed boost, shield, etc.)
                                                                // and handles optimistic updates in GameUI.
                                                                await onUseConsumableItem(itemGroup.definition.id, quantity);

                                                                // Also manually trigger a refetch of GraphQL data to keep it in sync
                                                                if (sessionPublicKey) {
                                                                    await refetchInventory();
                                                                }
                                                            } catch (error) {
                                                                logger.error('[PlayerInventory] Failed to use item:', error);
                                                                toast({
                                                                    title: 'Error',
                                                                    description: error instanceof Error ? error.message : 'Unknown error',
                                                                    variant: 'destructive',
                                                                });
                                                            }
                                                        }}
                                                        disabled={quantity === 0 || useItemLoading}
                                                    >
                                                        {useItemLoading ? 'Using...' : `Use ${quantity} Item(s)`}
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

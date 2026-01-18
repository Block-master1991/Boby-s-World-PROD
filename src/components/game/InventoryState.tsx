/**
 * Component for empty and error states in inventory
 */

import { Button } from '@/components/ui/button';
import { PackageSearch } from 'lucide-react';
import React from 'react';

interface InventoryStateProps {
    type: 'empty' | 'error';
    onRetry?: () => void;
}

const InventoryState: React.FC<InventoryStateProps> = ({ type, onRetry }) => {
    if (type === 'error') {
        return (
            <div className="text-center py-8 sm:col-span-2">
                <p className="text-destructive mb-4">Failed to load inventory</p>
                <Button onClick={onRetry} variant="outline">
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="text-center py-8 sm:col-span-2">
            <PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">Your inventory is currently empty.</p>
            <p className="text-xs text-muted-foreground mt-1">Visit the store to buy some items!</p>
        </div>
    );
};

export default InventoryState;

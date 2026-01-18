/**
 * Component for quantity selection logic in inventory cards
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus } from 'lucide-react';
import React from 'react';

interface ItemQuantitySelectorProps {
    quantity: number;
    maxCount: number;
    isDisabled: boolean;
    onIncrement: () => void;
    onDecrement: () => void;
    onMax: () => void;
    onChange: (value: number) => void;
}

const ItemQuantitySelector: React.FC<ItemQuantitySelectorProps> = ({
    quantity,
    maxCount,
    isDisabled,
    onIncrement,
    onDecrement,
    onMax,
    onChange,
}) => {
    return (
        <div className="flex items-center justify-center space-x-2 mt-4">
            <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={onDecrement}
                disabled={quantity <= 1 || isDisabled}
            >
                <Minus className="h-4 w-4" />
            </Button>
            <Input
                type="number"
                value={quantity}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className="w-24 text-center no-spinners flex-grow h-9"
                min={1}
                max={maxCount}
                disabled={isDisabled}
            />
            <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={onIncrement}
                disabled={quantity >= maxCount || isDisabled}
            >
                <Plus className="h-4 w-4" />
            </Button>
            <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs px-2 py-1"
                onClick={onMax}
                disabled={quantity === maxCount || isDisabled}
            >
                Max
            </Button>
        </div>
    );
};

export default ItemQuantitySelector;

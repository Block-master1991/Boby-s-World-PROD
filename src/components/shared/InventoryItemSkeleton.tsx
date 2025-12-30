import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const ShimmerSkeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
    <div className={`relative overflow-hidden bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer"></div>
    </div>
);

const InventoryItemSkeleton: React.FC = () => {
    return (
        <Card className="flex flex-col border border-gray-200 shadow-sm">
            <CardHeader className="flex-row items-center gap-3 p-4 space-y-0">
                <ShimmerSkeleton className="h-[48px] w-[48px]" />
                <div className="flex-1 space-y-3">
                    <ShimmerSkeleton className="h-5 w-3/4" />
                    <ShimmerSkeleton className="h-5 w-1/4" />
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex flex-col flex-grow space-y-3">
                <ShimmerSkeleton className="h-4 w-full mb-2" />
                <div className="flex items-center justify-center space-x-2 mt-4">
                    <ShimmerSkeleton className="h-9 w-9" />
                    <ShimmerSkeleton className="h-9 w-24" />
                    <ShimmerSkeleton className="h-9 w-9" />
                    <ShimmerSkeleton className="h-9 w-12" />
                </div>
                <ShimmerSkeleton className="h-8 w-full" />
            </CardContent>
        </Card>
    );
};

export default InventoryItemSkeleton;

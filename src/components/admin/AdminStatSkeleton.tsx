import React from "react";
import { Card, CardContent } from "@/components/ui/card";

const ShimmerSkeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`relative overflow-hidden bg-muted rounded ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent animate-shimmer"></div>
  </div>
);

export const AdminStatSkeleton: React.FC = () => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center">
          <ShimmerSkeleton className="h-8 w-8 rounded-full mr-3" />
          <div className="space-y-2 flex-1">
            <ShimmerSkeleton className="h-6 w-12" />
            <ShimmerSkeleton className="h-3 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const AdminUserStatsSkeleton: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <ShimmerSkeleton className="h-4 w-28" />
        <ShimmerSkeleton className="h-4 w-8" />
      </div>
      <div className="flex justify-between items-center">
        <ShimmerSkeleton className="h-4 w-24" />
        <ShimmerSkeleton className="h-4 w-8" />
      </div>
      <div className="flex justify-between items-center">
        <ShimmerSkeleton className="h-4 w-16" />
        <ShimmerSkeleton className="h-4 w-8" />
      </div>
      <ShimmerSkeleton className="h-5 w-20 mt-2 rounded-full" />
    </div>
  );
};

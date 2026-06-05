import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const ShimmerSkeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`relative overflow-hidden bg-muted rounded ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/5 to-transparent animate-shimmer"></div>
  </div>
);

export const AdminItemSkeleton: React.FC = () => {
  return (
    <Card className="relative overflow-hidden border border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <ShimmerSkeleton className="h-12 w-12 rounded-md" />
            <div className="space-y-2">
              <ShimmerSkeleton className="h-5 w-24" />
              <ShimmerSkeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="flex gap-1">
            <ShimmerSkeleton className="h-8 w-8 rounded-md" />
            <ShimmerSkeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2 mb-4">
          <ShimmerSkeleton className="h-3 w-full" />
          <ShimmerSkeleton className="h-3 w-3/4" />
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="space-y-2">
            <ShimmerSkeleton className="h-4 w-16" />
            <ShimmerSkeleton className="h-3 w-12" />
          </div>

          <div className="flex gap-2">
            <ShimmerSkeleton className="h-5 w-16 rounded-full" />
            <ShimmerSkeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <ShimmerSkeleton className="h-5 w-16 rounded-full" />
          <ShimmerSkeleton className="h-3 w-20" />
        </div>
      </CardContent>
    </Card>
  );
};

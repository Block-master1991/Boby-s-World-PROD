"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PawPrint } from "lucide-react";

export function OverviewWelcomeBanner() {
  return (
    <Card className="border-0 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-500/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Welcome back, Admin</CardTitle>
            <CardDescription className="mt-1">
              Here&apos;s what&apos;s happening with Boby World today.
            </CardDescription>
          </div>
          <div className="hidden md:block">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg">
              <PawPrint className="h-8 w-8 text-white" />
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

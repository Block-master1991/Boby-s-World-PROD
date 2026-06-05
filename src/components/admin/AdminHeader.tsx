"use client";

import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { PawPrint } from "lucide-react";

interface AdminHeaderProps {
  label: string;
  publicKey?: string | undefined;
}

export function AdminHeader({ label, publicKey }: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border/50 px-6 bg-background/60 backdrop-blur-lg shadow-sm">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-1 h-9 w-9 hover:bg-muted/50 transition-colors rounded-lg" />
        <div className="h-6 w-[1px] bg-border/60" />
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm md:hidden">
            <PawPrint className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            {label}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-full bg-green-500/5 border border-green-500/20 text-[11px] font-medium text-green-600 uppercase tracking-wider">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          Live System
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="px-2.5 py-1 text-xs font-mono bg-muted/50 border-border/50"
          >
            {publicKey?.slice(0, 6)}...{publicKey?.slice(-4)}
          </Badge>
        </div>
      </div>
    </header>
  );
}

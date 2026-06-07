"use client";

import { TwoFactorManagement } from "@/components/auth/TwoFactorManagement";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Activity, ExternalLink, Fingerprint, Shield } from "lucide-react";
import Link from "next/link";
import React from "react";

interface SecuritySectionProps {
  securityLevel?: string;
  isOnline?: boolean;
  performanceStats?: {
    averageLoadTime?: string;
    cacheHitRate?: string;
  };
}

export const SecuritySection: React.FC<SecuritySectionProps> = ({
  securityLevel,
  isOnline,
  performanceStats,
}) => (
  <div className="mt-4 pt-4 border-t">
    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-primary">
      <Shield size={16} /> Security & Privacy
    </h3>
    <div className="space-y-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full justify-start text-sm">
            <Fingerprint className="mr-2 h-4 w-4" />
            Two-Factor Authentication
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>Account Security</DialogTitle>
            <DialogDescription>
              Manage your account security settings and two-factor authentication options.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 pt-2">
            <TwoFactorManagement />
          </div>
        </DialogContent>
      </Dialog>

      <Link href="/settings?tab=security" passHref>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs text-muted-foreground gap-2"
        >
          <ExternalLink size={12} />
          Open Full Security Settings
        </Button>
      </Link>

      <div className="p-2 bg-secondary/30 rounded-md text-[10px] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Activity
            size={10}
            className={securityLevel === "Maximum" ? "text-amber-500" : "text-green-500"}
          />
          <span>{securityLevel} Protection Active</span>
        </div>
        <span className="text-green-600 font-bold uppercase tracking-wider">
          {isOnline ? "Verified" : "Offline"}
        </span>
      </div>

      {performanceStats && (
        <div className="px-2 py-1 text-[9px] text-muted-foreground/50 flex justify-between italic">
          <span>Latency: {performanceStats.averageLoadTime || "N/A"}</span>
          <span>Optimized: {performanceStats.cacheHitRate || "0%"}</span>
        </div>
      )}
    </div>
  </div>
);

'use client';

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ServerOff, ShieldAlert } from 'lucide-react';

interface SecurityAlertsProps {
  redisStatus: string;
  isPanicMode: boolean;
}

export function SecurityAlerts({ redisStatus, isPanicMode }: SecurityAlertsProps) {
  return (
    <>
      {/* System Status Alert */}
      {redisStatus !== 'connected' && (
        <Alert variant="destructive">
          <ServerOff className="h-4 w-4" />
          <AlertTitle>Connection Issue</AlertTitle>
          <AlertDescription>
            Could not connect to Redis Stats Service. Real-time metrics may be unavailable.
            (Status: {redisStatus})
          </AlertDescription>
        </Alert>
      )}

      {/* Panic Mode Active Alert */}
      {isPanicMode && (
        <Alert className="border-red-500 bg-red-50 dark:bg-red-900/20">
          <ShieldAlert className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-600 font-bold">PANIC MODE ACTIVE</AlertTitle>
          <AlertDescription className="text-red-600">
            System is currently in lockdown. Strict rate limits (80% reduction) are enforced.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

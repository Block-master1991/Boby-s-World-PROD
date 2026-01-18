'use client';

import { Button } from "@/components/ui/button";
import { ShieldAlert } from 'lucide-react';

interface PanicModeControlProps {
  isPanicMode: boolean;
  isProcessing: boolean;
  onToggle: () => void;
}

export function PanicModeControl({ isPanicMode, isProcessing, onToggle }: PanicModeControlProps) {
  return (
    <div className="flex gap-4">
      <Button
        variant={isPanicMode ? "secondary" : "destructive"}
        className="w-full md:w-auto"
        onClick={onToggle}
        disabled={isProcessing}
      >
        <ShieldAlert className="mr-2 h-4 w-4" />
        {isPanicMode ? 'DEACTIVATE PANIC MODE' : 'ACTIVATE PANIC MODE'}
      </Button>
    </div>
  );
}

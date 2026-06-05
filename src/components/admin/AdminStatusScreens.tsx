"use client";

import { PawPrint } from "lucide-react";

export function AdminLoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8">
      <PawPrint className="h-16 w-16 animate-pulse text-primary mb-4" />
      <p className="text-xl">Verifying admin access...</p>
    </div>
  );
}

export function AdminAccessDeniedScreen({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8">
      <PawPrint className="h-16 w-16 animate-pulse text-primary mb-4" />
      <p className="text-xl">
        {!isAuthenticated ? "Session expired. Redirecting..." : "Access denied. Redirecting..."}
      </p>
    </div>
  );
}

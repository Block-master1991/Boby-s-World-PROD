
'use client';

import React, { useEffect } from 'react'; // Removed useState
import { useAuth } from '@/hooks/useAuth'; // Will now use context-aware useAuth
import { ADMIN_WALLET_ADDRESS } from '@/lib/constants';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Home, LogOut } from 'lucide-react'; // ShieldAlert removed
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSessionWallet } from '@/hooks/useSessionWallet';

export default function AdminPage() {
  console.log("[AdminPage] Effective ADMIN_WALLET_ADDRESS:", ADMIN_WALLET_ADDRESS);

  const { isLoading: isAuthHookLoading, user, logout: logoutAuthHook } = useAuth();
  const { disconnectFromSession } = useSessionWallet();
  const router = useRouter();
  const pathname = usePathname(); // Get the current path

  useEffect(() => {
    console.log(`[AdminPage] Effect triggered. AuthLoading: ${isAuthHookLoading}, AuthUser PK: ${user?.publicKey}, Current Path: ${pathname}`);

    if (isAuthHookLoading) {
      console.log("[AdminPage] Auth hook is loading. Waiting for auth state to settle.");
      return; // Wait for auth state to settle
    }

    // Auth is NOT loading at this point.
    if (user?.publicKey === ADMIN_WALLET_ADDRESS) {
      console.log("[AdminPage] User is admin (verified by useAuth.user). Showing admin content.");
      // Content will show directly based on render logic below
    } else {
      // If auth is not loading, and user is not admin (or user is null)
      console.log(`[AdminPage] Auth not loading, and user is not admin (User PK: ${user?.publicKey}). Redirecting to home.`);
      if (pathname !== '/') { 
        router.push('/');
      }
    }
  }, [isAuthHookLoading, user, pathname, ADMIN_WALLET_ADDRESS]);

  if (isAuthHookLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl">Verifying admin access...</p>
      </div>
    );
  }
  
  if (user?.publicKey !== ADMIN_WALLET_ADDRESS) {
    // This state occurs if auth is done loading, but user is not admin.
    // The useEffect above will trigger a redirect, but this provides an interim UI.
    console.warn("[AdminPage] Render guard: User is not admin after auth loading. Redirect should be in progress.");
    return ( 
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8">
          <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
          <p className="text-xl">Redirecting...</p>
        </div>
    );
  }

  // If auth is done loading AND user IS admin
  return (
    <div className="flex flex-col items-center min-h-screen bg-background text-foreground p-4 md:p-8">
      <header className="w-full max-w-4xl py-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl md:text-4xl font-bold text-primary">Admin Dashboard</h1>
          <Button
            onClick={async () => {
              console.log("[AdminPage] Logout button clicked. Logging out from auth hook...");
              await logoutAuthHook();
              console.log("[AdminPage] Auth hook logout complete. Disconnecting wallet session...");
              await disconnectFromSession(); // This comes from useSessionWallet
              console.log("[AdminPage] Wallet session disconnect complete. Redirecting to home.");
              router.push('/'); 
            }}
            variant="outline"
            size="sm"
          >
            <LogOut className="mr-2 h-4 w-4" /> Logout & Disconnect
          </Button>
        </div>
        <p className="text-muted-foreground mt-1">Welcome, Admin! Wallet: {user?.publicKey || 'N/A'}</p>
      </header>

      <main className="w-full max-w-4xl mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>Admin panel content for Boby's World.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Manage game settings, view player statistics, and oversee the Boby ecosystem.</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-card/50">
                    <CardHeader>
                        <CardTitle className="text-lg">User Statistics</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Total Players: Fetching...</p>
                        <p className="text-sm text-muted-foreground">Online Now: Fetching...</p>
                    </CardContent>
                </Card>
                 <Card className="bg-card/50">
                    <CardHeader>
                        <CardTitle className="text-lg">Game Settings</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">Modify game parameters here.</p>
                    </CardContent>
                </Card>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

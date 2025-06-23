
'use client';

import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { Button, type ButtonProps } from '@/components/ui/button';
import { LogOut, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter, usePathname } from 'next/navigation'; // For potential redirect

interface DisconnectButtonProps extends Omit<ButtonProps, 'onClick' | 'disabled' | 'children'> {
  onDisconnect?: () => void; // Optional callback after disconnect
  redirectPath?: string;     // Optional path to redirect to
}

const DisconnectButton: React.FC<DisconnectButtonProps> = ({ 
  onDisconnect, 
  redirectPath = '/', 
  ...buttonProps 
}) => {
  const { logout: logoutAuthHook, user: authUser } = useAuth();
  const { disconnectFromSession, sessionPublicKey } = useSessionWallet();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname(); // Get current path for potential redirects
  const [isDisconnecting, setIsDisconnecting] = React.useState(false);

  const handleDisconnect = async () => {
    if (!sessionPublicKey) {
      toast({ title: "Not Connected", description: "No active session to disconnect.", variant: "default" });
      return;
    }
    setIsDisconnecting(true);
    toast({ title: "Disconnecting...", description: "Ending your session." });
    try {
      console.log("[DisconnectButton] Logging out from auth hook...");
      await logoutAuthHook();
      console.log("[DisconnectButton] Auth hook logout complete. Disconnecting wallet session...");
      await disconnectFromSession();
      console.log("[DisconnectButton] Wallet session disconnect complete.");
      
      toast({ title: "Disconnected", description: "Session ended successfully.", duration: 3000 });

      if (onDisconnect) {
        onDisconnect();
      }
      
      // Redirect to the specified path (defaults to '/')
      // This will effectively "reload" the page by navigating and re-triggering GameContainer's logic
      if (pathname !== redirectPath) {
        router.push(redirectPath);
      } else {
        // If already on the target path, a push might not trigger a full desired re-render cycle
        // for all layouts. A reload might be more forceful, but router.push is generally preferred.
        // For now, if we are on the same page, the state changes in useAuth/useSessionWallet
        // should be enough to re-render GameContainer and restart the flow.
        // If a hard reload is truly needed, this could be window.location.reload(),
        // but let's see if router.push('/') for the current page is sufficient.
        // Forcing a push even if on the same page to ensure re-evaluation.
        router.push(redirectPath);
      }

    } catch (error: any) {
      console.error("[DisconnectButton] Error during full disconnect process:", error);
      toast({
        title: "Disconnection Error",
        description: `An error occurred: ${error.message || 'Unknown error'}.`,
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <Button
      variant="destructive"
      onClick={handleDisconnect}
      disabled={!sessionPublicKey || isDisconnecting}
      className="w-full text-base py-3"
      {...buttonProps}
    >
      {isDisconnecting ? (
        <Loader2 className="mr-2 rtl:ml-2 h-5 w-5 animate-spin" />
      ) : (
        <LogOut className="mr-2 rtl:ml-2 h-5 w-5" />
      )}
      {isDisconnecting ? 'Disconnecting...' : 'Disconnect Wallet'}
    </Button>
  );
};

export default DisconnectButton;


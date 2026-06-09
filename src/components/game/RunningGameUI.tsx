"use client";

import { useAuth } from "@/hooks/auth/useAuth"; // Import useAuth
import React from "react";

interface RunningGameUIProps {
  onLoadComplete?: (success: boolean) => void;
}

const RunningGameUI: React.FC<RunningGameUIProps> = ({ onLoadComplete }) => {
  const { isAuthenticated, user: authUser, isWalletConnectedAndMatching } = useAuth();

  // Simulate loading completion for smooth transition
  React.useEffect(() => {
    if (!onLoadComplete) return;

    // Small delay to allow fade-in transition of the overlay
    const timer = setTimeout(() => {
      onLoadComplete(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [onLoadComplete]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white text-4xl">
      <h1>Welcome to the Running Game! (Under Construction)</h1>
      {isAuthenticated && authUser?.publicKey && (
        <p className="text-xl mt-4">Authenticated as: {authUser.publicKey}</p>
      )}
      {!isWalletConnectedAndMatching && isAuthenticated && (
        <p className="text-xl mt-2 text-red-400">Wallet Mismatch or Disconnected!</p>
      )}
    </div>
  );
};

export default RunningGameUI;

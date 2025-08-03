'use client';

import React from 'react';
import { useAuth } from '@/hooks/useAuth'; // Import useAuth

const RunningGameUI: React.FC = () => {
    const { isAuthenticated, user: authUser, isWalletConnectedAndMatching } = useAuth();

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

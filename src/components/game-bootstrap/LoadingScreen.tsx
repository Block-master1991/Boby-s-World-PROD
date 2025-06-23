
'use client';

import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import BobyLogo from '@/app/Boby-logo.png'; // Ensure this path is correct

interface LoadingScreenProps {
  message: string;
  showLogo?: boolean;
  isError?: boolean;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message, showLogo = true, isError = false }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8 text-center">
      {showLogo && BobyLogo && (
        <Image 
            src={BobyLogo} 
            alt="Boby's World Logo" 
            width={180} height={180} 
            className="mb-8 rounded-md" 
            data-ai-hint="dog logo"
            priority 
        />
      )}
      {!isError ? (
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-6" />
      ) : (
        <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
      )}
      <h1 className={`text-3xl font-bold mb-3 font-headline ${isError ? 'text-destructive' : 'text-primary'}`}>
        {isError ? 'Configuration Error' : "Loading..."}
      </h1>
      <p className={`text-xl ${isError ? 'text-destructive/80' : 'text-muted-foreground'} max-w-md`}>
        {message}
      </p>
    </div>
  );
};

export default LoadingScreen;

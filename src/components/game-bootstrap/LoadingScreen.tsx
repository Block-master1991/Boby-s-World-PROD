'use client';

import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { Progress } from '@/components/ui/progress'; // Import the Progress component

interface LoadingScreenProps {
  message: string;
  showLogo?: boolean;
  isError?: boolean;
  progress?: number; // Add progress prop
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message, showLogo = true, isError = false, progress }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8 text-center">
      {showLogo && (
        <Image 
            src="/Boby-logo.png" 
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
        {isError ? 'Configuration Error' : ""}
      </h1>
      <p className={`text-xl ${isError ? 'text-destructive/80' : 'text-muted-foreground'} max-w-md`}>
        {message}
      </p>
      {progress !== undefined && !isError && (
        <div className="w-full max-w-md mt-4">
          <Progress value={progress} className="w-full" />
          <p className="text-sm text-muted-foreground mt-2">{Math.round(progress)}%</p>
        </div>
      )}
    </div>
  );
};

export default LoadingScreen;

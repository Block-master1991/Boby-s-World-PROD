'use client';

import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { SoundManagerRef } from '@/components/game/SoundManager';

interface AudioContextType {
  soundManagerRef: React.RefObject<SoundManagerRef>;
  currentScreen: 'captcha' | 'authentication' | 'mainMenu' | 'boby-world' | 'running-game' | 'loading' | 'admin';
  setCurrentScreen: (screen: 'captcha' | 'authentication' | 'mainMenu' | 'boby-world' | 'running-game' | 'loading' | 'admin') => void;
  isMuted: boolean;
  toggleMute: () => void;
  hasUserInteracted: boolean;
  setHasUserInteracted: (interacted: boolean) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const soundManagerRef = useRef<SoundManagerRef>(null);
  const [currentScreen, setCurrentScreenState] = useState<AudioContextType['currentScreen']>('loading');
  const [isMuted, setIsMuted] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  const setCurrentScreen = (screen: AudioContextType['currentScreen']) => {
    setCurrentScreenState(screen);
    if (soundManagerRef.current) {
      soundManagerRef.current.setTrack(screen);
    }
  };

  const toggleMute = () => {
    setIsMuted(prev => {
      if (soundManagerRef.current) {
        soundManagerRef.current.toggleMute();
      }
      return !prev;
    });
  };

  return (
    <AudioContext.Provider value={{ soundManagerRef, currentScreen, setCurrentScreen, isMuted, toggleMute, hasUserInteracted, setHasUserInteracted }}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};

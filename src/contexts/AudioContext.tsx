"use client";

import type { ReactNode } from "react";
import React, { createContext, useContext, useState, useRef } from "react";
import type { SoundManagerRef } from "@/components/game/SoundManager";

interface AudioContextType {
  soundManagerRef: React.RefObject<SoundManagerRef | null>;
  currentScreen:
    | "captcha"
    | "authentication"
    | "mainMenu"
    | "boby-world"
    | "running-game"
    | "loading"
    | "admin";
  setCurrentScreen: (
    screen:
      | "captcha"
      | "authentication"
      | "mainMenu"
      | "boby-world"
      | "running-game"
      | "loading"
      | "admin"
  ) => void;
  isSoundPlaying: boolean;
  toggleSound: () => void;
  hasUserInteracted: boolean;
  setHasUserInteracted: (interacted: boolean) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const soundManagerRef = useRef<SoundManagerRef>(null);
  const [currentScreen, setCurrentScreenState] =
    useState<AudioContextType["currentScreen"]>("loading");
  const [isSoundPlaying, setIsSoundPlaying] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  const setCurrentScreen = (screen: AudioContextType["currentScreen"]) => {
    setCurrentScreenState(screen);
    if (soundManagerRef.current) {
      soundManagerRef.current.setTrack(screen);
    }
  };

  const toggleSound = () => {
    if (soundManagerRef.current) {
      soundManagerRef.current.toggleMute();
      setIsSoundPlaying(prev => !prev);
    }
  };

  return (
    <AudioContext.Provider
      value={{
        soundManagerRef,
        currentScreen,
        setCurrentScreen,
        isSoundPlaying,
        toggleSound,
        hasUserInteracted,
        setHasUserInteracted,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
};

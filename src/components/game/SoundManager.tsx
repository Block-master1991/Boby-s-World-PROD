'use client';

import React, { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react';

export interface SoundManagerRef {
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  playCurrentTrack: () => void;
}

export interface SoundManagerProps {
  currentScreen: 'captcha' | 'authentication' | 'mainMenu' | 'boby-world' | 'running-game' | 'loading' | 'admin';
  isMuted: boolean;
}

const SoundManager = forwardRef<SoundManagerRef, SoundManagerProps>(({ currentScreen, isMuted }, ref) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackSrc = useRef<string | null>(null);
  const [volume, setVolumeState] = useState(0.5); // Internal volume state

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
      audioRef.current.volume = volume;
      audioRef.current.loop = true; // Default to loop
    }
  }, [volume]);

  const playAudio = useCallback((src: string, loop: boolean = true) => {
    if (audioRef.current) {
      if (currentTrackSrc.current === src) {
        // Already playing the correct track, do nothing
        return;
      }
      audioRef.current.pause();
      audioRef.current.src = src;
      audioRef.current.loop = loop;
      audioRef.current.volume = isMuted ? 0 : volume; // Respect mute state
      audioRef.current.play().catch(e => console.error("Error playing audio:", e));
      currentTrackSrc.current = src;
      console.log(`[SoundManager] Playing: ${src}`);
    }
  }, [isMuted, volume]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      currentTrackSrc.current = null;
      console.log("[SoundManager] Audio stopped.");
    }
  }, []);

  // Expose functions via ref
  useImperativeHandle(ref, () => ({
    toggleMute: () => {
      if (audioRef.current) {
        audioRef.current.muted = !audioRef.current.muted;
        audioRef.current.volume = audioRef.current.muted ? 0 : volume;
        console.log(`[SoundManager] Muted: ${audioRef.current.muted}`);
      }
    },
    setVolume: (newVolume: number) => {
      setVolumeState(newVolume);
      if (audioRef.current) {
        audioRef.current.volume = newVolume;
      }
    },
    playCurrentTrack: () => {
      if (audioRef.current && currentTrackSrc.current && !isMuted) {
        audioRef.current.play().catch(e => console.error("Error playing audio on user interaction:", e));
      }
    }
  }));

  useEffect(() => {
    let audioToPlay: string | null = null;

    switch (currentScreen) {
      case 'captcha':
      case 'authentication':
      case 'mainMenu':
        audioToPlay = '/audio/Run_Bobby_start _to_main_menu.mp3';
        break;
      case 'boby-world':
        audioToPlay = '/audio/Boby_On_the_Run_open_world_bg_sound.mp3';
        break;
      case 'running-game':
        audioToPlay = '/audio/Boby_On_the_Run_road_run_bg_sound.mp3';
        break;
      case 'loading':
      case 'admin':
        stopAudio(); // No music for loading or admin screens
        break;
      default:
        stopAudio();
        break;
    }

    if (audioToPlay) {
      playAudio(audioToPlay);
    } else {
      stopAudio();
    }

    // Cleanup on unmount
    return () => {
      stopAudio();
    };
  }, [currentScreen, playAudio, stopAudio]);

  // Update audio element's muted state when isMuted prop changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [isMuted, volume]);


  return null; // This component doesn't render anything visible
});

export default SoundManager;

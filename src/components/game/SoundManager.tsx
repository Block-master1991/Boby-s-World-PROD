'use client';

import React, { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react';

export interface SoundManagerRef {
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  playCurrentTrack: () => void;
  setTrack: (screen: 'captcha' | 'authentication' | 'mainMenu' | 'boby-world' | 'running-game' | 'loading' | 'admin') => void;
}

export interface SoundManagerProps {
  isMuted: boolean;
  hasUserInteracted: boolean; // New prop to indicate user interaction
  onPlaybackBlocked?: () => void; // Callback for when playback is blocked
  currentScreen: 'captcha' | 'authentication' | 'mainMenu' | 'boby-world' | 'running-game' | 'loading' | 'admin'; // Added for internal use
}

const SoundManager = forwardRef<SoundManagerRef, SoundManagerProps>(({ isMuted, hasUserInteracted, onPlaybackBlocked }, ref) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackSrc = useRef<string | null>(null);
  const [volume, setVolumeState] = useState(0.5); // Internal volume state
  const [isAudioReady, setIsAudioReady] = useState(false); // Track if audio element is ready to play
  const [internalCurrentScreen, setInternalCurrentScreen] = useState<SoundManagerProps['currentScreen'] | null>(null); // Internal state for currentScreen

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
      audioRef.current.volume = volume;
      audioRef.current.loop = true; // Default to loop
      audioRef.current.oncanplaythrough = () => setIsAudioReady(true);
      audioRef.current.onerror = (e) => console.error("Audio error:", e);
    }
  }, [volume]);

  const setAudioSource = useCallback((src: string, loop: boolean = true) => {
    if (audioRef.current) {
      if (currentTrackSrc.current === src) {
        console.log(`[SoundManager] Track already set to: ${src}. No change needed.`);
        return;
      }
      audioRef.current.pause();
      audioRef.current.src = src;
      audioRef.current.loop = loop;
      currentTrackSrc.current = src;
      setIsAudioReady(false); // Reset ready state when source changes
      console.log(`[SoundManager] Setting audio source to: ${src}`);
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      currentTrackSrc.current = null;
      setIsAudioReady(false);
      console.log("[SoundManager] Audio stopped.");
    }
  }, []);

  const tryPlayAudio = useCallback(async () => {
    if (audioRef.current && currentTrackSrc.current && !isMuted && isAudioReady) {
      try {
        if (audioRef.current.readyState >= 2 && audioRef.current.paused) {
          await audioRef.current.play();
          console.log(`[SoundManager] Playing: ${currentTrackSrc.current}`);
        }
      } catch (e: any) {
        if (e.name === 'NotAllowedError' || e.name === 'AbortError') {
          console.warn("[SoundManager] Audio playback blocked by browser autoplay policy or aborted:", e.message);
          if (onPlaybackBlocked) {
            onPlaybackBlocked();
          }
        } else {
          console.error("Error playing audio:", e);
        }
      }
    }
  }, [isMuted, isAudioReady, onPlaybackBlocked]);

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
      tryPlayAudio();
    },
    setTrack: (screen: SoundManagerProps['currentScreen']) => {
      setInternalCurrentScreen(screen);
    }
  }));

  // Effect to set audio source based on internalCurrentScreen
  useEffect(() => {
    let audioToSet: string | null = null;

    switch (internalCurrentScreen) {
      case 'captcha':
      case 'authentication':
      case 'mainMenu':
        audioToSet = '/audio/Run_Bobby_start _to_main_menu.mp3';
        break;
      case 'boby-world':
        audioToSet = '/audio/Boby_On_the_Run_open_world_bg_sound.mp3';
        break;
      case 'running-game':
        audioToSet = '/audio/Boby_On_the_Run_road_run_bg_sound.mp3';
        break;
      case 'loading':
      case 'admin':
        stopAudio();
        break;
      default:
        stopAudio();
        break;
    }

    if (audioToSet) {
      setAudioSource(audioToSet);
    } else {
      stopAudio();
    }
  }, [internalCurrentScreen, setAudioSource, stopAudio]);

  // Effect to attempt playback when user interacts and audio is ready
  useEffect(() => {
    if (hasUserInteracted && isAudioReady) {
      tryPlayAudio();
    }
  }, [hasUserInteracted, isAudioReady, tryPlayAudio]);

  // Update audio element's muted state and volume when props change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [isMuted, volume]);


  return null;
});

export default SoundManager;

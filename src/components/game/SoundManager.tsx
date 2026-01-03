'use client';

import { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import { logger } from '@/utils/logger';
import { getModel, putModel } from '../../lib/indexedDB'; // Import IndexedDB utilities

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
  const originalTrackSrc = useRef<string | null>(null); // Track the original audio path, not blob URL
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
      audioRef.current.onerror = (e) => logger.error("Audio error:", e);
    }
  }, [volume]);

  const setAudioSource = useCallback(async (src: string, loop: boolean = true) => {
    if (audioRef.current) {
      // Check if it's the same original track (not blob URL)
      if (originalTrackSrc.current === src) {
        logger.log(`[SoundManager] Same track (${src}), continuing playback.`);
        return;
      }

      // Helper function to load audio with caching
      const loadAudioWithCache = async (audioPath: string, audioName: string): Promise<string> => {
        try {
          // Try to load from IndexedDB first
          const cachedData = await getModel(audioName);
          if (cachedData) {
            logger.log(`[SoundManager] Loading ${audioName} from IndexedDB cache.`);
            const blob = new Blob([cachedData], { type: 'audio/mpeg' });
            return URL.createObjectURL(blob);
          } else {
            logger.log(`[SoundManager] Initial load: Fetching ${audioName} from network.`);
            const response = await fetch(audioPath);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();

            // Validate the arrayBuffer
            if (arrayBuffer.byteLength === 0) {
              throw new Error("Received empty audio buffer");
            }

            // Cache for future use
            await putModel(audioName, arrayBuffer);
            logger.log(`[SoundManager] Successfully cached ${audioName} in IndexedDB.`);

            const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
            return URL.createObjectURL(blob);
          }
        } catch (error) {
          logger.error(`[SoundManager] Professional fallback: Error loading ${audioName}, using direct network path.`, error);
          return audioPath;
        }
      };

      // Clean up previous blob URL if it exists
      if (currentTrackSrc.current && currentTrackSrc.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentTrackSrc.current);
        logger.log(`[SoundManager] Revoked previous blob URL.`);
      }

      audioRef.current.pause();

      // Load audio with caching
      const audioName = src.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'unknown';
      const blobUrl = await loadAudioWithCache(src, `audio_${audioName}`);

      audioRef.current.src = blobUrl;
      audioRef.current.loop = loop;
      currentTrackSrc.current = blobUrl;
      originalTrackSrc.current = src;
      setIsAudioReady(false); // Reset ready state
      logger.log(`[SoundManager] Audio source prepared: ${blobUrl}`);
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;

      if (currentTrackSrc.current && currentTrackSrc.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentTrackSrc.current);
      }

      currentTrackSrc.current = null;
      originalTrackSrc.current = null;
      setIsAudioReady(false);
      logger.log("[SoundManager] Audio stopped and cleaned up.");
    }
  }, []);

  const tryPlayAudio = useCallback(async () => {
    if (audioRef.current && currentTrackSrc.current && !isMuted && isAudioReady) {
      try {
        if (audioRef.current.readyState >= 2 && audioRef.current.paused) {
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
            await playPromise;
            logger.log(`[SoundManager] Playback started: ${originalTrackSrc.current}`);
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
          logger.warn("[SoundManager] Autoplay blocked, awaiting user interaction.", e.message);
          if (onPlaybackBlocked) onPlaybackBlocked();
        } else {
          logger.error("[SoundManager] Critical playback error:", e);
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
        logger.log(`[SoundManager] Muted: ${audioRef.current.muted}`);
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
    const preGameTrack = '/audio/Run_Bobby_start _to_main_menu.mp3';

    switch (internalCurrentScreen) {
      case 'captcha':
      case 'authentication':
      case 'mainMenu':
      case 'loading': // Keep music during loading and transitions
        audioToSet = preGameTrack;
        break;
      case 'boby-world':
        audioToSet = '/audio/Boby_On_the_Run_open_world_bg_sound.mp3';
        break;
      case 'running-game':
        audioToSet = '/audio/Boby_On_the_Run_road_run_bg_sound.mp3';
        break;
      case 'admin':
        // Stop audio on admin page
        stopAudio();
        break;
      default:
        // Stop audio for unknown cases
        stopAudio();
        break;
    }

    if (audioToSet) {
      setAudioSource(audioToSet);
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
SoundManager.displayName = 'SoundManager';
export default SoundManager;

'use client';

import { logger } from '@/utils/logger';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getModel, putModel } from '../../lib/indexedDB';

export type ScreenType = 'captcha' | 'authentication' | 'mainMenu' | 'boby-world' | 'running-game' | 'loading' | 'admin';

export interface SoundManagerRef {
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  playCurrentTrack: () => void;
  setTrack: (screen: ScreenType) => void;
}

export interface SoundManagerProps {
  isMuted: boolean;
  hasUserInteracted: boolean;
  onPlaybackBlocked?: (() => void) | undefined; // Callback for when playback is blocked
  currentScreen: ScreenType;
}

/**
 * PHASE 3: Strict Lint & Object Options
 */
const getTrackForScreen = (screen: ScreenType | null): string | null => {
  const preGame = '/audio/Run_Bobby_start _to_main_menu.mp3';
  switch (screen) {
    case 'captcha':
    case 'authentication':
    case 'mainMenu':
    case 'loading': return preGame;
    case 'boby-world': return '/audio/Boby_On_the_Run_open_world_bg_sound.mp3';
    case 'running-game': return '/audio/Boby_On_the_Run_road_run_bg_sound.mp3';
    default: return null;
  }
};

const loadWithCache = async (path: string, name: string): Promise<string> => {
  try {
    const cached = await getModel(name);
    if (cached) return URL.createObjectURL(new Blob([cached], { type: 'audio/mpeg' }));
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 0) await putModel(name, buf);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
  } catch (e) {
    logger.error(`[SoundManager] Fallback for ${name}:`, e);
    return path;
  }
};

const useSoundState = (initialVolume: number, isMuted: boolean) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(initialVolume);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = 'auto';
      a.volume = volume;
      a.loop = true;
      a.oncanplaythrough = () => setIsReady(true);
      a.onerror = (e) => logger.error("Audio error:", e);
      audioRef.current = a;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [isMuted, volume]);

  return { audioRef, volume, setVolume, isReady, setIsReady };
};

interface AutoPlayerOptions {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  isReady: boolean;
  setIsReady: (r: boolean) => void;
  isMuted: boolean;
  hasUserInteracted: boolean;
  onPlaybackBlocked?: (() => void) | undefined;
}

const useTrackAutoPlayer = (ops: AutoPlayerOptions) => {
  const [screen, setScreen] = useState<ScreenType | null>(null);
  const { audioRef, isReady, setIsReady, isMuted, hasUserInteracted, onPlaybackBlocked } = ops;
  const currentBlobUrl = useRef<string | null>(null);
  const currentOriginalSrc = useRef<string | null>(null);

  const setAudioSource = useCallback(async (src: string, loop: boolean = true) => {
    if (!audioRef.current || currentOriginalSrc.current === src) return;
    if (currentBlobUrl.current?.startsWith('blob:')) URL.revokeObjectURL(currentBlobUrl.current);
    audioRef.current.pause();
    const name = src.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'unknown';
    const blobUrl = await loadWithCache(src, `audio_${name}`);
    audioRef.current.src = blobUrl;
    audioRef.current.loop = loop;
    currentBlobUrl.current = blobUrl;
    currentOriginalSrc.current = src;
    setIsReady(false);
  }, [audioRef, setIsReady]);

  const tryPlay = useCallback(async () => {
    if (!audioRef.current || !currentBlobUrl.current || isMuted || !isReady) return;
    try {
      if (audioRef.current.readyState >= 2 && audioRef.current.paused) await audioRef.current.play();
    } catch (e) {
      if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
        onPlaybackBlocked?.();
      } else logger.error("[SoundManager] Play error:", e);
    }
  }, [audioRef, isMuted, isReady, onPlaybackBlocked]);

  useEffect(() => {
    const track = getTrackForScreen(screen);
    if (track) setAudioSource(track);
    else if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; currentOriginalSrc.current = null; }
  }, [screen, setAudioSource, audioRef]);

  useEffect(() => { if (hasUserInteracted && isReady) tryPlay(); }, [hasUserInteracted, isReady, tryPlay]);

  return { setScreen, tryPlay };
};

const SoundManager = forwardRef<SoundManagerRef, SoundManagerProps>(({ isMuted, hasUserInteracted, onPlaybackBlocked }, ref) => {
  const { audioRef, volume, setVolume, isReady, setIsReady } = useSoundState(0.5, isMuted);
  const { setScreen, tryPlay } = useTrackAutoPlayer({ audioRef, isReady, setIsReady, isMuted, hasUserInteracted, onPlaybackBlocked });

  useImperativeHandle(ref, () => ({
    toggleMute: () => {
      if (!audioRef.current) return;
      audioRef.current.muted = !audioRef.current.muted;
      audioRef.current.volume = audioRef.current.muted ? 0 : volume;
    },
    setVolume: (nv: number) => { setVolume(nv); if (audioRef.current) audioRef.current.volume = nv; },
    playCurrentTrack: () => tryPlay(),
    setTrack: (s: ScreenType) => setScreen(s)
  }));

  return null;
});

SoundManager.displayName = 'SoundManager';
export default SoundManager;

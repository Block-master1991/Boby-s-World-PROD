'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Mountain, PawPrint, Sparkles, Volume2, Zap } from 'lucide-react';
import Image from 'next/image';
import React, { useEffect, useMemo, useState } from 'react';

// --- Types ---

interface LoadingPhase {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  weight: number;
}

interface LoadingTip {
  title: string;
  content: string;
  category: 'gameplay' | 'world' | 'performance' | 'fun';
}

interface LoadingScreenProps {
  message?: string | undefined;
  showLogo?: boolean;
  isError?: boolean;
  progress?: number;
  phase?: string;
  showTips?: boolean;
  currentAsset?: string | undefined;
  loadedAssets?: number | undefined;
  totalAssets?: number | undefined;
  variant?: 'default' | 'indeterminate';
}

export type { LoadingScreenProps };

// --- Constants ---

const loadingPhases: LoadingPhase[] = [
  { id: 'system', name: 'Initializing System', description: 'Preparing game engine components', icon: <Zap className="h-5 w-5" />, weight: 10 },
  { id: 'graphics', name: 'Loading Graphics', description: 'Loading 3D models and textures', icon: <Mountain className="h-5 w-5" />, weight: 30 },
  { id: 'audio', name: 'Loading Audio', description: 'Preparing sound effects and music', icon: <Volume2 className="h-5 w-5" />, weight: 15 },
  { id: 'world', name: 'Building World', description: 'Generating the game environment', icon: <Sparkles className="h-5 w-5" />, weight: 35 },
  { id: 'optimization', name: 'Optimizing', description: 'Final performance optimizations', icon: <PawPrint className="h-5 w-5" />, weight: 10 }
];

const loadingTips: LoadingTip[] = [
  { title: '🐕 Dog Behavior', content: 'Boby loves chasing coins! Use your magnetic treat to collect them from afar.', category: 'gameplay' },
  { title: '🌍 Open World', content: 'Explore a vast procedurally generated world with unique environments and adventures.', category: 'world' },
  { title: '⚡ Speed Boost', content: 'Speedy Paws treats give temporary boosts - perfect for escaping enemies or collecting coins quickly!', category: 'gameplay' },
  { title: '🛡️ Guardian Shield', content: 'Guardian Shields protect you from enemy attacks for a short time. Collect them wisely!', category: 'gameplay' },
  { title: '🎯 Performance Tips', content: 'For best performance, close other browser tabs and ensure you have at least 4GB RAM available.', category: 'performance' },
  { title: '🎮 Animal Friends', content: 'Some animals are friendly collectors, others are sneaky thieves! Learn their behaviors.', category: 'gameplay' },
  { title: '🏃‍♂️ Running Game', content: 'Switch between walk mode and run mode - running costs more but lets you escape predators faster.', category: 'gameplay' },
  { title: '💰 Cryptocurrency', content: 'All transactions use Solana blockchain for fast, secure, and low-fee payments.', category: 'fun' },
  { title: '🗺️ World Exploration', content: 'The world is infinite! Each area has unique coin spawns and animal populations.', category: 'world' },
  { title: '🎵 Audio Experience', content: 'Enjoy immersive 3D audio! Use headphones for the best gaming experience.', category: 'performance' }
];

// --- Styles ---

const LoadingStyles = () => (
  <style jsx global>{`
    @keyframes logoFloat { 0%, 100% { transform: translateY(0px) translateZ(0); } 50% { transform: translateY(-8px) translateZ(0); } }
    @keyframes pawOrbit { 0% { transform: rotate(0deg) translateX(60px) rotate(0deg) translateZ(0); } 100% { transform: rotate(360deg) translateX(60px) rotate(-360deg) translateZ(0); } }
    @keyframes progressFlow { 0% { background-position: -100% 0; } 100% { background-position: 100% 0; } }
    @keyframes floatParticle1 { 0%, 100% { transform: translateY(0px) translateX(0px) scale(1); } 25% { transform: translateY(-20px) translateX(10px) scale(1.1); } 50% { transform: translateY(-10px) translateX(-10px) scale(0.9); } 75% { transform: translateY(-30px) translateX(5px) scale(1.05); } }
    @keyframes floatParticle2 { 0%, 100% { transform: translateY(0px) translateX(0px) rotate(0deg); } 33% { transform: translateY(-15px) translateX(-8px) rotate(120deg); } 66% { transform: translateY(-25px) translateX(12px) rotate(240deg); } }
    @keyframes floatParticle3 { 0%, 100% { transform: translateY(0px) translateX(0px) rotate(0deg) scale(1); } 50% { transform: translateY(-10px) translateX(-5px) rotate(180deg) scale(0.8); } }
    @keyframes logoPulse { 0%, 100% { transform: scale(1) translateZ(0); } 50% { transform: scale(1.1) translateZ(0); } }
  `}</style>
);

// --- Hooks ---

const useProgressAnimation = (progress: number) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (progress >= displayProgress) setDisplayProgress(progress);
    }, 300);
    return () => clearTimeout(timer);
  }, [progress, displayProgress]);
  return displayProgress;
};

const useTimeEstimation = (progress: number, isError: boolean) => {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [startTime] = useState<number>(Date.now());

  useEffect(() => {
    if (isError || progress <= 0 || progress >= 100) return;
    const elapsed = (Date.now() - startTime) / 1000;
    const fraction = progress / 100;
    const estimated = elapsed / fraction;
    const remaining = Math.max(0, estimated - elapsed);
    setTimeLeft(prev => prev === null ? Math.round(remaining) : Math.round(prev * 0.7 + remaining * 0.3));
  }, [progress, isError, startTime]);

  return timeLeft;
};

const useLoadingTips = (showTips: boolean) => {
  const [currentTip, setCurrentTip] = useState<LoadingTip | null>(null);
  useEffect(() => {
    if (!showTips) return;
    const update = () => setCurrentTip(loadingTips[Math.floor(Math.random() * loadingTips.length)] || null);
    update();
    const id = setInterval(update, 4000);
    return () => clearInterval(id);
  }, [showTips]);
  return currentTip;
};

// --- Sub-components ---

const LoadingParticles = () => (
  <div className="absolute inset-0 overflow-hidden">
    {[...Array(5)].map((_, i) => <div key={`l-${i}`} className="absolute w-2 h-2 bg-primary/20 rounded-full blur-sm" style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animation: `floatParticle${i % 3 + 1} ${8 + Math.random() * 6}s infinite` }} />)}
    {[...Array(12)].map((_, i) => <div key={`m-${i}`} className="absolute w-1 h-1 bg-primary/40 rounded-full" style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animation: `floatParticle${i % 3 + 1} ${4 + Math.random() * 4}s infinite` }} />)}
    {[...Array(20)].map((_, i) => <div key={`s-${i}`} className="absolute w-0.5 h-0.5 bg-primary rounded-full animate-pulse" style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 10}s` }} />)}
  </div>
);

const LogoSection = ({ isError }: { isError: boolean }) => (
  <div className="relative mb-8 z-10">
    <div className="rounded-lg" style={{ animation: !isError ? 'logoFloat 6s infinite' : undefined }}>
      <Image src="/Boby-logo.png" alt="Logo" width={120} height={120} priority className="rounded-lg" />
    </div>
    {!isError && (
      <div className="absolute -top-2 -right-2 transform" style={{ animation: 'pawOrbit 8s linear infinite', transformOrigin: '60px 60px' }}>
        <div className="w-6 h-6 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center shadow-lg">
          <PawPrint className="h-3 w-3 text-primary-foreground" />
        </div>
      </div>
    )}
  </div>
);

const PhaseSection = ({ info, message, phase }: { info: LoadingPhase, message?: string | undefined, phase?: string | undefined }) => (
  <div className="flex flex-col items-center mb-6">
    <div className={`h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse ${phase === 'world' ? 'animate-bounce' : ''}`}>{info.icon}</div>
    <h1 className="text-2xl font-bold mt-4 mb-2 font-headline text-primary">{info.name}</h1>
    <p className="text-sm text-muted-foreground">{message || info.description}</p>
  </div>
);

const ErrorSection = ({ message }: { message?: string | undefined }) => (
  <div className="flex flex-col items-center mb-6">
    <AlertTriangle className="h-16 w-16 text-destructive animate-pulse" />
    <h1 className="text-2xl font-bold mt-4 mb-2 font-headline text-destructive">Loading Error</h1>
    <p className="text-sm text-destructive/80">{message || 'An error occurred.'}</p>
    <Card className="bg-destructive/10 border-destructive/20 mt-6 p-4">
      <button onClick={() => window.location.reload()} className="text-xs bg-destructive text-primary-foreground px-3 py-1 rounded shadow-sm hover:bg-destructive/90 transition-colors">Refresh Page</button>
    </Card>
  </div>
);

interface ContentProps {
  variant: 'default' | 'indeterminate';
  phaseInfo: LoadingPhase;
  message?: string | undefined;
  phase?: string | undefined;
  progress: number;
  estimatedTime: number | null;
  currentAsset?: string | undefined;
  loadedAssets?: number | undefined;
  totalAssets?: number | undefined;
  showTips: boolean;
  currentTip: LoadingTip | null;
}

const MainContent: React.FC<ContentProps> = ({
  variant, phaseInfo, message, phase, progress, estimatedTime, currentAsset, loadedAssets, totalAssets, showTips, currentTip
}) => (
  <>
    {variant !== 'indeterminate' && <PhaseSection info={phaseInfo} message={message} phase={phase} />}
    {variant === 'default' && (
      <Card className="mb-6 bg-card/50 backdrop-blur-sm border-primary/20">
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground"><span>Progress</span><span>{Math.round(progress)}%</span></div>
          <Progress value={progress} className="h-2" />
          {estimatedTime !== null && estimatedTime > 0 && <div className="text-xs text-primary/80 mt-1">⏱️ {estimatedTime} seconds left</div>}
        </CardContent>
      </Card>
    )}
    {currentAsset && loadedAssets !== undefined && totalAssets !== undefined && (
      <Card className="mb-4 bg-card/40 border-primary/10 p-3"><div className="flex justify-between text-xs text-muted-foreground"><span>{currentAsset}</span><span>{loadedAssets}/{totalAssets}</span></div></Card>
    )}
    {showTips && currentTip && variant !== 'indeterminate' && (
      <Card className="bg-card/30 border-primary/10 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="text-lg">
            {(
              { gameplay: '🎮', world: '🌍', performance: '⚡', fun: '🎯' } as Record<string, string>
            )[currentTip.category] || '💡'}
          </div>
          <div className="text-left"><h3 className="text-sm font-semibold text-primary">{currentTip.title}</h3><p className="text-xs text-muted-foreground leading-relaxed">{currentTip.content}</p></div>
        </div>
      </Card>
    )}
  </>
);

// --- Main Component ---

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message, showLogo = true, isError = false, progress = 0, phase = 'graphics', showTips = true,
  currentAsset, loadedAssets, totalAssets, variant = 'default'
}) => {
  const displayProgress = useProgressAnimation(progress);
  const estimatedTime = useTimeEstimation(progress, isError);
  const currentTip = useLoadingTips(showTips);
  const phaseInfo = useMemo(() => loadingPhases.find(p => p.id === phase) || loadingPhases[1]!, [phase]);

  // Simplified Indeterminate State (Pulsing Logo)
  if (variant === 'indeterminate') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-6">
        <div className="relative z-10 animate-pulse">
           <Image src="/Boby-logo.png" alt="Logo" width={120} height={120} priority className="rounded-lg shadow-2xl shadow-primary/20" />
        </div>
        {message && <p className="mt-6 text-muted-foreground text-sm font-medium tracking-wide animate-pulse">{message}</p>}
      </div>
    );
  }

  return (
    <>
      <LoadingStyles />
      <div className={`flex flex-col items-center justify-center min-h-screen p-6 text-center relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5`}>
        <LoadingParticles />
        {showLogo && <LogoSection isError={isError} />}
        
        <div className="max-w-md w-full z-10">
          {isError ? <ErrorSection message={message} /> : (
            <MainContent variant={variant} phaseInfo={phaseInfo} message={message} phase={phase} progress={displayProgress} estimatedTime={estimatedTime}
              currentAsset={currentAsset} loadedAssets={loadedAssets} totalAssets={totalAssets} showTips={showTips} currentTip={currentTip} />
          )}
        </div>
      </div>
    </>
  );
};

export default LoadingScreen;

'use client';

import React, { useState, useEffect } from 'react';
import { PawPrint, AlertTriangle, Sparkles, Mountain, Volume2, Zap } from 'lucide-react';
import Image from 'next/image';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';

interface LoadingPhase {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  weight: number; // Weight in overall progress (0-100)
}

interface LoadingTip {
  title: string;
  content: string;
  category: 'gameplay' | 'world' | 'performance' | 'fun';
}

interface LoadingScreenProps {
  message?: string;
  showLogo?: boolean;
  isError?: boolean;
  progress?: number;
  phase?: string;
  showTips?: boolean;
  currentAsset?: string;
  loadedAssets?: number;
  totalAssets?: number;
}

export type { LoadingScreenProps };

const loadingPhases: LoadingPhase[] = [
  {
    id: 'system',
    name: 'Initializing System',
    description: 'Preparing game engine components',
    icon: <Zap className="h-5 w-5" />,
    weight: 10
  },
  {
    id: 'graphics',
    name: 'Loading Graphics',
    description: 'Loading 3D models and textures',
    icon: <Mountain className="h-5 w-5" />,
    weight: 30
  },
  {
    id: 'audio',
    name: 'Loading Audio',
    description: 'Preparing sound effects and music',
    icon: <Volume2 className="h-5 w-5" />,
    weight: 15
  },
  {
    id: 'world',
    name: 'Building World',
    description: 'Generating the game environment',
    icon: <Sparkles className="h-5 w-5" />,
    weight: 35
  },
  {
    id: 'optimization',
    name: 'Optimizing',
    description: 'Final performance optimizations',
    icon: <PawPrint className="h-5 w-5" />,
    weight: 10
  }
];

const loadingTips: LoadingTip[] = [
  {
    title: '🐕 Dog Behavior',
    content: 'Boby loves chasing coins! Use your magnetic treat to collect them from afar.',
    category: 'gameplay'
  },
  {
    title: '🌍 Open World',
    content: 'Explore a vast procedurally generated world with unique environments and adventures.',
    category: 'world'
  },
  {
    title: '⚡ Speed Boost',
    content: 'Speedy Paws treats give temporary boosts - perfect for escaping enemies or collecting coins quickly!',
    category: 'gameplay'
  },
  {
    title: '🛡️ Guardian Shield',
    content: 'Guardian Shields protect you from enemy attacks for a short time. Collect them wisely!',
    category: 'gameplay'
  },
  {
    title: '🎯 Performance Tips',
    content: 'For best performance, close other browser tabs and ensure you have at least 4GB RAM available.',
    category: 'performance'
  },
  {
    title: '🎮 Animal Friends',
    content: 'Some animals are friendly collectors, others are sneaky thieves! Learn their behaviors.',
    category: 'gameplay'
  },
  {
    title: '🏃‍♂️ Running Game',
    content: 'Switch between walk mode and run mode - running costs more but lets you escape predators faster.',
    category: 'gameplay'
  },
  {
    title: '💰 Cryptocurrency',
    content: 'All transactions use Solana blockchain for fast, secure, and low-fee payments.',
    category: 'fun'
  },
  {
    title: '🗺️ World Exploration',
    content: 'The world is infinite! Each area has unique coin spawns and animal populations.',
    category: 'world'
  },
  {
    title: '🎵 Audio Experience',
    content: 'Enjoy immersive 3D audio! Use headphones for the best gaming experience.',
    category: 'performance'
  }
];

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message,
  showLogo = true,
  isError = false,
  progress = 0,
  phase = 'graphics',
  showTips = true,
  currentAsset,
  loadedAssets,
  totalAssets
}) => {
  const [currentTip, setCurrentTip] = useState<LoadingTip | null>(null);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState<number | null>(null);
  const [startTime] = useState<number>(Date.now());

  // Smooth progress animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayProgress(progress);
    }, 300);
    return () => clearTimeout(timer);
  }, [progress]);

  // Loading time estimation
  useEffect(() => {
    if (isError) return;

    const elapsed = (Date.now() - startTime) / 1000; // elapsed time in seconds
    const progressFraction = progress / 100;

    if (progressFraction > 0 && progressFraction < 1) {
      // Estimate remaining time based on current progress
      const estimatedTotalTime = elapsed / progressFraction;
      const timeLeft = Math.max(0, estimatedTotalTime - elapsed);

      // Smooth the estimation to avoid jerky updates
      setEstimatedTimeLeft(prev => {
        if (prev === null) return Math.round(timeLeft);
        // Gradually adjust the estimate
        return Math.round(prev * 0.7 + timeLeft * 0.3);
      });
    }
  }, [progress, isError, startTime]);

  // Rotate tips every 4 seconds
  useEffect(() => {
    if (!showTips) return;

    const updateTip = () => {
      const randomTip = loadingTips[Math.floor(Math.random() * loadingTips.length)];
      setCurrentTip(randomTip);
    };

    updateTip();
    const interval = setInterval(updateTip, 4000);

    return () => clearInterval(interval);
  }, [showTips]);

  const getPhaseInfo = () => {
    return loadingPhases.find(p => p.id === phase) || loadingPhases[1];
  };

  const phaseInfo = getPhaseInfo();

  const getCategoryEmoji = (category: LoadingTip['category']) => {
    switch (category) {
      case 'gameplay': return '🎮';
      case 'world': return '🌍';
      case 'performance': return '⚡';
      case 'fun': return '🎯';
      default: return '💡';
    }
  };

  return (
    <>
      {/* Custom CSS Keyframes */}
      <style jsx global>{`
        @keyframes logoFloat {
          0%, 100% {
            transform: translateY(0px) translateZ(0);
          }
          50% {
            transform: translateY(-8px) translateZ(0);
          }
        }

        @keyframes pawOrbit {
          0% {
            transform: rotate(0deg) translateX(60px) rotate(0deg) translateZ(0);
          }
          100% {
            transform: rotate(360deg) translateX(60px) rotate(-360deg) translateZ(0);
          }
        }

        @keyframes progressFlow {
          0% {
            background-position: -100% 0;
          }
          100% {
            background-position: 100% 0;
          }
        }

        @keyframes floatParticle1 {
          0%, 100% {
            transform: translateY(0px) translateX(0px) scale(1);
          }
          25% {
            transform: translateY(-20px) translateX(10px) scale(1.1);
          }
          50% {
            transform: translateY(-10px) translateX(-10px) scale(0.9);
          }
          75% {
            transform: translateY(-30px) translateX(5px) scale(1.05);
          }
        }

        @keyframes floatParticle2 {
          0%, 100% {
            transform: translateY(0px) translateX(0px) rotate(0deg);
          }
          33% {
            transform: translateY(-15px) translateX(-8px) rotate(120deg);
          }
          66% {
            transform: translateY(-25px) translateX(12px) rotate(240deg);
          }
        }

        @keyframes floatParticle3 {
          0%, 100% {
            transform: translateY(0px) translateX(0px) rotate(0deg) scale(1);
          }
          50% {
            transform: translateY(-10px) translateX(-5px) rotate(180deg) scale(0.8);
          }
        }
      `}</style>

      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5 text-foreground p-6 text-center relative overflow-hidden">
        {/* Enhanced Background decorative elements with animations */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-32 h-32 border border-primary/20 rounded-full animate-pulse"
            style={{ animationDelay: '0s', animationDuration: '3s' }}></div>
          <div className="absolute bottom-20 right-10 w-24 h-24 border border-primary/20 rounded-full animate-pulse"
            style={{ animationDelay: '1s', animationDuration: '4s' }}></div>
          <div className="absolute top-1/2 left-1/4 w-16 h-16 border border-primary/20 rounded-full animate-pulse"
            style={{ animationDelay: '2s', animationDuration: '5s' }}></div>
          <div className="absolute top-1/3 right-1/4 w-20 h-20 border border-primary/20 rounded-full animate-pulse"
            style={{ animationDelay: '0.5s', animationDuration: '3.5s' }}></div>
          <div className="absolute bottom-1/3 left-1/3 w-12 h-12 border border-primary/20 rounded-full animate-pulse"
            style={{ animationDelay: '1.5s', animationDuration: '4.5s' }}></div>
        </div>

        {/* Enhanced Floating particles effect */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Large floating particles */}
          {[...Array(5)].map((_, i) => (
            <div
              key={`large-${i}`}
              className="absolute w-2 h-2 bg-gradient-to-r from-primary/30 to-primary/10 rounded-full blur-sm"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 8}s`,
                animationDuration: `${8 + Math.random() * 6}s`,
                animation: `floatParticle${i % 2 + 1} ${8 + Math.random() * 6}s ease-in-out infinite`
              }}
            />
          ))}

          {/* Medium particles */}
          {[...Array(12)].map((_, i) => (
            <div
              key={`medium-${i}`}
              className="absolute w-1 h-1 bg-primary/40 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 6}s`,
                animationDuration: `${4 + Math.random() * 4}s`,
                animation: `floatParticle${(i % 3) + 1} ${4 + Math.random() * 4}s ease-in-out infinite`
              }}
            />
          ))}

          {/* Small twinkling particles */}
          {[...Array(20)].map((_, i) => (
            <div
              key={`small-${i}`}
              className="absolute w-0.5 h-0.5 bg-primary rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 10}s`,
                animationDuration: `${2 + Math.random() * 3}s`
              }}
            />
          ))}
        </div>

        {showLogo && (
          <div className="relative mb-8 z-10 group">
            <div
              className="rounded-lg shadow-xl transform transition-all duration-700 ease-out hover:scale-105"
              style={{
                animation: !isError ? 'logoFloat 6s ease-in-out infinite' : undefined,
                transform: 'translateZ(0)', // Force hardware acceleration
                willChange: 'transform'
              }}
            >
              <Image
                src="/Boby-logo.png"
                alt="Boby World Logo"
                width={120}
                height={120}
                className="rounded-lg"
                data-ai-hint="dog logo"
                priority
                style={{ transform: 'translateZ(0)' }} // Hardware acceleration
              />
            </div>

            {!isError && (
              <div
                className="absolute -top-2 -right-2 transform transition-all duration-500"
                style={{
                  animation: 'pawOrbit 8s linear infinite',
                  transform: 'translateZ(0)',
                  transformOrigin: '60px 60px' // Orbit around logo center
                }}
              >
                <div className="w-6 h-6 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center shadow-lg">
                  <PawPrint className="h-3 w-3 text-primary-foreground" />
                </div>
              </div>
            )}

            {/* Subtle glow effect during loading */}
            {!isError && (
              <div
                className="absolute inset-0 rounded-lg bg-primary/10 blur-lg opacity-0 animate-pulse"
                style={{
                  animationDelay: '2s',
                  animationDuration: '4s'
                }}
              />
            )}
          </div>
        )}

        {!isError ? (
          <div className="relative z-10 mb-6">
            <div className={`h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse ${phase === 'world' ? 'animate-bounce' : ''}`}>
              {phaseInfo.icon}
            </div>
          </div>
        ) : (
          <AlertTriangle className="h-16 w-16 text-destructive mb-6 animate-pulse z-10 relative" />
        )}

        <div className="max-w-md w-full z-10">
          <h1 className={`text-2xl font-bold mb-2 font-headline ${isError ? 'text-destructive' : 'text-primary'}`}>
            {isError ? 'Loading Error' : phaseInfo.name}
          </h1>

          <p className={`text-sm mb-4 ${isError ? 'text-destructive/80' : 'text-muted-foreground'}`}>
            {message || phaseInfo.description}
          </p>

          {!isError && (
            <Card className="mb-6 bg-card/50 backdrop-blur-sm border-primary/20">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Overall Progress</span>
                    <span>{Math.round(displayProgress)}%</span>
                  </div>
                  <Progress
                    value={displayProgress}
                    className="w-full h-2"
                  />
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <div className={`w-2 h-2 rounded-full ${displayProgress < 25 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                    <span>
                      {displayProgress < 25 ? 'Initializing...' :
                        displayProgress < 50 ? 'Loading assets...' :
                          displayProgress < 75 ? 'Preparing world...' :
                            'Almost ready!'}
                    </span>
                  </div>

                  {/* Time estimation */}
                  {estimatedTimeLeft !== null && estimatedTimeLeft > 0 && !isError && (
                    <div className="flex items-center justify-center gap-2 text-xs text-primary/80 mt-1">
                      <span>⏱️</span>
                      <span>
                        {estimatedTimeLeft < 1
                          ? 'Less than a second'
                          : estimatedTimeLeft === 1
                            ? '1 second left'
                            : `${estimatedTimeLeft} seconds left`
                        }
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {currentAsset && loadedAssets !== undefined && totalAssets !== undefined && !isError && (
            <Card className="mb-4 bg-card/40 backdrop-blur-sm border-primary/10">
              <CardContent className="p-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                    <span className="font-medium text-primary">Loading:</span>
                    <span className="text-muted-foreground">{currentAsset}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {loadedAssets}/{totalAssets}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {showTips && currentTip && !isError && (
            <Card className="bg-card/30 backdrop-blur-sm border-primary/10">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="text-lg">{getCategoryEmoji(currentTip.category)}</div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-primary mb-1">{currentTip.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{currentTip.content}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {isError && (
            <Card className="bg-destructive/10 border-destructive/20 mt-6">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-destructive/80 mb-2">
                  If this persists, try refreshing the page or checking your internet connection.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="text-xs bg-destructive text-destructive-foreground px-3 py-1 rounded hover:bg-destructive/80 transition-colors"
                >
                  Refresh Page
                </button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
};

export default LoadingScreen;

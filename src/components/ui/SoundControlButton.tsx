"use client";

import { Button } from "@/components/ui/button";
import { Volume2, VolumeX } from "lucide-react";
import React from "react";

interface SoundControlButtonProps {
  areSheetsOpen: boolean;
  isSoundPlaying: boolean;
  onToggle: () => void;
}

export const SoundControlButton: React.FC<SoundControlButtonProps> = ({
  areSheetsOpen,
  isSoundPlaying,
  onToggle,
}) => {
  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        zIndex: areSheetsOpen ? 1 : 9999
      }}
      className="sm:top-6 sm:right-6 md:top-8 md:right-8"
    >
      <Button
        variant="outline"
        size="icon"
        onClick={onToggle}
        aria-label={isSoundPlaying ? "Pause Sound" : "Play Sound"}
        className={`
          relative overflow-hidden
          transition-all duration-300 ease-in-out
          hover:scale-110 active:scale-95
          ${isSoundPlaying 
            ? "bg-gradient-to-br from-purple-500 to-pink-500 border-purple-300 shadow-lg shadow-purple-500/50" 
            : "bg-gradient-to-br from-gray-700 to-gray-900 border-gray-600 shadow-lg"
          }
        `}
      >
        {/* Animated background effect */}
        <div className={`
          absolute inset-0 opacity-20
          ${isSoundPlaying ? "animate-pulse" : ""}
        `}>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent translate-x-[-100%]" />
        </div>

        {/* Sound waves animation when playing */}
        {isSoundPlaying && (
          <div className="absolute inset-0 flex items-center justify-center gap-0.5">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-0.5 bg-white/50 rounded-full animate-pulse"
                style={{
                  height: "40%",
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: "0.6s"
                }}
              />
            ))}
          </div>
        )}

        {/* Main icon */}
        <span className={`relative z-10 ${isSoundPlaying ? "text-white" : "text-gray-400"}`}>
          {isSoundPlaying ? (
            <VolumeX className="h-5 w-5" />
          ) : (
            <Volume2 className="h-5 w-5" />
          )}
        </span>

        {/* Glow effect */}
        {isSoundPlaying && (
          <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 opacity-0 hover:opacity-20 transition-opacity duration-300" />
        )}
      </Button>
    </div>
  );
};

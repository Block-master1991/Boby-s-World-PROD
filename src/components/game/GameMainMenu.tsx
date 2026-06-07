"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Image from "next/image";
import React, { useState } from "react";

interface GameMainMenuProps {
  onGameModeSelected: (mode: "boby-world" | "running-game") => void;
}

/**
 * GameModeOption - Sub-component for individual game mode selection cards
 */
interface GameModeOptionProps {
  id: "boby-world" | "running-game";
  title: string;
  description: string;
  imageSrc: string;
  selected: boolean;
  onSelect: (id: "boby-world" | "running-game") => void;
}

const GameModeOption: React.FC<GameModeOptionProps> = ({
  id,
  title,
  description,
  imageSrc,
  selected,
  onSelect,
}) => (
  <Label
    htmlFor={id}
    className={`flex flex-col items-center justify-between rounded-md border p-4 md:p-8 cursor-pointer transition-all duration-200 glass-card hover:bg-primary/10
        ${selected ? "border-primary" : "border-border hover:border-primary/50"}`}
    onClick={() => onSelect(id)}
  >
    <RadioGroupItem value={id} id={id} className="sr-only" />
    <Image
      src={imageSrc}
      alt={title}
      width={100}
      height={100}
      className="mb-4 rounded-md w-24 h-24 md:w-32 md:h-32"
    />
    <span className="text-lg md:text-2xl font-semibold text-foreground text-center">{title}</span>
    <span className="text-sm md:text-base text-muted-foreground text-center">{description}</span>
  </Label>
);

const GameMainMenu: React.FC<GameMainMenuProps> = ({ onGameModeSelected }) => {
  const [selectedMode, setSelectedMode] = useState<"boby-world" | "running-game">("boby-world");

  return (
    <div className="min-h-screen bg-background text-foreground px-4 sm:px-6 relative">
      

      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md md:max-w-2xl glass-card overflow-y-auto">
          <CardHeader>
            <CardTitle className="text-center text-2xl md:text-4xl text-foreground">
              Select Game Mode
            </CardTitle>
            <CardDescription className="text-center text-base md:text-lg text-muted-foreground">
              Choose your adventure!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={selectedMode}
              onValueChange={(value: "boby-world" | "running-game") => setSelectedMode(value)}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <GameModeOption
                id="boby-world"
                title="Boby World"
                description="Explore an open 3D world."
                imageSrc="/Boby-logo.png"
                selected={selectedMode === "boby-world"}
                onSelect={onGameModeSelected}
              />
              <GameModeOption
                id="running-game"
                title="Running Game"
                description="Run, jump, and collect coins!"
                imageSrc="/Boby-logo.png"
                selected={selectedMode === "running-game"}
                onSelect={onGameModeSelected}
              />
            </RadioGroup>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GameMainMenu;

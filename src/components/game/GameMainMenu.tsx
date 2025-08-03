'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import Image from 'next/image'; // New import

interface GameMainMenuProps {
    onGameModeSelected: (mode: 'boby-world' | 'running-game') => void;
}

const GameMainMenu: React.FC<GameMainMenuProps> = ({ onGameModeSelected }) => {
    const [selectedMode, setSelectedMode] = useState<'boby-world' | 'running-game'>('boby-world');

    const handlePlayClick = () => {
        onGameModeSelected(selectedMode);
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
            <Card className="w-[350px] glass-card"> {/* Apply glass-card here */}
                <CardHeader>
                    <CardTitle className="text-center text-2xl text-foreground">Select Game Mode</CardTitle>
                    <CardDescription className="text-center text-muted-foreground">Choose your adventure!</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <RadioGroup
                        value={selectedMode}
                        onValueChange={(value: 'boby-world' | 'running-game') => setSelectedMode(value)}
                        className="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                        <Label
                            htmlFor="boby-world"
                            className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer transition-all duration-200 glass-card
                                ${selectedMode === 'boby-world' ? 'border-primary' : 'border-border hover:border-primary/50'}`}
                            onClick={() => onGameModeSelected('boby-world')} // Direct click to start
                        >
                            <RadioGroupItem value="boby-world" id="boby-world" className="sr-only" />
                            <Image
                                src="/Boby-logo.png"
                                alt="Boby's World"
                                width={100}
                                height={100}
                                className="mb-4 rounded-md"
                            />
                            <span className="text-xl font-semibold text-foreground text-center">Boby's World</span>
                            <span className="text-sm text-muted-foreground text-center">Explore an open 3D world.</span>
                        </Label>

                        <Label
                            htmlFor="running-game"
                            className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer transition-all duration-200 glass-card
                                ${selectedMode === 'running-game' ? 'border-primary' : 'border-border hover:border-primary/50'}`}
                            onClick={() => onGameModeSelected('running-game')} // Direct click to start
                        >
                            <RadioGroupItem value="running-game" id="running-game" className="sr-only" />
                            <Image
                                src="/Boby-logo.png"
                                alt="Running Game"
                                width={100}
                                height={100}
                                className="mb-4 rounded-md"
                            />
                            <span className="text-xl font-semibold text-foreground text-center">Running Game</span>
                            <span className="text-sm text-muted-foreground text-center">Run, jump, and collect coins!</span>
                        </Label>
                    </RadioGroup>
                    {/* Removed the Play button */}
                </CardContent>
            </Card>
        </div>
    );
};

export default GameMainMenu;

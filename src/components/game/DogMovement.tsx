
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PawPrint } from 'lucide-react';

const DogMovement: React.FC = () => {
    return (
        <Card className="w-full shadow-md bg-opacity-80 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="text-md font-headline flex items-center gap-2">
                    <PawPrint className="h-5 w-5 text-primary" /> Dog Controls
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">
                    Use <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">W</kbd>, <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">A</kbd>, <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">S</kbd>, <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">D</kbd> or <span className="font-semibold">Arrow Keys</span> to move on desktop.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                    Hold <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">Shift</kbd> while moving to sprint.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                    On mobile, use the on-screen joystick.
                </p>
                <div className="mt-3 p-3 bg-secondary/30 rounded-md">
                    <p className="text-xs italic">3D dog movement and animations would be rendered here via Three.js.</p>
                </div>
            </CardContent>
        </Card>
    );
};

export default DogMovement;


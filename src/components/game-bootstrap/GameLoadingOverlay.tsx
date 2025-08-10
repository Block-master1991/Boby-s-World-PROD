import React from 'react';
import LoadingScreen from '@/components/game-bootstrap/LoadingScreen';

interface GameLoadingOverlayProps {
    isLoading: boolean;
    progress: number;
    error: string | null;
}

const GameLoadingOverlay: React.FC<GameLoadingOverlayProps> = ({ isLoading, progress, error }) => {
    if (!isLoading && !error) {
        return null;
    }

    return (
        <div className="absolute inset-0 z-50">
            {error ? (
                <LoadingScreen message={`Error loading assets: ${error}. Please refresh.`} showLogo isError />
            ) : (
                <LoadingScreen message="Loading game assets..." showLogo progress={progress} />
            )}
        </div>
    );
};

export default GameLoadingOverlay;

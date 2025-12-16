import React from 'react';
import LoadingScreen from '@/components/game-bootstrap/LoadingScreen';

interface GameLoadingOverlayProps {
    isLoading: boolean;
    progress: number;
    error: string | null;
    phase?: string;
    showTips?: boolean;
    currentAsset?: string;
    loadedAssets?: number;
    totalAssets?: number;
}

const GameLoadingOverlay: React.FC<GameLoadingOverlayProps> = ({
    isLoading,
    progress,
    error,
    phase = 'graphics',
    showTips = true,
    currentAsset,
    loadedAssets,
    totalAssets
}) => {
    if (!isLoading && !error) {
        return null;
    }

    return (
        <div className="absolute inset-0 z-50 transition-opacity duration-500 ease-in-out">
            {error ? (
                <LoadingScreen
                    message={`Error loading assets: ${error}. Please refresh.`}
                    showLogo
                    isError
                    showTips={false}
                />
            ) : (
                <LoadingScreen
                    showLogo
                    progress={progress}
                    phase={phase}
                    showTips={showTips}
                    currentAsset={currentAsset}
                    loadedAssets={loadedAssets}
                    totalAssets={totalAssets}
                />
            )}
        </div>
    );
};

export default GameLoadingOverlay;

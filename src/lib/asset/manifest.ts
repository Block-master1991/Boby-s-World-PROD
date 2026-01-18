import type { AssetMetadata } from './types';

export const INITIAL_ASSETS: Omit<AssetMetadata, 'lastAccessed'>[] = [
    {
        id: 'dog-model',
        url: '/models/dog.glb',
        type: 'model',
        priority: 10,
        estimatedSize: 500,
        preloadDistance: 0,
    },
    {
        id: 'coin-model',
        url: '/models/coin.glb',
        type: 'model',
        priority: 8,
        estimatedSize: 200,
        preloadDistance: 30,
    },
    {
        id: 'rock1-model',
        url: '/models/rock1.glb',
        type: 'model',
        priority: 7,
        estimatedSize: 300,
        preloadDistance: 0,
    },
    {
        id: 'rock2-model',
        url: '/models/rock2.glb',
        type: 'model',
        priority: 7,
        estimatedSize: 300,
        preloadDistance: 0,
    },
    {
        id: 'rock3-model',
        url: '/models/rock3.glb',
        type: 'model',
        priority: 7,
        estimatedSize: 300,
        preloadDistance: 0,
    },
];

export function generateEnvironmentAssets(): Omit<AssetMetadata, 'lastAccessed'>[] {
    const assets: Omit<AssetMetadata, 'lastAccessed'>[] = [];
    for (let x = -10; x <= 10; x++) {
        for (let z = -10; z <= 10; z++) {
            assets.push({
                id: `grass_${x}_${z}`,
                url: `/models/grass.glb?chunk=chunk_${x}_${z}`,
                type: 'model',
                priority: 3,
                estimatedSize: 150,
                chunkCoords: { x, z },
                preloadDistance: 40,
            });
        }
    }
    return assets;
}

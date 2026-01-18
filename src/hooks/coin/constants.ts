
import type { BaseGameObject } from '@/types/game';
import type * as THREE from 'three';
import { ENEMY_COLLISION_PENALTY_USDT } from '../../lib/constants';

export const COIN_RADIUS = 0.4;
export const COIN_EMISSIVE_INTENSITY = 0.8;
export const COIN_ROTATION_SPEED = 0.03;
export const COIN_VALUE = ENEMY_COLLISION_PENALTY_USDT;
export const COLLECTION_THRESHOLD_BASE = 0.5;
export const COLLECTION_THRESHOLD = COLLECTION_THRESHOLD_BASE + COIN_RADIUS;
export const VISIBLE_COIN_DISTANCE = 220;
export const COIN_MAGNET_RADIUS = 15; // Added default magnet radius
export const COIN_MODEL_PATH = '/models/coin.glb';

export interface CoinData extends THREE.Group, BaseGameObject {
  collected: boolean;
  value?: number;
  rotationSpeed?: number;
  type: 'item';
  chunkKey?: string; // Chunk key for spatial management
  userData: {
    isAttracted?: boolean;
    originalRotationSpeed?: number;
    isAnimatingCollection?: boolean;
    collectionStartTime?: number;
    isCredited?: boolean;
    [key: string]: unknown;
  };
}

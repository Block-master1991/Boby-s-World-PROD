import type { CoinData } from "@/hooks/coin/useCoinLogic";
import { ENEMY_PROTECTION_RADIUS_VAL, WORLD_MAX_BOUND, WORLD_MIN_BOUND } from "@/lib/constants";
import type { Octree } from "@/lib/Octree";
import type { GameObject } from "@/types/game";
import * as THREE from "three";

interface ChunkManager {
  getGameplaySpawns: (key: string) =>
    | {
        coinSpawns: Array<{ position: number[] }>;
        enemySpawns: Array<{ coinIndex: number; position: number[] }>;
      }
    | undefined;
}

// دالة مساعدة للبحث عن فهرس العملة
const findCoinIndex = (
  coinSpawns: Array<{ position: number[] }>,
  coinPosition: THREE.Vector3
): number => {
  for (let i = 0; i < coinSpawns.length; i++) {
    const spawn = coinSpawns[i];
    const sp = spawn?.position;
    if (!sp || sp.length < 3) continue;
    const [posX, , posZ] = sp;
    if (posX === undefined || posZ === undefined) continue;
    const dx = Math.abs(posX - coinPosition.x);
    const dz = Math.abs(posZ - coinPosition.z);
    if (dx < 0.1 && dz < 0.1) {
      return i;
    }
  }
  return -1;
};

// دالة مساعدة للحصول على موقع العدو من بيانات اللعبة
const getSpawnPositionFromGameplayData = (
  gameplayData: {
    coinSpawns: Array<{ position: number[] }>;
    enemySpawns: Array<{ coinIndex: number; position: number[] }>;
  },
  coinIndex: number,
  coinY: number
): THREE.Vector3 | null => {
  if (coinIndex === -1) return null;
  const enemySpawn = gameplayData.enemySpawns.find(e => e.coinIndex === coinIndex);
  if (!enemySpawn?.position) return null;
  return new THREE.Vector3(enemySpawn.position[0], coinY, enemySpawn.position[2]);
};

// دالة مساعدة لتوليد موقع عشوائي للعدو
const generateRandomPosition = (
  coinPosition: THREE.Vector3,
  minRadius: number,
  maxRadius: number
): THREE.Vector3 => {
  const angle = Math.random() * Math.PI * 2;
  const radius = minRadius + Math.random() * (maxRadius - minRadius);
  return new THREE.Vector3(
    coinPosition.x + Math.cos(angle) * radius,
    coinPosition.y,
    coinPosition.z + Math.sin(angle) * radius
  );
};

// واجهة لمعلمات البحث عن موقع آمن من الكلب
interface SafePositionParams {
  position: THREE.Vector3;
  dogPosition: THREE.Vector3;
  coinPosition: THREE.Vector3;
  minDistanceFromDog: number;
  minRadius: number;
  maxRadius: number;
  maxAttempts: number;
}

// دالة مساعدة للتحقق من أن الموقع ليس قريباً من الكلب
const findSafePositionFromDog = (params: SafePositionParams): THREE.Vector3 => {
  const {
    position,
    dogPosition,
    coinPosition,
    minDistanceFromDog,
    minRadius,
    maxRadius,
    maxAttempts,
  } = params;
  let newPosition = position.clone();
  let attempts = 0;

  while (newPosition.distanceTo(dogPosition) < minDistanceFromDog && attempts < maxAttempts) {
    newPosition = generateRandomPosition(coinPosition, minRadius, maxRadius);
    attempts++;
  }

  return newPosition;
};

export const getEnemySpawnPosition = (
  c: CoinData,
  chunkKey: string,
  scene: THREE.Scene | null
): THREE.Vector3 => {
  const chunkManager = scene?.getObjectByName("ChunkManager") as unknown as ChunkManager;
  if (chunkManager) {
    const gameplayData = chunkManager.getGameplaySpawns(chunkKey);
    if (gameplayData) {
      const coinIndex = findCoinIndex(gameplayData.coinSpawns, c.position);
      const spawnPosition = getSpawnPositionFromGameplayData(gameplayData, coinIndex, c.position.y);
      if (spawnPosition) {
        return spawnPosition;
      }
      // Silenced verbose log: Enemy spawn for coin index not found, falling back to random.
    } else {
      // Silenced verbose log: Gameplay data for chunk not found, falling back to random.
    }
  }

  // تحسين منطق تحديد الموقع العشوائي لضمان ظهور العدو بالقرب من العملة
  const minRadius = 5; // الحد الأدنى للمسافة بين العدو والعملة
  const maxRadius = 10; // الحد الأقصى للمسافة بين العدو والعملة
  const newPosition = generateRandomPosition(c.position, minRadius, maxRadius);

  // التحقق من أن الموقع الجديد ليس قريباً جداً من موقع الكلب (إذا كان متوفراً)
  const dogPosition = scene?.getObjectByName("Dog")?.position;
  if (dogPosition) {
    const minDistanceFromDog = 15; // مسافة آمنة من موقع الكلب
    const maxAttempts = 10;
    return findSafePositionFromDog({
      position: newPosition,
      dogPosition,
      coinPosition: c.position,
      minDistanceFromDog,
      minRadius,
      maxRadius,
      maxAttempts,
    });
  }

  return newPosition;
};

export const clampSpawnPosition = (pos: THREE.Vector3): THREE.Vector3 => {
  const minSpawnX = WORLD_MIN_BOUND + ENEMY_PROTECTION_RADIUS_VAL;
  const maxSpawnX = WORLD_MAX_BOUND - ENEMY_PROTECTION_RADIUS_VAL;
  const minSpawnZ = WORLD_MIN_BOUND + ENEMY_PROTECTION_RADIUS_VAL;
  const maxSpawnZ = WORLD_MAX_BOUND - ENEMY_PROTECTION_RADIUS_VAL;

  return new THREE.Vector3(
    Math.max(minSpawnX, Math.min(maxSpawnX, pos.x)),
    pos.y,
    Math.max(minSpawnZ, Math.min(maxSpawnZ, pos.z))
  );
};

interface PositionModelParams {
  model: THREE.Group;
  coin: CoinData;
  chunkKey: string;
  scene: THREE.Scene | null;
  octree: Octree<GameObject> | null;
}

export const positionModel = (params: PositionModelParams): THREE.Vector3 => {
  const { model: m, coin: c, chunkKey, scene, octree } = params;
  let pos = getEnemySpawnPosition(c, chunkKey, scene);
  pos = clampSpawnPosition(pos);

  let posY = c.position.y;
  if (octree) {
    posY = octree.getGroundHeightAt(pos.x, pos.z);
  }

  m.position.set(pos.x, posY, pos.z);
  return m.position;
};

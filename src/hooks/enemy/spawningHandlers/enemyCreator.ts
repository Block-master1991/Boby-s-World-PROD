import type { CoinData } from "@/hooks/useCoinLogic";
import * as THREE from "three";
import { ENEMY_ANIMATION_NAMES } from "../constants";
import type { EnemyData } from "../types";

interface EnemyParams {
  coin: CoinData;
  model: THREE.Group;
  lod: THREE.LOD;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  action: THREE.AnimationAction | null;
  type: "carnivore" | "herbivore";
  chunk: string;
}

export const createMixer = (m: THREE.Group, a: THREE.AnimationClip[]) => {
  // التحقق من أن النموذج جاهز قبل إنشاء mixer
  if (!m || !m.children || m.children.length === 0) {
    return { mixer: new THREE.AnimationMixer(m), actions: {} };
  }

  const mx = new THREE.AnimationMixer(m);
  const ac: Record<string, THREE.AnimationAction> = {};

  a.forEach(c => {
    const action = mx.clipAction(c);
    ac[c.name] = action;
    const isIdleAnimation =
      ENEMY_ANIMATION_NAMES.CARNIVORE.IDLE.includes(c.name) ||
      ENEMY_ANIMATION_NAMES.HERBIVORE.IDLE.includes(c.name);

    if (
      c.name === ENEMY_ANIMATION_NAMES.CARNIVORE.WALK ||
      c.name === ENEMY_ANIMATION_NAMES.CARNIVORE.GALLOP ||
      c.name === ENEMY_ANIMATION_NAMES.HERBIVORE.WALK ||
      c.name === ENEMY_ANIMATION_NAMES.HERBIVORE.GALLOP ||
      isIdleAnimation
    ) {
      action.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.stop();
  });

  return { mixer: mx, actions: ac };
};

export const createEnemy = (p: EnemyParams): EnemyData => ({
  uuid: `${p.coin.uuid}_enemy`,
  // استخدام موقع LOD لأن موقع النموذج تم تصفيره ليكون نسبياً
  position: p.lod.position,
  rotation: p.lod.rotation,
  scale: p.lod.scale,
  visible: true,
  type: "enemy",
  targetCoinId: p.coin.uuid,
  targetCoinPosition: p.coin.position.clone(),
  // تحسين مركز الدورية ليكون قريباً من موقع العملة التي يجب حمايتها
  patrolCenter: p.coin.position.clone(),
  patrolTarget: p.coin.position
    .clone()
    .add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10)),
  isIdling: false,
  idleTimer: 0,
  idleDuration: 0,
  isAttacking: false,
  isDying: false,
  deathTimer: 0,
  hasAppliedDeathEffect: false,
  isSinking: false,
  sinkingTimer: 0,
  initialDeathY: 0,
  mixer: p.mixer,
  animations: [],
  enemyType: p.type,
  currentAction: p.action,
  actions: p.actions,
  chunkKey: p.chunk,
  highDetailModel: p.model,
  lod: p.lod,
  lookAt: (t: THREE.Vector3) => p.lod.lookAt(t),
  isPooled: false,
  isModelInstantiated: true,
});

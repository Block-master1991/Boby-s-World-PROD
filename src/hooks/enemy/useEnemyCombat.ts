import type * as THREE from "three";
import type { FloatingEffectOptions } from "../coin/useCoinInteraction";
import { createCombatHandlers } from "./combatHandlers";

interface Props {
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  isShieldActiveRef: React.MutableRefObject<boolean>;
  protectionBottleCountRef: React.MutableRefObject<number>;
  onConsumeProtectionBottle: () => void;
  onEnemyCollisionPenalty: () => void;
  addFloatingEffect: (options: FloatingEffectOptions) => void;
  onCoinCollected: () => void;
}

export const useEnemyCombat = ({
  dogModelRef,
  isShieldActiveRef,
  protectionBottleCountRef,
  onConsumeProtectionBottle,
  onEnemyCollisionPenalty,
  addFloatingEffect,
}: Props) => {
  return createCombatHandlers(
    { dogModelRef, isShieldActiveRef, protectionBottleCountRef },
    { onConsumeProtectionBottle, onEnemyCollisionPenalty, addFloatingEffect }
  );
};

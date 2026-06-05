import { ENEMY_COLLISION_PENALTY_USDT } from "@/lib/constants";
import { logger } from "@/utils/logger";
import { useCallback } from "react";
import type * as THREE from "three";
import type { FloatingEffectOptions } from "../../coin/useCoinInteraction";
import type { EnemyData } from "../types";

interface PenaltyHandlersParams {
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  isShieldActiveRef: React.MutableRefObject<boolean>;
  protectionBottleCountRef: React.MutableRefObject<number>;
  onConsumeProtectionBottle: () => void;
  onEnemyCollisionPenalty: () => void;
  addFloatingEffect: (options: FloatingEffectOptions) => void;
}

export const createPenaltyHandlers = (params: PenaltyHandlersParams) => {
  const {
    dogModelRef,
    isShieldActiveRef,
    protectionBottleCountRef,
    onConsumeProtectionBottle,
    onEnemyCollisionPenalty,
    addFloatingEffect,
  } = params;

  const applyPenalty = useCallback(
    (e: EnemyData) => {
      if (e.hasAppliedDeathEffect || isShieldActiveRef.current) return;

      if (protectionBottleCountRef.current > 0) {
        logger.log(`[Penalty] Consuming bottle. Current Ref: ${protectionBottleCountRef.current}`);
        protectionBottleCountRef.current--;
        onConsumeProtectionBottle();
        if (dogModelRef.current) {
          addFloatingEffect({
            position: dogModelRef.current.position.clone(),
            effectType: "Bottle",
            value: -1,
            animationType: "followTarget",
            is3DModel: true,
            targetMesh: dogModelRef.current,
          });
        }
      } else {
        onEnemyCollisionPenalty();
        if (dogModelRef.current) {
          addFloatingEffect({
            position: dogModelRef.current.position.clone(),
            effectType: "penalty",
            value: -ENEMY_COLLISION_PENALTY_USDT,
            animationType: "followTarget",
            is3DModel: false,
            targetMesh: dogModelRef.current,
          });
        }
      }
      e.hasAppliedDeathEffect = true;
    },
    [
      isShieldActiveRef,
      dogModelRef,
      protectionBottleCountRef,
      onConsumeProtectionBottle,
      onEnemyCollisionPenalty,
      addFloatingEffect,
    ]
  );

  return { penalty: applyPenalty, handleDeathEffect: applyPenalty };
};

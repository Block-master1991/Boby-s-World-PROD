import { useCallback } from "react";
import * as THREE from "three";
import { ENEMY_ANIMATION_NAMES, ENEMY_ATTACK_DISTANCE } from "../constants";
import type { EnemyData } from "../types";

const playAttack = (e: EnemyData, onFinish?: () => void) => {
  const c =
    e.enemyType === "carnivore" ? ENEMY_ANIMATION_NAMES.CARNIVORE : ENEMY_ANIMATION_NAMES.HERBIVORE;
  // محاولة العثور على أنيميشن الهجوم، مع استخدام 'Attack' كبديل لـ 'Attack_Kick'
  let a = e.actions[c.ATTACK];
  if (!a && c.ATTACK === "Attack_Kick") {
    a = e.actions["Attack"];
  }

  if (a) {
    e.isAttacking = true;
    e.currentAction?.fadeOut(0.1);
    a.reset().setLoop(THREE.LoopOnce, 1).play();
    e.currentAction = a;

    const onFinished = (event: THREE.Event & { action?: THREE.AnimationAction }) => {
      if (event.action === a) {
        e.mixer.removeEventListener("finished", onFinished);
        if (!e.isDying) {
          e.isAttacking = false;
        }
        if (onFinish) onFinish();
      }
    };
    e.mixer.addEventListener("finished", onFinished);
  } else {
    // في حال عدم وجود أي أنيميشن، لا نعلق في وضع الهجوم
    if (onFinish) onFinish();
  }
};

interface AttackHandlersParams {
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  handleDeath: (e: EnemyData) => void;
  penalty: (e: EnemyData) => void;
}

export const createAttackHandlers = (params: AttackHandlersParams) => {
  const { dogModelRef, handleDeath, penalty } = params;

  const handleAttack = useCallback((e: EnemyData, onFinish?: () => void) => {
    if (e.isAttacking || e.isDying) return;
    playAttack(e, onFinish);
  }, []);

  const handleCarnivoreAttack = useCallback(
    (e: EnemyData) => {
      if (e.enemyType !== "carnivore" || e.isAttacking || e.isDying || !dogModelRef.current) return;

      const dogXZ = new THREE.Vector3(
        dogModelRef.current.position.x,
        0,
        dogModelRef.current.position.z
      );
      const enemyXZ = new THREE.Vector3(e.lod.position.x, 0, e.lod.position.z);
      const distXZ = dogXZ.distanceTo(enemyXZ);

      if (distXZ >= ENEMY_ATTACK_DISTANCE) return;

      e.isIdling = false; // تأكد من إيقاف وضع الخمول
      handleAttack(e, () => {
        if (!e.isDying) {
          handleDeath(e);
          penalty(e); //Apply penalty after animation finishes
        }
      });
    },
    [handleAttack, handleDeath, penalty]
  );

  const handleHerbivoreAttack = useCallback(
    (e: EnemyData) => {
      if (e.enemyType !== "herbivore" || e.isAttacking || e.isDying || !dogModelRef.current) return;

      const dogXZ = new THREE.Vector3(
        dogModelRef.current.position.x,
        0,
        dogModelRef.current.position.z
      );
      const enemyXZ = new THREE.Vector3(e.lod.position.x, 0, e.lod.position.z);
      const distXZ = dogXZ.distanceTo(enemyXZ);

      if (distXZ >= ENEMY_ATTACK_DISTANCE) return;

      e.isIdling = false; // تأكد من إيقاف وضع الخمول
      const lookAtTarget = new THREE.Vector3(
        dogModelRef.current.position.x,
        e.lod.position.y,
        dogModelRef.current.position.z
      );
      e.lod.lookAt(lookAtTarget);
      e.lod.rotation.y += Math.PI;

      handleAttack(e, () => {
        if (!e.isDying) {
          handleDeath(e);
          penalty(e); //Apply penalty after animation finishes
        }
      });
    },
    [dogModelRef, handleAttack, handleDeath, penalty]
  );

  return { handleAttack, handleCarnivoreAttack, handleHerbivoreAttack };
};

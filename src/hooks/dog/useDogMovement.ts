import type { MutableRefObject } from "react";
import { useCallback, useRef } from "react";
import * as THREE from "three";
import {
  BOOSTED_DOG_SPEED,
  JOYSTICK_ROTATION_SPEED,
  JOYSTICK_ROTATION_THRESHOLD,
  KEYBOARD_ROTATION_SPEED,
  NORMAL_DOG_SPEED,
  SPRINT_DOG_SPEED,
  SPRINT_JOYSTICK_ROTATION_SPEED,
  SPRINT_JOYSTICK_THRESHOLD,
  SPRINT_KEYBOARD_ROTATION_SPEED,
} from "./constants";

const getSpeed = (boost: boolean, sprint: boolean) => {
  if (boost) return BOOSTED_DOG_SPEED;
  return sprint ? SPRINT_DOG_SPEED : NORMAL_DOG_SPEED;
};

const getSprintState = (
  active: boolean,
  input: { x: number; y: number } | null,
  keys: Record<string, boolean>
) => {
  if (active && input) {
    const mag = Math.sqrt(input.x ** 2 + input.y ** 2);
    return mag > SPRINT_JOYSTICK_THRESHOLD;
  }
  return !!(keys["ShiftLeft"] || keys["ShiftRight"]);
};

const applyJoystick = (
  dog: THREE.Group,
  data: { jX: number; jY: number; speed: number },
  delta: number,
  jRot: number
) => {
  let rot = false;
  if (Math.abs(data.jX) > JOYSTICK_ROTATION_THRESHOLD) {
    dog.rotation.y += (data.jX > 0 ? -1 : 1) * jRot * (Math.abs(data.jX) * 2) * delta;
    rot = true;
  }
  const forward = new THREE.Vector3();
  dog.getWorldDirection(forward);
  const applied = data.speed * Math.abs(data.jY) * delta;
  dog.position.addScaledVector(forward, (data.jY < 0 ? 1 : -1) * applied);
  return { rot, mov: applied > 0.001 };
};

const applyKbd = (
  dog: THREE.Group,
  delta: number,
  opts: { speed: number; kRot: number; keys: Record<string, boolean> }
) => {
  let rot = false;
  const { speed, kRot, keys } = opts;
  if (keys["KeyA"] || keys["ArrowLeft"]) {
    dog.rotation.y += kRot * delta;
    rot = true;
  }
  if (keys["KeyD"] || keys["ArrowRight"]) {
    dog.rotation.y -= kRot * delta;
    rot = true;
  }
  const forward = new THREE.Vector3();
  dog.getWorldDirection(forward);
  let mov = false;
  if (keys["KeyW"] || keys["ArrowUp"]) {
    dog.position.addScaledVector(forward, speed * delta);
    mov = true;
  }
  if (keys["KeyS"] || keys["ArrowDown"]) {
    dog.position.addScaledVector(forward, -speed * delta);
    mov = true;
  }
  return { rot, mov };
};

export const useDogMovement = (
  keysPressedRef: MutableRefObject<Record<string, boolean>>,
  joystickInputRef: MutableRefObject<{ x: number; y: number } | null>,
  isJoystickInteractionActiveRef: MutableRefObject<boolean>,
  isSpeedBoostActiveRef: MutableRefObject<boolean>
) => {
  const dogSpeedRef = useRef(0);
  const isRunningRef = useRef(false);

  const getMovementData = useCallback(() => {
    const input = joystickInputRef.current;
    const keys = keysPressedRef.current;
    const active =
      isJoystickInteractionActiveRef.current && !!input && (input.x !== 0 || input.y !== 0);
    const sprint = getSprintState(active, input, keys);
    const speed = getSpeed(isSpeedBoostActiveRef.current, sprint);
    return { active, sprint, speed, jX: input?.x ?? 0, jY: input?.y ?? 0 };
  }, [joystickInputRef, isJoystickInteractionActiveRef, isSpeedBoostActiveRef, keysPressedRef]);

  const applyMovement = useCallback(
    (dog: THREE.Group, delta: number) => {
      const { active, sprint, speed, jX, jY } = getMovementData();
      const kRot = sprint ? SPRINT_KEYBOARD_ROTATION_SPEED : KEYBOARD_ROTATION_SPEED;
      const jRot = sprint ? SPRINT_JOYSTICK_ROTATION_SPEED : JOYSTICK_ROTATION_SPEED;
      const res = active
        ? applyJoystick(dog, { jX, jY, speed }, delta, jRot)
        : applyKbd(dog, delta, { speed, kRot, keys: keysPressedRef.current });
      dog.position.y = 0;
      dogSpeedRef.current = speed;
      isRunningRef.current = sprint || isSpeedBoostActiveRef.current;
      return { rotationApplied: res.rot, movementApplied: res.mov, isSprinting: sprint };
    },
    [getMovementData, isSpeedBoostActiveRef, keysPressedRef]
  );

  return { dogSpeedRef, isRunningRef, applyMovement };
};

import type * as THREE from "three";

export const NORMAL_DOG_SPEED = 6.0;
export const SPRINT_DOG_SPEED = 18.0;
export const BOOSTED_DOG_SPEED = 24.0;
export const KEYBOARD_ROTATION_SPEED = 1.05;
export const SPRINT_KEYBOARD_ROTATION_SPEED = 0.6;
export const JOYSTICK_ROTATION_SPEED = 0.78;
export const SPRINT_JOYSTICK_ROTATION_SPEED = 0.5;
export const JOYSTICK_ROTATION_THRESHOLD = 0.2;
export const DOG_MODEL_SCALE = 1.5;
export const SHIELD_EMISSIVE_COLOR = 0x0077ff;
export const NORMAL_EMISSIVE_COLOR = 0x000000;
export const SPRINT_JOYSTICK_THRESHOLD = 0.99;
export const CROSSFADE_DURATION = 0.2;

export const ANIMATION_NAMES = {
  IDLE: "Idle",
  WALK: "Walk",
  RUN: "Run",
  SPRINT_JUMP: "Run_Jump",
} as const;

export type DogAnimationName = (typeof ANIMATION_NAMES)[keyof typeof ANIMATION_NAMES];

export interface DogTransform {
  position: THREE.Vector3;
  rotationY: number;
}

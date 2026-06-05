import { useCallback, useRef } from "react";
import * as THREE from "three";
import type { DogAnimationName } from "./constants";
import { ANIMATION_NAMES, CROSSFADE_DURATION } from "./constants";

const setupClips = (mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]) => {
  const actions: Record<string, THREE.AnimationAction> = {};
  const loopNames = [
    ANIMATION_NAMES.IDLE,
    ANIMATION_NAMES.WALK,
    ANIMATION_NAMES.RUN,
    ANIMATION_NAMES.SPRINT_JUMP,
  ] as readonly string[];
  clips.forEach(clip => {
    const action = mixer.clipAction(clip);
    actions[clip.name] = action;
    if (loopNames.includes(clip.name)) action.setLoop(THREE.LoopRepeat, Infinity);
  });
  return actions;
};

export const useDogAnimations = () => {
  const animationMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationActionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  const initAnimations = useCallback(
    (gltf: { animations: THREE.AnimationClip[] }, model: THREE.Group) => {
      if (!gltf.animations?.length) return;
      const mixer = new THREE.AnimationMixer(model);
      animationMixerRef.current = mixer;
      animationActionsRef.current = setupClips(mixer, gltf.animations);
      const iName = animationActionsRef.current[ANIMATION_NAMES.IDLE]
        ? ANIMATION_NAMES.IDLE
        : gltf.animations[0]?.name;
      if (iName && animationActionsRef.current[iName]) {
        const initial = animationActionsRef.current[iName];
        initial.play();
        currentActionRef.current = initial;
      }
    },
    []
  );

  const updateAnimationState = useCallback((newActionName: DogAnimationName) => {
    const mixer = animationMixerRef.current;
    const newAction = animationActionsRef.current[newActionName];
    const oldAction = currentActionRef.current;
    if (!mixer || !newAction || oldAction === newAction) return;
    if (oldAction) oldAction.fadeOut(CROSSFADE_DURATION);
    newAction
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(CROSSFADE_DURATION)
      .play();
    currentActionRef.current = newAction;
  }, []);

  const stopAnimations = useCallback((model: THREE.Group | null) => {
    if (animationMixerRef.current) {
      animationMixerRef.current.stopAllAction();
      if (model) animationMixerRef.current.uncacheRoot(model);
      animationMixerRef.current = null;
    }
    animationActionsRef.current = {};
    currentActionRef.current = null;
  }, []);

  return { animationMixerRef, initAnimations, updateAnimationState, stopAnimations };
};

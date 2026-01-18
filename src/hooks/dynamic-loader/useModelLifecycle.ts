import { useCallback } from 'react';
import * as THREE from 'three';
import type { DynamicLoadableObject } from './constants';
import { ENEMY_ANIMATION_NAMES } from './constants';

export const useModelAnimations = () => {
  const processClips = useCallback((mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[], object: DynamicLoadableObject) => {
    clips.forEach(clip => {
      const action = mixer.clipAction(clip);
      if (object.actions) object.actions[clip.name] = action;
      if (!object.enemyType) return;
      const type = object.enemyType.toUpperCase() as keyof typeof ENEMY_ANIMATION_NAMES;
      const names = ENEMY_ANIMATION_NAMES[type];
      const isLoop = (names.IDLE as readonly string[]).includes(clip.name) || clip.name === names.WALK || clip.name === names.GALLOP;
      action.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, isLoop ? Infinity : 1);
      action.clampWhenFinished = !isLoop;
    });
  }, []);

  const setupAnimations = useCallback((object: DynamicLoadableObject, animations: THREE.AnimationClip[]) => {
    if (!animations?.length || !object.modelInstance) return;
    object.mixer?.stopAllAction();
    object.mixer?.uncacheRoot(object.mixer.getRoot());
    
    const mixer = new THREE.AnimationMixer(object.modelInstance);
    object.mixer = mixer;
    object.animations = animations;
    object.actions = {};
    processClips(mixer, animations, object);

    if (object.enemyType) {
      const type = object.enemyType.toUpperCase() as keyof typeof ENEMY_ANIMATION_NAMES;
      const idles = ENEMY_ANIMATION_NAMES[type].IDLE as readonly string[];
      const initial = idles[Math.floor(Math.random() * idles.length)];
      if (initial && object.actions?.[initial]) {
        const initialAction = object.actions[initial];
        object.currentAction = initialAction;
        initialAction.play();
      }
    }
  }, [processClips]);

  return { setupAnimations };
};

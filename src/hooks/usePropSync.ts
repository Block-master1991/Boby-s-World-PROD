import { useEffect, useRef } from "react";

interface UsePropSyncProps {
  isSpeedBoostActive: boolean;
  isShieldActive: boolean;
  isCoinMagnetActive: boolean;
  isPaused: boolean;
  joystickInputFromUI: { x: number; y: number } | null;
  protectionBottleCount: number;
  onCanvasTouchEndProp: () => void;
}

export const usePropSync = ({
  isSpeedBoostActive,
  isShieldActive,
  isCoinMagnetActive,
  isPaused,
  joystickInputFromUI,
  protectionBottleCount,
  onCanvasTouchEndProp,
}: UsePropSyncProps) => {
  const isSpeedBoostActiveRef = useRef(isSpeedBoostActive);
  const isShieldActiveRef = useRef(isShieldActive);
  const isCoinMagnetActiveRef = useRef(isCoinMagnetActive);
  const isPausedRef = useRef(isPaused);
  const joystickInputRef = useRef(joystickInputFromUI);
  const protectionBottleCountRef = useRef(protectionBottleCount);
  const isJoystickInteractionActiveRef = useRef(false);
  const keysPressedRef = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    isSpeedBoostActiveRef.current = isSpeedBoostActive;
  }, [isSpeedBoostActive]);
  useEffect(() => {
    isShieldActiveRef.current = isShieldActive;
  }, [isShieldActive]);
  useEffect(() => {
    isCoinMagnetActiveRef.current = isCoinMagnetActive;
  }, [isCoinMagnetActive]);
  useEffect(() => {
    protectionBottleCountRef.current = protectionBottleCount;
  }, [protectionBottleCount]);

  useEffect(() => {
    isPausedRef.current = isPaused;
    if (isPaused && isJoystickInteractionActiveRef.current) {
      onCanvasTouchEndProp();
      isJoystickInteractionActiveRef.current = false;
    }
    if (isPaused) keysPressedRef.current = {};
  }, [isPaused, onCanvasTouchEndProp]);

  useEffect(() => {
    joystickInputRef.current = joystickInputFromUI;
  }, [joystickInputFromUI]);

  return {
    isSpeedBoostActiveRef,
    isShieldActiveRef,
    isCoinMagnetActiveRef,
    isPausedRef,
    joystickInputRef,
    protectionBottleCountRef,
    isJoystickInteractionActiveRef,
    keysPressedRef,
  };
};

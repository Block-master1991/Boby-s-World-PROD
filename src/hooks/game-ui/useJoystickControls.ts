import { useCallback, useState } from "react";

// Constants
const JOYSTICK_BASE_SIZE = 100;
const JOYSTICK_KNOB_SIZE = 50;
const MAX_DISTANCE = JOYSTICK_BASE_SIZE / 2;

// Pure Helper
const calculateJoystickPosition = (
  touchX: number,
  touchY: number,
  baseX: number,
  baseY: number
) => {
  const deltaX = touchX - baseX;
  const deltaY = touchY - baseY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const angle = Math.atan2(deltaY, deltaX);
  const clampedDistance = Math.min(distance, MAX_DISTANCE);

  return {
    x: clampedDistance * Math.cos(angle),
    y: clampedDistance * Math.sin(angle),
    normX: (clampedDistance * Math.cos(angle)) / MAX_DISTANCE,
    normY: (clampedDistance * Math.sin(angle)) / MAX_DISTANCE,
  };
};

interface JoystickProps {
  isMobile: boolean;
  isGameEffectivelyPaused: boolean;
  isAuthenticated: boolean;
  isWalletConnectedAndMatching: boolean;
}

export const useJoystickControls = ({
  isMobile,
  isGameEffectivelyPaused,
  isAuthenticated,
  isWalletConnectedAndMatching,
}: JoystickProps) => {
  const [joystickMovement, setJoystickMovement] = useState({ x: 0, y: 0 });
  const [dynamicJoystickState, setDynamicJoystickState] = useState<{
    isActive: boolean;
    visible: boolean;
    baseScreenX: number;
    baseScreenY: number;
    knobOffsetX: number;
    knobOffsetY: number;
  }>({
    isActive: false,
    visible: false,
    baseScreenX: 0,
    baseScreenY: 0,
    knobOffsetX: 0,
    knobOffsetY: 0,
  });

  const handleCanvasTouchStart = useCallback(
    (x: number, y: number) => {
      if (!isMobile || isGameEffectivelyPaused || !isAuthenticated || !isWalletConnectedAndMatching)
        return;
      setDynamicJoystickState({
        isActive: true,
        visible: true,
        baseScreenX: x,
        baseScreenY: y,
        knobOffsetX: 0,
        knobOffsetY: 0,
      });
    },
    [isMobile, isGameEffectivelyPaused, isAuthenticated, isWalletConnectedAndMatching]
  );

  const handleCanvasTouchMove = useCallback(
    (touchX: number, touchY: number) => {
      if (!dynamicJoystickState.isActive) return;
      // touchX/touchY هي إحداثيات مطلقة (clientX/Y) من لمسة الإصبع
      // calculateJoystickPosition تحسب الإزاحة عن مركز الجويستك (baseScreenX/Y)
      const pos = calculateJoystickPosition(
        touchX,
        touchY,
        dynamicJoystickState.baseScreenX,
        dynamicJoystickState.baseScreenY
      );
      setDynamicJoystickState(prev => ({ ...prev, knobOffsetX: pos.x, knobOffsetY: pos.y }));
      // محور Y في الشاشة: ⬆️ = سالب، ⬇️ = موجب
      // محور Y في اللعبة (applyJoystick): jY < 0 = للأمام، jY > 0 = للخلف
      // لذا نُبقي normY كما هو (بدون قلب) — السحب للأعلى يعطي normY سالبًا = للأمام ✅
      setJoystickMovement({ x: pos.normX, y: pos.normY });
    },
    [
      dynamicJoystickState.isActive,
      dynamicJoystickState.baseScreenX,
      dynamicJoystickState.baseScreenY,
    ]
  );

  const handleCanvasTouchEnd = useCallback(() => {
    if (!dynamicJoystickState.isActive) return;
    setDynamicJoystickState({
      isActive: false,
      visible: false,
      baseScreenX: 0,
      baseScreenY: 0,
      knobOffsetX: 0,
      knobOffsetY: 0,
    });
    setJoystickMovement({ x: 0, y: 0 });
  }, [dynamicJoystickState.isActive]);

  return {
    joystickMovement,
    dynamicJoystickState,
    handleCanvasTouchStart,
    handleCanvasTouchMove,
    handleCanvasTouchEnd,
    JOYSTICK_BASE_SIZE,
    JOYSTICK_KNOB_SIZE,
  };
};

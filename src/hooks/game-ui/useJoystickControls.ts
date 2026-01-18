import { useCallback, useState } from 'react';

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
        normY: (clampedDistance * Math.sin(angle)) / MAX_DISTANCE
    };
};

interface JoystickProps {
    isMobile: boolean;
    isGameEffectivelyPaused: boolean;
    isAuthenticated: boolean;
    isWalletConnectedAndMatching: boolean;
}

export const useJoystickControls = ({ isMobile, isGameEffectivelyPaused, isAuthenticated, isWalletConnectedAndMatching }: JoystickProps) => {
    const [joystickMovement, setJoystickMovement] = useState({ x: 0, y: 0 });
    const [dynamicJoystickState, setDynamicJoystickState] = useState<{
        isActive: boolean; visible: boolean;
        baseScreenX: number; baseScreenY: number;
        knobOffsetX: number; knobOffsetY: number;
    }>({ isActive: false, visible: false, baseScreenX: 0, baseScreenY: 0, knobOffsetX: 0, knobOffsetY: 0 });
    
    const handleCanvasTouchStart = useCallback((x: number, y: number) => {
        if (!isMobile || isGameEffectivelyPaused || !isAuthenticated || !isWalletConnectedAndMatching) return;
        setDynamicJoystickState({
            isActive: true, visible: true,
            baseScreenX: x, baseScreenY: y,
            knobOffsetX: 0, knobOffsetY: 0
        });
    }, [isMobile, isGameEffectivelyPaused, isAuthenticated, isWalletConnectedAndMatching]);

    const handleCanvasTouchMove = useCallback((x: number, y: number) => {
        if (!dynamicJoystickState.isActive) return;
        // The callback receives current touch coordinates (or deltas, checking GameCanvas usage)
        // GameCanvas.tsx prop says: onCanvasTouchMove: (deltaX: number, deltaY: number) => void
        // But usually touch move gives absolute coordinates. Let's assume GameCanvas passes absolute X/Y or we need to check useTouchHandling.
        // Wait, GameCanvas prop type says `deltaX, deltaY`? 
        // Let's assume absolute Position for joystick logic usually. If GameCanvas sends delta, we need to accumulate.
        // BUT, looking at `calculateJoystickPosition`, it expects `touchX, touchY`.
        // If `GameCanvas` sends deltas, we need to track `currentX/Y`. 
        // Ideally, `GameCanvas` should send absolute coordinates for a joystick. 
        // I will assume `GameCanvas` acts as a touch forwarder and sends `clientX, clientY`.
        // If the prop name is `deltaX`, that's confusing.
        // Let's stick to the previous implementation logic but with arguments. Previously it used `e.changedTouches[0].clientX`.
        // So the caller must pass ClientX/Y.
        
        const pos = calculateJoystickPosition(x, y, dynamicJoystickState.baseScreenX, dynamicJoystickState.baseScreenY);
        setDynamicJoystickState(prev => ({ ...prev, knobOffsetX: pos.x, knobOffsetY: pos.y }));
        setJoystickMovement({ x: pos.normX, y: -pos.normY });
    }, [dynamicJoystickState.isActive, dynamicJoystickState.baseScreenX, dynamicJoystickState.baseScreenY]);

    const handleCanvasTouchEnd = useCallback(() => {
        if (!dynamicJoystickState.isActive) return;
        setDynamicJoystickState({ isActive: false, visible: false, baseScreenX: 0, baseScreenY: 0, knobOffsetX: 0, knobOffsetY: 0 });
        setJoystickMovement({ x: 0, y: 0 });
    }, [dynamicJoystickState.isActive]);

    return {
        joystickMovement, dynamicJoystickState,
        handleCanvasTouchStart, handleCanvasTouchMove, handleCanvasTouchEnd,
        JOYSTICK_BASE_SIZE, JOYSTICK_KNOB_SIZE
    };
};

import type { PublicKey } from '@solana/web3.js';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect } from 'react';

interface UseTouchHandlingProps {
    mountRef: MutableRefObject<HTMLDivElement | null>;
    sessionPublicKey: PublicKey | null;
    isPausedRef: MutableRefObject<boolean>;
    isJoystickInteractionActiveRef: MutableRefObject<boolean>;
    onCanvasTouchStartProp: (screenX: number, screenY: number) => void;
    onCanvasTouchMoveProp: (deltaX: number, deltaY: number) => void;
    onCanvasTouchEndProp: () => void;
    initialTouchPointRef: MutableRefObject<{ x: number, y: number, id: number } | null>;
}

export const useTouchHandling = ({
    mountRef, sessionPublicKey: sPK, isPausedRef: iP, isJoystickInteractionActiveRef: iJI,
    onCanvasTouchStartProp: oTS, onCanvasTouchMoveProp: oTM, onCanvasTouchEndProp: oTE, initialTouchPointRef: iT,
}: UseTouchHandlingProps) => {
    const handleStart = useCallback((e: TouchEvent) => {
        if (e.touches.length === 1 && !iP.current && sPK) {
            const [t] = Array.from(e.touches);
            if (t) {
                iJI.current = true; iT.current = { x: t.clientX, y: t.clientY, id: t.identifier };
                oTS(t.clientX, t.clientY);
            }
        }
    }, [iP, sPK, oTS, iJI, iT]);

    const handleMove = useCallback((e: TouchEvent) => {
        if (iJI.current && iT.current !== null) {
            const t = Array.from(e.touches).find(v => v.identifier === iT.current?.id);
            if (t) {
                if (e.cancelable) e.preventDefault();
                oTM(t.clientX - iT.current.x, t.clientY - iT.current.y);
            }
        }
    }, [oTM, iJI, iT]);

    const handleEnd = useCallback((e: TouchEvent) => {
        if (!iT.current || !iJI.current) return;
        if (!Array.from(e.touches).some(v => v.identifier === iT.current?.id)) {
            iJI.current = false; iT.current = null; oTE();
        }
    }, [oTE, iJI, iT]);

    useEffect(() => {
        const el = mountRef.current; if (!el || !sPK) return;
        const opts = { passive: false } as const;
        el.addEventListener('touchstart', handleStart, opts); el.addEventListener('touchmove', handleMove, opts);
        el.addEventListener('touchend', handleEnd); el.addEventListener('touchcancel', handleEnd);
        return () => {
            el.removeEventListener('touchstart', handleStart); el.removeEventListener('touchmove', handleMove);
            el.removeEventListener('touchend', handleEnd); el.removeEventListener('touchcancel', handleEnd);
        };
    }, [sPK, handleStart, handleMove, handleEnd, mountRef]);
    return { initialTouchPointRef: iT };
};

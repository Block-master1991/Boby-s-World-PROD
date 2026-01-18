import type { PublicKey } from '@solana/web3.js';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';

interface UseKeyboardHandlingProps {
    sessionPublicKey: PublicKey | null;
    isPausedRef: MutableRefObject<boolean>;
    keysPressedRef: MutableRefObject<{ [key: string]: boolean }>;
}

export const useKeyboardHandling = ({
    sessionPublicKey,
    isPausedRef,
    keysPressedRef,
}: UseKeyboardHandlingProps) => {
    const handleKeyDownCbRef = useRef<((event: KeyboardEvent) => void) | null>(null);
    const handleKeyUpCbRef = useRef<((event: KeyboardEvent) => void) | null>(null);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (isPausedRef.current) return;
        if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        const gameControlCodes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'];
        if (gameControlCodes.includes(event.code)) {
            event.preventDefault();
        }
        keysPressedRef.current[event.code] = true;
    }, [isPausedRef, keysPressedRef]);

    const handleKeyUp = useCallback((event: KeyboardEvent) => {
        keysPressedRef.current[event.code] = false;
    }, [keysPressedRef]);

    useEffect(() => {
        if (!sessionPublicKey) {
            if (handleKeyDownCbRef.current) window.removeEventListener('keydown', handleKeyDownCbRef.current);
            if (handleKeyUpCbRef.current) window.removeEventListener('keyup', handleKeyUpCbRef.current);
            handleKeyDownCbRef.current = null;
            handleKeyUpCbRef.current = null;
            keysPressedRef.current = {};
            return;
        }

        handleKeyDownCbRef.current = handleKeyDown;
        handleKeyUpCbRef.current = handleKeyUp;
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            keysPressedRef.current = {};
        };
    }, [sessionPublicKey, handleKeyDown, handleKeyUp, keysPressedRef]);

    return { handleKeyDownCbRef, handleKeyUpCbRef };
};

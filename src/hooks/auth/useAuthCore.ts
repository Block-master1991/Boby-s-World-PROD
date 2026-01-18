import { cacheManager, performanceMonitor } from '@/lib/advanced-service-worker';
import type { AuthState } from '@/types/auth';
import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const useSessionPoller = (checkSession: () => Promise<boolean>, initializedRef: React.MutableRefObject<boolean>) => {
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof window !== 'undefined' && !(window as any).__initialAuthCheckStarted) { 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
             (window as any).__initialAuthCheckStarted = true; checkSession(); 
        }
        const interval = setInterval(() => checkSession(), 12 * 60 * 1000);
        return () => clearInterval(interval);
    }, [checkSession, initializedRef]);
};

export const useAuthCore = () => {
    const { publicKey: adapterPublicKey, connected } = useWallet();
    const [authState, setAuthState] = useState<AuthState>({ isAuthenticated: false, isLoading: true, user: null, error: null });
    const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
    const [retryRequested, sRR] = useState(false);
    const [refs] = useState(() => ({ sc: false, ia: false, pk: undefined as string | undefined, init: false }));

    // FIX: ESLint warns about unused setIsOnline if not used in render or effect.
    // We are using it in event listeners, but passing it to return object ensures usage.
    useEffect(() => {
        const hOn = () => setIsOnline(true); const hOff = () => setIsOnline(false);
        window.addEventListener('online', hOn); window.addEventListener('offline', hOff);
        return () => { window.removeEventListener('online', hOn); window.removeEventListener('offline', hOff); };
    }, []);

    const checkSession = useCallback(async (): Promise<boolean> => {
        if (refs.sc) return refs.ia;
        refs.sc = true;
        try {
            if (!refs.ia) setAuthState(p => ({ ...p, isLoading: true, error: null }));
            const start = Date.now();
            try {
                const res = await cacheManager.handleRequest(new Request('/api/auth/session', { method: 'GET', credentials: 'include' })) || await fetch('/api/auth/session');
                if (res?.ok) {
                    const d = await res.json();
                    if (d.authenticated && d.user?.wallet) {
                        performanceMonitor.recordCacheHit();
                        refs.ia = true; refs.pk = d.user.wallet;
                        setAuthState({ isAuthenticated: true, user: { publicKey: d.user.wallet, wallet: d.user.wallet }, isLoading: false, error: null });
                        localStorage.setItem('last_user_pk', d.user.wallet);
                        return true;
                    }
                }
                refs.ia = false; setAuthState({ isAuthenticated: false, user: null, isLoading: false, error: null }); return false;
            } catch {
                performanceMonitor.recordError();
                setAuthState(p => ({ ...p, isAuthenticated: false, user: null, error: 'Network Error', isLoading: false })); return false;
            } finally { performanceMonitor.recordLoadTime(Date.now() - start); }
        } finally { refs.sc = false; sRR(false); }
    }, [refs]);

    const isWalletConnectedAndMatching = useMemo(() => !!connected && !!adapterPublicKey && authState.user?.publicKey === adapterPublicKey.toBase58(), [connected, adapterPublicKey, authState.user?.publicKey]);
    const initRef = useRef(false);
    useSessionPoller(checkSession, initRef);
    useEffect(() => { if (retryRequested) checkSession(); }, [retryRequested, checkSession]);

    return { authState, setAuthState, checkSession, isOnline, retrySessionCheck: () => sRR(true), isWalletConnectedAndMatching };
};

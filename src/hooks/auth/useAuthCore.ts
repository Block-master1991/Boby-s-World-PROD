import { cacheManager, performanceMonitor } from '@/lib/advanced-service-worker';
import type { AuthState } from '@/types/auth';
import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Module-level Guard ───────────────────────────────────────────────────────
// Prevents multiple initial session checks (survives React Strict Mode)
let initialSessionCheckStarted = false;

// ─── Types ────────────────────────────────────────────────────────────────────
interface SessionCheckRefs {
    inProgress: React.MutableRefObject<boolean>;
    isAuthenticated: React.MutableRefObject<boolean>;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

const fetchSessionData = () => {
    const req = new Request('/api/auth/session', { method: 'GET', credentials: 'include' });
    return cacheManager.handleRequest(req) || fetch('/api/auth/session', { credentials: 'include' });
};

const handleAuthSuccess = (
    wallet: string,
    refs: SessionCheckRefs,
    setAuthState: React.Dispatch<React.SetStateAction<AuthState>>
) => {
    performanceMonitor.recordCacheHit();
    refs.isAuthenticated.current = true;
    setAuthState({
        isAuthenticated: true,
        user: { publicKey: wallet, wallet },
        isLoading: false,
        error: null
    });
    localStorage.setItem('last_user_pk', wallet);
};

const handleAuthFailure = (
    refs: SessionCheckRefs,
    setAuthState: React.Dispatch<React.SetStateAction<AuthState>>,
    error?: string
) => {
    refs.isAuthenticated.current = false;
    if (error) performanceMonitor.recordError();
    setAuthState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: error ?? null
    });
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useOnlineStatus = () => {
    const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);

    useEffect(() => {
        const hOn = () => setIsOnline(true);
        const hOff = () => setIsOnline(false);
        window.addEventListener('online', hOn);
        window.addEventListener('offline', hOff);
        return () => { window.removeEventListener('online', hOn); window.removeEventListener('offline', hOff); };
    }, []);

    return isOnline;
};

const useSessionPoller = (
    checkSessionRef: React.MutableRefObject<() => Promise<boolean>>,
    hasInitialized: React.MutableRefObject<boolean>
) => {
    useEffect(() => {
        if (hasInitialized.current || initialSessionCheckStarted) return;
        hasInitialized.current = true;
        initialSessionCheckStarted = true;
        checkSessionRef.current();
        const interval = setInterval(() => checkSessionRef.current(), 12 * 60 * 1000);
        return () => clearInterval(interval);
    }, [checkSessionRef, hasInitialized]);
};

const useSessionCheck = (
    refs: SessionCheckRefs,
    setAuthState: React.Dispatch<React.SetStateAction<AuthState>>,
    setRetryRequested: React.Dispatch<React.SetStateAction<boolean>>
) => {
    return useCallback(async (): Promise<boolean> => {
        if (refs.inProgress.current) return refs.isAuthenticated.current;
        refs.inProgress.current = true;

        try {
            if (!refs.isAuthenticated.current) setAuthState(p => ({ ...p, isLoading: true, error: null }));
            const start = Date.now();

            try {
                const res = await fetchSessionData();
                if (res?.ok) {
                    const data = await res.json();
                    if (data.authenticated && data.user?.wallet) {
                        handleAuthSuccess(data.user.wallet, refs, setAuthState);
                        return true;
                    }
                }
                handleAuthFailure(refs, setAuthState);
                return false;
            } catch {
                handleAuthFailure(refs, setAuthState, 'Network Error');
                return false;
            } finally {
                performanceMonitor.recordLoadTime(Date.now() - start);
            }
        } finally {
            refs.inProgress.current = false;
            setRetryRequested(false);
        }
    }, [refs, setAuthState, setRetryRequested]);
};

// ─── Main Hook ────────────────────────────────────────────────────────────────

export const useAuthCore = () => {
    const { publicKey: adapterPublicKey, connected } = useWallet();
    const [authState, setAuthState] = useState<AuthState>({ isAuthenticated: false, isLoading: true, user: null, error: null });
    const [retryRequested, setRetryRequested] = useState(false);
    const isOnline = useOnlineStatus();

    const refs: SessionCheckRefs = { inProgress: useRef(false), isAuthenticated: useRef(false) };
    const hasInitialized = useRef(false);

    const checkSession = useSessionCheck(refs, setAuthState, setRetryRequested);
    const checkSessionRef = useRef(checkSession);
    checkSessionRef.current = checkSession;

    const isWalletConnectedAndMatching = useMemo(
        () => !!connected && !!adapterPublicKey && authState.user?.publicKey === adapterPublicKey.toBase58(),
        [connected, adapterPublicKey, authState.user?.publicKey]
    );

    useSessionPoller(checkSessionRef, hasInitialized);
    useEffect(() => { if (retryRequested) checkSession(); }, [retryRequested, checkSession]);

    return { authState, setAuthState, checkSession, isOnline, retrySessionCheck: () => setRetryRequested(true), isWalletConnectedAndMatching };
};

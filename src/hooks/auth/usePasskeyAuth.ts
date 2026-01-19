import { useToast } from '@/hooks/use-toast';
import { fetchWithCsrf } from '@/lib/utils';
import type { AuthState, WebAuthnRegisterOptions } from '@/types/auth';
import { safeBufferFromBase64url, uint8ArrayToBase64url } from '@/utils/base64';
import { logger } from '@/utils/logger';
import WebAuthnTransactionManager from '@/utils/webauthn-transaction';
import { useCallback, useEffect, useState } from 'react';

interface UsePasskeyAuthProps { authState: AuthState; setAuthState: React.Dispatch<React.SetStateAction<AuthState>>; }

const initiateRegistration = async (publicKey: string) => {
    WebAuthnTransactionManager.start();
    const res = await fetchWithCsrf('/api/auth/webauthn/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: publicKey, userName: `User ${publicKey.slice(0, 4)}` }) });
    if (!res.ok) throw new Error('Init failed');
    return await res.json() as WebAuthnRegisterOptions;
};

const createCredential = (opts: WebAuthnRegisterOptions) => {
    const challenge = Uint8Array.from(safeBufferFromBase64url(opts.challenge));
    const userId = Uint8Array.from(safeBufferFromBase64url(opts.user.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publicKeyOpts = { ...(opts as any), challenge, user: { ...opts.user, id: userId } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return navigator.credentials.create({ publicKey: publicKeyOpts }) as Promise<any>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const confirmRegistration = async (userId: string, description: string, cred: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport = cred.response.getTransports ? (cred.response as any).getTransports() : [];
    const body = { userId, description, credential: { id: cred.id, publicKey: uint8ArrayToBase64url(new Uint8Array(cred.response.getPublicKey())) }, transports: transport };
    const conf = await fetchWithCsrf('/api/auth/webauthn/register/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!conf.ok) throw new Error('Confirm failed'); return true;
};

 
const getAssertion = async (uid: string) => {
    const signal = WebAuthnTransactionManager.start();
    const res = await fetchWithCsrf('/api/auth/webauthn/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid })
    });
    const opts = await res.json();
    const challengeBuf = Uint8Array.from(safeBufferFromBase64url(opts.challenge));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assertion = await navigator.credentials.get({ publicKey: { ...opts, challenge: challengeBuf }, signal }) as any;
    return { assertion, discoveryId: opts.discoveryId };
};

export const usePasskeyAuth = ({ authState, setAuthState }: UsePasskeyAuthProps) => {
    const { toast } = useToast();
    const [hasPasskey, setHasPasskey] = useState(false);
    useEffect(() => { if (typeof window !== 'undefined' && 'PublicKeyCredential' in window && localStorage.getItem('boby_world_passkey_registered') === 'true') setHasPasskey(true); }, []);

    const registerPasskey = useCallback(async (description = 'My Device'): Promise<boolean> => {
        if (!authState.isAuthenticated || !authState.user?.publicKey) { toast({ variant: 'destructive', title: 'Error', description: 'Log in first.' }); return false; }
        if (WebAuthnTransactionManager.isActive()) WebAuthnTransactionManager.cancel();
        let started = false;
        try {
            started = true;
            const cred = await createCredential(await initiateRegistration(authState.user.publicKey));
            if (!cred) throw new Error('Cancelled');
            await confirmRegistration(authState.user.publicKey, description, cred);
            localStorage.setItem('boby_world_passkey_registered', 'true'); setHasPasskey(true); toast({ title: 'Success', description: 'Passkey registered.' }); return true;
        } catch (e: unknown) {
            const m = e instanceof Error ? e.message : 'Failed'; logger.error('Passkey Reg Error:', m); toast({ variant: 'destructive', title: 'Error', description: m }); return false;
        } finally { if (started) WebAuthnTransactionManager.complete(); }
    }, [authState, toast]);

    const loginWithPasskey = useCallback(async (pre?: unknown): Promise<boolean> => {
        if (!pre && WebAuthnTransactionManager.isActive()) return false;
        setAuthState(p => ({ ...p, isLoading: true, error: null }));
        let started = false;
        try {
            const uid = localStorage.getItem('last_user_pk') || '';
            let assertion = pre, discoveryId: string | undefined;
            if (!assertion) { 
                started = true; 
                const { assertion: a, discoveryId: d } = await getAssertion(uid); 
                assertion = a; 
                discoveryId = d; 
            }
            if (!assertion) throw new Error('No credential');
            const { id, response } = assertion as { id: string, response: unknown };
            const verify = await fetchWithCsrf('/api/auth/webauthn/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid || undefined, credentialResponse: { id, response, discoveryId } }) });
            if (verify.ok) { const data = await verify.json(); setAuthState({ isAuthenticated: true, isLoading: false, user: { publicKey: data.publicKey, wallet: data.publicKey }, error: null }); return true; }
            throw new Error('Verification failed');
        } catch (e: unknown) { setAuthState(p => ({ ...p, isLoading: false, error: (e as Error).message })); return false;
        } finally { if (started) WebAuthnTransactionManager.complete(); }
    }, [setAuthState]);
    return { registerPasskey, loginWithPasskey, hasPasskey };
};

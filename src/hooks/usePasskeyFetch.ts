'use client';

import { useToast } from '@/hooks/use-toast';
import { useApiFetch } from '@/utils/api';
import { logger } from '@/utils/logger';
import { useCallback } from 'react';
import type { usePasskeyState } from './usePasskeyState';

export const usePasskeyFetch = (
    isAuthenticated: boolean,
    { setPasskeys, setLoading }: ReturnType<typeof usePasskeyState>
) => {
    const { toast } = useToast();
    const { apiFetch } = useApiFetch();

    return useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            setLoading(true);
            const res = await apiFetch('/api/auth/webauthn/manage', { credentials: 'include' });
            if (res.ok) setPasskeys((await res.json()).passkeys || []);
            else throw new Error('Failed to load passkeys.');
        } catch (error) {
            logger.error('Fetch error:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to load passkeys.' });
        } finally { setLoading(false); }
    }, [isAuthenticated, apiFetch, toast, setPasskeys, setLoading]);
};

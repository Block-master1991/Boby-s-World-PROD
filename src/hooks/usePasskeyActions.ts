'use client';

import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useApiFetch } from '@/utils/api';
import { logger } from '@/utils/logger';
import type { usePasskeyState } from './usePasskeyState';

export const usePasskeyActions = (
    state: ReturnType<typeof usePasskeyState>,
    fetchPasskeys: () => Promise<void>,
    onPasskeyRegistered?: () => void
) => {
    const { registerPasskey: registerHook } = useAuthContext();
    const { toast } = useToast();
    const { apiFetch } = useApiFetch();
    const { passkeys, setRegistering, setDeleting, setDescription, setIsDialogOpen, description } = state;

    const registerNewPasskey = async () => {
        if (!description.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Enter description.' });
            return;
        }
        try {
            setRegistering(true);
            if (await registerHook(description.trim())) {
                setDescription(''); setIsDialogOpen(false); await fetchPasskeys(); onPasskeyRegistered?.();
            }
        } catch (e) { logger.error('Register error:', e); } finally { setRegistering(false); }
    };

    const deletePasskey = async (credentialId: string) => {
        if (passkeys.length <= 1) {
            toast({ variant: 'destructive', title: 'Error', description: 'Cannot delete last passkey.' });
            return;
        }
        try {
            setDeleting(credentialId);
            const res = await apiFetch(`/api/auth/webauthn/manage/${credentialId}`, { method: 'DELETE', credentials: 'include' });
            if (res.ok) { toast({ title: 'Success', description: 'Deleted.' }); await fetchPasskeys(); }
            else throw new Error('Delete failed.');
        } catch (e) { logger.error('Delete error:', e); toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete.' }); }
        finally { setDeleting(null); }
    };

    return { registerNewPasskey, deletePasskey };
};

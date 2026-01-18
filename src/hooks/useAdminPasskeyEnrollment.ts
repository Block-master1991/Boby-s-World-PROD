'use client';

import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export const useAdminPasskeyEnrollment = () => {
    const { isAuthenticated } = useAuthContext();
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const reason = searchParams.get('reason');

    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        if (reason === 'required') {
            setIsModalOpen(true);
        }
    }, [reason]);

    const handlePasskeyRegistered = useCallback(() => {
        setIsModalOpen(false);
        toast({
            title: 'Admin Passkey Set Up',
            description: 'Your admin account is now secured with biometric authentication.',
        });
        router.push('/admin');
    }, [router, toast]);

    const handleCloseModal = useCallback(() => {
        if (reason === 'required') {
            toast({
                variant: 'destructive',
                title: 'Setup Required',
                description: 'Passkey setup is mandatory for admin access.',
            });
        } else {
            setIsModalOpen(false);
        }
    }, [reason, toast]);

    return {
        isAuthenticated,
        isModalOpen,
        setIsModalOpen,
        reason,
        handlePasskeyRegistered,
        handleCloseModal,
        router
    };
};

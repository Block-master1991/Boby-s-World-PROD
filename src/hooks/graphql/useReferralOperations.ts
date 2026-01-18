import { logger } from '@/utils/logger';
import { useCallback } from 'react';
import type { ClaimReferralResponse, ReferralData } from './types';
import { useBaseGraphQL, useBaseMutation } from './useBaseGraphQL';

export const useReferralData = (userId: string) => {
    return useBaseGraphQL<{ referralData: ReferralData }>(`
        query GetReferralData($userId: ID!) {
            referralData(userId: $userId) {
                referralCode
                totalReferrals
                totalEarnings
                pendingRewards
            }
        }
    `, {
        variables: { userId },
        skip: !userId
    });
};

export const useClaimReferralRewards = () => {
    const { execute: mutate, loading, error } = useBaseMutation<{ claimReferralRewards: ClaimReferralResponse }>(`
        mutation ClaimReferralRewards($userId: ID!) {
            claimReferralRewards(userId: $userId) {
                success
                amountClaimed
                newPendingBalance
                error
            }
        }
    `);

    const claimRewards = useCallback(async (userId: string) => {
        try {
            const result = await mutate({ userId });
            return result?.claimReferralRewards;
        } catch (err) {
            logger.error('[useClaimReferralRewards] Error:', err);
            return { success: false, error: 'Failed to claim rewards' };
        }
    }, [mutate]);

    return { loading, error, claimRewards };
};

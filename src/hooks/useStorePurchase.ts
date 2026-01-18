'use client';

import { useToast } from '@/hooks/use-toast';
import type { StoreItemDefinition } from '@/lib/server-items';
import { solanaPaymentService, type PurchaseProgress } from '@/lib/solanaPaymentService';
import { WebAuthnTransactionSigner } from '@/lib/WebAuthnTransactionSigner';
import { useApiFetch } from '@/utils/api';
import { uint8ArrayToBase64url } from '@/utils/base64';
import { logger } from '@/utils/logger';
import {
    buildBobyPurchaseTransaction,
    pollTransactionConfirmation,
    verifyPurchaseWithBackend
} from '@/utils/solanaPurchaseHelpers';
import type { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { useCallback, useState } from 'react';

/**
 * Phase 7 Strict Types & Flow Options
 */
interface AuthSig {
    id: string;
    response: { authenticatorData: string; clientDataJSON: string; signature: string; userHandle: string | null; };
    payload: { action: string; itemId: string; quantity: number; amount: number; timestamp: number; nonce: string; };
}

interface StepUpAuthResult {
    id: string;
    response: { authenticatorData: ArrayBuffer; clientDataJSON: ArrayBuffer; signature: ArrayBuffer; userHandle?: ArrayBuffer | null; };
}

interface UseStorePurchaseProps {
    isAuthenticated: boolean;
    isWalletConnectedAndMatching: boolean;
    authUserPublicKey: string | undefined;
    wallet: { publicKey: PublicKey | null } | null;
    sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>;
    connection: Connection;
    adapterPublicKey: PublicKey | null;
    isWalletMismatch: boolean;
    isMobile: boolean;
    bobyUsdPrice: number | null;
    onPurchaseSuccess: (() => Promise<void>) | undefined;
}

interface PurchaseContext extends UseStorePurchaseProps {
    toast: ReturnType<typeof useToast>['toast'];
    apiFetch: ReturnType<typeof useApiFetch>['apiFetch'];
    setProgress: (p: PurchaseProgress) => void;
    setIsLoading: (id: string | null) => void;
    maxRetries: number;
}

interface FlowOps {
    it: StoreItemDefinition;
    qty: number;
    amt: number;
    auth: AuthSig | undefined;
    r: number;
}

/**
 * Helpers moved outside the hook to satisfy line-count limits
 */
const performStepUpAuth = async (ctx: PurchaseContext, item: StoreItemDefinition, qty: number, amt: number): Promise<AuthSig | undefined> => {
    if (!('PublicKeyCredential' in window)) return undefined;
    ctx.toast({ title: 'Auth', description: 'Passkey verification.' });
    const pl = { action: 'PURCHASE_ITEM', itemId: item.id, quantity: qty, amount: amt, timestamp: Date.now(), nonce: Math.random().toString(36).substring(2) };
    const res = await WebAuthnTransactionSigner.signTransaction(pl) as StepUpAuthResult | null;
    if (!res) throw new Error('Auth failed.');
    return {
        id: res.id,
        response: {
            authenticatorData: uint8ArrayToBase64url(new Uint8Array(res.response.authenticatorData)),
            clientDataJSON: uint8ArrayToBase64url(new Uint8Array(res.response.clientDataJSON)),
            signature: uint8ArrayToBase64url(new Uint8Array(res.response.signature)),
            userHandle: res.response.userHandle ? uint8ArrayToBase64url(new Uint8Array(res.response.userHandle)) : null
        },
        payload: pl
    };
};

const handleFailure = (ctx: PurchaseContext, e: unknown, sig: string | undefined, retry: () => void): void => {
    const msg = e instanceof Error ? e.message : 'Failed.';
    if ((msg.includes('Timeout') || msg.includes('rejected')) && sig === undefined) {
        ctx.toast({ title: 'Retrying...' });
        setTimeout(() => { retry(); }, 2000);
        return;
    }
    const state: PurchaseProgress = { phase: 'error', message: 'Failed', error: msg };
    if (sig) { state.signature = sig; state.explorerUrl = solanaPaymentService.getExplorerUrl(sig); }
    ctx.setProgress(state);
    ctx.toast({ title: 'Error', description: msg, variant: 'destructive' });
};

const runFlow = async (ctx: PurchaseContext, ops: FlowOps): Promise<void> => {
    let sig: string | undefined;
    const { it, qty, amt, auth, r } = ops;
    try {
        ctx.setProgress({ phase: 'preparing', message: '...' });
        if (!ctx.adapterPublicKey) throw new Error("No wallet.");
        const tx = await buildBobyPurchaseTransaction(ctx.connection, ctx.adapterPublicKey, amt);
        ctx.setProgress({ phase: 'awaiting_signature', message: 'Sign...' });
        sig = await Promise.race([ctx.sendTransaction(tx, ctx.connection), new Promise<never>((_, rj) => setTimeout(() => { rj(new Error('Timeout')); }, ctx.isMobile ? 90000 : 60000))]);
        ctx.setProgress({ phase: 'confirming', message: '...', signature: sig, explorerUrl: solanaPaymentService.getExplorerUrl(sig) });
        if (!(await pollTransactionConfirmation(ctx.connection, sig))) throw new Error('Timeout.');
        ctx.setProgress({ phase: 'verifying', message: '...' });
        const { ok, data } = await verifyPurchaseWithBackend(ctx.apiFetch, { itemId: it.id, quantity: qty, transactionSignature: sig, transactionAuthSignature: auth }, ctx.isMobile);
        if (ok) {
            ctx.setProgress({ phase: 'complete', message: 'Success!', signature: sig });
            ctx.toast({ title: 'Success' });
            if (ctx.onPurchaseSuccess) await ctx.onPurchaseSuccess();
        } else if (data.code === 'TRANSACTION_NOT_FOUND' && r < ctx.maxRetries) {
            setTimeout(() => { runFlow(ctx, { ...ops, r: r + 1 }); }, 8000);
        } else throw new Error(data.error || 'Server error.');
    } catch (e) { handleFailure(ctx, e, sig, () => { runFlow(ctx, { ...ops, r: r + 1 }); }); }
};

/**
 * useStorePurchase - Manages Solana item purchases with ultimate line-count compliance
 */
export const useStorePurchase = (props: UseStorePurchaseProps) => {
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [purchaseProgress, setPurchaseProgress] = useState<PurchaseProgress>({ phase: 'idle', message: '' });
    const { toast } = useToast();
    const { apiFetch } = useApiFetch();

    const handlePurchase = useCallback(async (it: StoreItemDefinition, qty: number): Promise<void> => {
        const ctx: PurchaseContext = { 
            ...props, toast, apiFetch, 
            setProgress: setPurchaseProgress, setIsLoading, 
            maxRetries: props.isMobile ? 2 : 1 
        };
        if (!ctx.isAuthenticated || !ctx.isWalletConnectedAndMatching || !ctx.wallet || ctx.isWalletMismatch || !ctx.bobyUsdPrice || ctx.bobyUsdPrice <= 0) {
            toast({ title: 'Error', variant: 'destructive' });
            return;
        }
        const amt = (it.price * qty) / ctx.bobyUsdPrice;
        setIsLoading(it.id);
        try {
            const auth = amt > 50000 ? await performStepUpAuth(ctx, it, qty, amt) : undefined;
            await runFlow(ctx, { it, qty, amt, auth, r: 0 });
        } catch (e) { logger.error(e instanceof Error ? e.message : String(e)); } finally { setIsLoading(null); }
    }, [props, toast, apiFetch]);

    return { handlePurchase, isLoading, purchaseProgress, setPurchaseProgress };
};

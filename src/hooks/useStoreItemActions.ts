'use client';

import { useToast } from '@/hooks/use-toast';
import type { StoreItemFormData } from '@/hooks/useAdminItems';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { createSignedAdminHeaders } from '@/utils/frontend-auth';
import type { PublicKey } from '@solana/web3.js';

type ToastFunction = ReturnType<typeof useToast>['toast'];
type SignMessageFunction = (message: Uint8Array) => Promise<Uint8Array>;

function validateItem(formData: StoreItemFormData, toast: ToastFunction): boolean {
  if (!formData.name || !formData.description || !formData.image) {
    toast({
      title: 'Validation Error',
      description: 'Please fill in all required fields',
      variant: 'destructive',
    });
    return false;
  }
  return true;
}

async function getSignedHeaders(
  signMessage: SignMessageFunction | undefined,
  walletPublicKey: PublicKey | null,
  formData: StoreItemFormData,
  toast: ToastFunction
): Promise<HeadersInit | null> {
  if (!signMessage || !walletPublicKey) {
    toast({
      title: 'Wallet Error',
      description: 'Please connect your wallet to proceed.',
      variant: 'destructive',
    });
    return null;
  }

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  try {
    const signedHeaders = await createSignedAdminHeaders(
      signMessage,
      walletPublicKey.toBase58(),
      formData
    );
    return { ...headers, ...signedHeaders };
  } catch {
    toast({
      title: 'Signature Required',
      description: 'You must sign the transaction to proceed.',
      variant: 'destructive',
    });
    return null;
  }
}

interface RequestContext {
  url: string;
  method: string;
  headers: HeadersInit;
  body: string;
  toast: ToastFunction;
  isEdit: boolean;
}

async function sendItemRequest({
  url,
  method,
  headers,
  body,
  toast,
  isEdit,
}: RequestContext): Promise<boolean> {
  try {
    const response = await fetch(url, { method, headers, body });
    const data = await response.json();

    if (data.success) {
      toast({
        title: 'Success',
        description: `Item ${isEdit ? 'updated' : 'created'} successfully`,
      });
      return true;
    }
    
    toast({ title: 'Error', description: data.error || 'Failed to save item', variant: 'destructive' });
    return false;
  } catch {
    toast({ title: 'Error', description: 'Failed to save item', variant: 'destructive' });
    return false;
  }
}

export const useStoreItemActions = () => {
  const { toast } = useToast();
  const { signMessage, adapterPublicKey: walletPublicKey } = useSessionWallet();

  const handleSaveItem = async (
    formData: StoreItemFormData,
    editingItemId?: string
  ): Promise<boolean> => {
    if (!validateItem(formData, toast)) return false;

    const headers = await getSignedHeaders(signMessage, walletPublicKey, formData, toast);
    if (!headers) return false;

    const url = editingItemId ? `/api/admin/store-items/${editingItemId}` : '/api/admin/store-items';
    const method = editingItemId ? 'PUT' : 'POST';

    return sendItemRequest({
      url,
      method,
      headers,
      body: JSON.stringify(formData),
      toast,
      isEdit: !!editingItemId,
    });
  };

  const handleDeleteItem = async (itemId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/admin/store-items/${itemId}`, { method: 'DELETE' });
      const data = await response.json();

      if (data.success) {
        toast({ title: 'Success', description: 'Item deleted successfully' });
        return true;
      } 
      
      toast({ title: 'Error', description: data.error || 'Failed to delete item', variant: 'destructive' });
      return false;
    } catch {
      toast({ title: 'Error', description: 'Failed to delete item', variant: 'destructive' });
      return false;
    }
  };

  return { handleSaveItem, handleDeleteItem };
};

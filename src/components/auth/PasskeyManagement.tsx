'use client';

import { uint8ArrayToBase64url, safeBufferFromBase64url } from '@/utils/base64';

import React, { useState, useEffect } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Shield, Smartphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApiFetch } from '@/utils/api';
import { logger } from '@/utils/logger';

interface Passkey {
    id: string;
    credentialId: string;
    description?: string;
    deviceBrand?: string;
    aaguid?: string;
    createdAt: string;
    lastUsedAt: string;
    transports?: string[];
}

interface PasskeyManagementProps {
    onPasskeyRegistered?: () => void;
}

export const PasskeyManagement: React.FC<PasskeyManagementProps> = ({ onPasskeyRegistered }) => {
    const { isAuthenticated, user } = useAuthContext();
    const { toast } = useToast();
    const [passkeys, setPasskeys] = useState<Passkey[]>([]);
    const [loading, setLoading] = useState(false);
    const [registering, setRegistering] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [description, setDescription] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const { apiFetch } = useApiFetch();

    const fetchPasskeys = async () => {
        if (!isAuthenticated) return;

        try {
            setLoading(true);
            const response = await apiFetch('/api/auth/webauthn/manage', {
                credentials: 'include',
            });

            if (response.ok) {
                const data = await response.json();
                setPasskeys(data.passkeys || []);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Failed to load passkeys.',
                });
            }
        } catch (error) {
            logger.error('Error fetching passkeys:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to load passkeys.',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            fetchPasskeys();
        }
    }, [isAuthenticated]);

    const { registerPasskey: registerPasskeyHook } = useAuthContext();

    const registerNewPasskey = async () => {
        if (!description.trim()) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Please enter a description for the passkey.',
            });
            return;
        }

        try {
            setRegistering(true);
            const success = await registerPasskeyHook(description.trim());

            if (success) {
                setDescription('');
                setIsDialogOpen(false);
                fetchPasskeys();
                onPasskeyRegistered?.();
            }
        } catch (error: any) {
            logger.error('Error registering passkey:', error);
        } finally {
            setRegistering(false);
        }
    };

    const deletePasskey = async (credentialId: string) => {
        if (passkeys.length <= 1) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Cannot delete the last passkey. Please set up another passkey first.',
            });
            return;
        }

        try {
            setDeleting(credentialId);
            const response = await apiFetch(`/api/auth/webauthn/manage/${credentialId}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (response.ok) {
                toast({
                    title: 'Success',
                    description: 'Passkey deleted successfully.',
                });
                fetchPasskeys();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete passkey');
            }
        } catch (error) {
            logger.error('Error deleting passkey:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to delete passkey.',
            });
        } finally {
            setDeleting(null);
        }
    };

    if (!isAuthenticated) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <p className="text-muted-foreground">Please log in to manage passkeys.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Passkey Management
                </CardTitle>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Passkey
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Register New Passkey</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="description">Device Description</Label>
                                <Input
                                    id="description"
                                    placeholder="e.g., My iPhone, Work Laptop"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                            <Button
                                onClick={registerNewPasskey}
                                disabled={registering}
                                className="w-full"
                            >
                                {registering ? 'Registering...' : 'Register Passkey'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <p>Loading passkeys...</p>
                ) : passkeys.length === 0 ? (
                    <p className="text-muted-foreground">No passkeys registered yet.</p>
                ) : (
                    <div className="space-y-4">
                        {passkeys.map((passkey) => (
                            <div
                                key={passkey.credentialId}
                                className="flex items-center justify-between p-4 border rounded-lg bg-slate-800 text-white"
                            >
                                <div className="flex items-center gap-3">
                                    <Smartphone className="h-5 w-5 text-slate-400" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-white truncate">
                                                {passkey.description || 'Unnamed Device'}
                                            </p>
                                            {passkey.deviceBrand && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                    {passkey.deviceBrand}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-xs text-slate-400">
                                                Added {new Date(passkey.createdAt).toLocaleDateString()}
                                            </p>
                                            <span className="text-slate-600">•</span>
                                            <p className="text-xs text-slate-400">
                                                {passkey.lastUsedAt ? `Last used ${new Date(passkey.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-slate-700 text-slate-300">
                                        ID: {passkey.credentialId.slice(0, 8)}...
                                    </Badge>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => deletePasskey(passkey.credentialId)}
                                        disabled={deleting === passkey.credentialId}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

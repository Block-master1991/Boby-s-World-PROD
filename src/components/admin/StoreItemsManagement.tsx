'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Package, RefreshCw, Upload, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { createSignedAdminHeaders } from '@/utils/frontend-auth';
import { AdminItemSkeleton } from './AdminItemSkeleton';
import { AdminStatSkeleton } from './AdminStatSkeleton';
import { apiFetch } from '@/utils/api';
import { logger } from '@/utils/logger';

interface StoreItem {
    id: string;
    name: string;
    description: string;
    price: number;
    image: string;
    dataAiHint: string;
    type: 'consumable' | 'permanent';
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export function StoreItemsManagement() {
    const [items, setItems] = useState<StoreItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [initializing, setInitializing] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [migratingImages, setMigratingImages] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [editingItem, setEditingItem] = useState<StoreItem | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const { toast } = useToast();
    const { signMessage, adapterPublicKey: walletPublicKey } = useSessionWallet();

    // Form state
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        description: '',
        price: 0.001,
        image: '',
        dataAiHint: '',
        type: 'consumable' as 'consumable' | 'permanent',
        rarity: 'common' as 'common' | 'rare' | 'epic' | 'legendary',
        isActive: true,
    });

    // Load items
    const loadItems = async () => {
        try {
            setLoading(true);
            const response = await apiFetch('/api/admin/store-items');
            const data = await response.json();

            if (data.success) {
                setItems(data.items);
            } else {
                toast({
                    title: 'Error',
                    description: 'Failed to load items',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            logger.error('Error loading items:', error);
            toast({
                title: 'Error',
                description: 'Failed to load items',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    // Initialize store items
    const initializeItems = async () => {
        try {
            setInitializing(true);
            const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, {});
            const response = await apiFetch('/api/admin/init-store-items', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...signedHeaders
                },
                body: JSON.stringify({})
            });

            const data = await response.json();

            if (data.success) {
                toast({
                    title: 'Success',
                    description: `Added ${data.stats.addedItems} new items`,
                });
                await loadItems();
            } else {
                toast({
                    title: 'Error',
                    description: data.error || 'Failed to initialize items',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            logger.error('Error initializing items:', error);
            toast({
                title: 'Error',
                description: 'Failed to initialize items',
                variant: 'destructive',
            });
        } finally {
            setInitializing(false);
        }
    };

    // Create or update item
    const saveItem = async () => {
        try {
            if (!formData.id || !formData.name || !formData.description || !formData.image) {
                toast({
                    title: 'Validation Error',
                    description: 'Please fill in all required fields (ID, Name, Description, Image)',
                    variant: 'destructive',
                });
                return;
            }

            const method = editingItem ? 'PUT' : 'POST';
            const url = editingItem
                ? `/api/admin/store-items/${editingItem.id}`
                : '/api/admin/store-items';

            const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, formData);

            const response = await apiFetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...signedHeaders
                },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (data.success) {
                // If we were editing and the image changed, delete the old image
                if (editingItem && editingItem.image !== formData.image && editingItem.image.startsWith('/items/')) {
                    const oldFilename = editingItem.image.replace('/items/', '');
                    try {
                        const delSignedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, { filename: oldFilename });
                        await apiFetch(`/api/admin/upload-image?filename=${oldFilename}`, {
                            method: 'DELETE',
                            headers: {
                                'Content-Type': 'application/json',
                                ...delSignedHeaders
                            },
                            body: JSON.stringify({ filename: oldFilename })
                        });
                        logger.log(`Deleted old image: ${oldFilename}`);
                    } catch (e) {
                        logger.error('Failed to delete old image file during update', e);
                    }
                }

                toast({
                    title: 'Success',
                    description: `Item ${editingItem ? 'updated' : 'created'} successfully`,
                });

                setIsDialogOpen(false);
                resetForm();
                await loadItems();
            } else {
                toast({
                    title: 'Error',
                    description: data.error || 'Failed to save item',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            logger.error('Error saving item:', error);
            toast({
                title: 'Error',
                description: 'Failed to save item',
                variant: 'destructive',
            });
        }
    };

    // Delete item
    const deleteItem = async (item: StoreItem) => {
        try {
            const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, { id: item.id });
            const response = await apiFetch(`/api/admin/store-items/${item.id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    ...signedHeaders
                },
                body: JSON.stringify({ id: item.id }) // Add body for signature
            });

            const data = await response.json();

            if (data.success) {
                // Try to delete the image if it's in /items/
                if (item.image && item.image.startsWith('/items/')) {
                    const filename = item.image.replace('/items/', '');
                    try {
                        const imgSignedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, { filename });
                        await apiFetch(`/api/admin/upload-image?filename=${filename}`, {
                            method: 'DELETE',
                            headers: {
                                'Content-Type': 'application/json',
                                ...imgSignedHeaders
                            },
                            body: JSON.stringify({ filename }) // Add body for signature
                        });
                        logger.log(`Deleted associated image file: ${filename}`);
                    } catch (e) {
                        logger.error('Failed to delete associated image file', e);
                    }
                }

                toast({
                    title: 'Success',
                    description: 'Item deleted successfully',
                });
                await loadItems();
            } else {
                toast({
                    title: 'Error',
                    description: data.error || 'Failed to delete item',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            logger.error('Error deleting item:', error);
            toast({
                title: 'Error',
                description: 'Failed to delete item',
                variant: 'destructive',
            });
        }
    };

    // Reset form
    const resetForm = () => {
        setFormData({
            id: '',
            name: '',
            description: '',
            price: 0.001,
            image: '',
            dataAiHint: '',
            type: 'consumable',
            rarity: 'common',
            isActive: true,
        });
        setEditingItem(null);
    };

    // Handle Image Upload
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploading(true);
            const uploadFormData = new FormData();
            uploadFormData.append('file', file);

            const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, { filename: file.name });
            // Remove Content-Type so the browser sets the correct multipart boundary for FormData
            const { 'Content-Type': _, ...headers } = signedHeaders as any;

            const response = await apiFetch('/api/admin/upload-image', {
                method: 'POST',
                headers,
                body: uploadFormData
            });

            const data = await response.json();
            if (data.success) {
                setFormData(prev => ({ ...prev, image: data.url }));
                toast({ title: 'Success', description: 'Image uploaded successfully' });
            } else {
                toast({ title: 'Upload Failed', description: data.error, variant: 'destructive' });
            }
        } catch (error) {
            logger.error('Upload error:', error);
            toast({ title: 'Error', description: 'Failed to upload image', variant: 'destructive' });
        } finally {
            setUploading(false);
        }
    };

    // Run inventory migration
    const runMigration = async () => {
        if (!confirm('Are you sure? This converts all inventories. BACKUP FIRST!')) {
            return;
        }

        try {
            setMigrating(true);
            const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, {});
            const response = await apiFetch('/api/admin/migrate-inventory', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...signedHeaders
                },
                body: JSON.stringify({})
            });

            const data = await response.json();
            if (data.success) {
                toast({ title: 'Migration Completed', description: 'Inventory migration completed successfully' });
            } else {
                toast({ title: 'Migration Failed', description: data.error || 'Migration failed', variant: 'destructive' });
            }
        } catch (error) {
            logger.error('Migration error:', error);
            toast({ title: 'Migration Error', description: 'Failed to run migration', variant: 'destructive' });
        } finally {
            setMigrating(false);
        }
    };

    // Run image migration
    const runImageMigration = async () => {
        if (!confirm('Are you sure you want to migrate existing item images to /public/items/? This will update all paths in Firestore.')) {
            return;
        }

        try {
            setMigratingImages(true);
            const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, {});
            const response = await apiFetch(`/api/admin/migrate-images`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...signedHeaders
                },
                body: JSON.stringify({})
            });

            const data = await response.json();
            if (data.success) {
                toast({ title: 'Migration Completed', description: data.message });
                await loadItems();
            } else {
                toast({ title: 'Migration Failed', description: data.error, variant: 'destructive' });
            }
        } catch (error) {
            logger.error('Image migration error:', error);
            toast({ title: 'Error', description: 'Failed to run image migration', variant: 'destructive' });
        } finally {
            setMigratingImages(false);
        }
    };

    // Open edit dialog
    const openEditDialog = (item: StoreItem) => {
        setFormData({
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            image: item.image,
            dataAiHint: item.dataAiHint,
            type: item.type,
            rarity: item.rarity,
            isActive: item.isActive,
        });
        setEditingItem(item);
        setIsDialogOpen(true);
    };

    useEffect(() => {
        loadItems();
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
                        <Package className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">Store Items</h2>
                        <p className="text-sm text-muted-foreground">Manage store items, prices, and availability</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button onClick={loadItems} disabled={loading} variant="outline" size="sm">
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button onClick={initializeItems} disabled={initializing} variant="outline" size="sm">
                        <RefreshCw className={`h-4 w-4 mr-2 ${initializing ? 'animate-spin' : ''}`} />
                        Initialize
                    </Button>

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={resetForm} size="sm">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Item
                            </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>{editingItem ? 'Edit Item' : 'Add New Item'}</DialogTitle>
                            </DialogHeader>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="id">ID *</Label>
                                    <Input
                                        id="id"
                                        value={formData.id}
                                        onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                                        placeholder="unique-id (e.g. protection_bottle)"
                                        disabled={!!editingItem}
                                    />
                                    <p className="text-[10px] text-muted-foreground">Fixed ID used in game logic</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="name">Name *</Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Item name"
                                    />
                                </div>

                                <div className="col-span-2 space-y-2">
                                    <Label htmlFor="description">Description *</Label>
                                    <Textarea
                                        id="description"
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Item description"
                                        rows={2}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="price">Price (USD) *</Label>
                                    <Input
                                        id="price"
                                        type="number"
                                        step="0.001"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                                        placeholder="0.001"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="image">Image *</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="image"
                                            value={formData.image}
                                            onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                                            placeholder="/items/image.png"
                                            className="flex-1"
                                        />
                                        <label className="cursor-pointer">
                                            <div className="bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2 rounded-md flex items-center gap-2 text-sm">
                                                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                                Upload
                                            </div>
                                            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="type">Type</Label>
                                    <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="consumable">Consumable</SelectItem>
                                            <SelectItem value="permanent">Permanent</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="rarity">Rarity</Label>
                                    <Select value={formData.rarity} onValueChange={(value: any) => setFormData({ ...formData, rarity: value })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="common">Common</SelectItem>
                                            <SelectItem value="rare">Rare</SelectItem>
                                            <SelectItem value="epic">Epic</SelectItem>
                                            <SelectItem value="legendary">Legendary</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center space-x-2 mt-4">
                                    <Switch
                                        id="isActive"
                                        checked={formData.isActive}
                                        onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                                    />
                                    <Label htmlFor="isActive">Active</Label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-6">
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                <Button onClick={saveItem}>{editingItem ? 'Update' : 'Create'} Item</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {loading ? (
                    <><AdminStatSkeleton /><AdminStatSkeleton /><AdminStatSkeleton /><AdminStatSkeleton /></>
                ) : (
                    <>
                        <Card className="relative overflow-hidden hover:shadow-md transition-all duration-200">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full"></div>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                                        <Package className="h-5 w-5 text-blue-500" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{items.length}</p>
                                        <p className="text-xs text-muted-foreground">Total Items</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="relative overflow-hidden hover:shadow-md transition-all duration-200">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-green-500/10 to-transparent rounded-bl-full"></div>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                                        <div className="h-3 w-3 bg-green-500 rounded-full"></div>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-green-500">{items.filter(i => i.isActive).length}</p>
                                        <p className="text-xs text-muted-foreground">Active</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="relative overflow-hidden hover:shadow-md transition-all duration-200">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-amber-500/10 to-transparent rounded-bl-full"></div>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                                        <div className="h-3 w-3 bg-amber-500 rounded-full"></div>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-amber-500">{items.filter(i => i.type === 'consumable').length}</p>
                                        <p className="text-xs text-muted-foreground">Consumable</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="relative overflow-hidden hover:shadow-md transition-all duration-200">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-full"></div>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                                        <div className="h-3 w-3 bg-purple-500 rounded-full"></div>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-purple-500">{items.filter(i => i.type === 'permanent').length}</p>
                                        <p className="text-xs text-muted-foreground">Permanent</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* Items Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => <AdminItemSkeleton key={i} />)}
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-12">
                    <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">No items found</h3>
                    <Button onClick={initializeItems} className="mt-4">Initialize Defaults</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((item) => (
                        <Card key={item.id} className="relative">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="relative h-12 w-12 border rounded-md overflow-hidden bg-muted">
                                            {item.image && (
                                                <Image src={item.image} alt={item.name} fill className="object-cover" />
                                            )}
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">{item.name}</CardTitle>
                                            <p className="text-xs text-muted-foreground font-mono">{item.id}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button size="sm" variant="outline"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete Item</AlertDialogTitle>
                                                    <AlertDialogDescription>Are you sure you want to delete "{item.name}"?</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => deleteItem(item)} className="bg-red-600">Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{item.description}</p>
                                <div className="flex items-center justify-between">
                                    <p className="font-bold text-lg">${item.price}</p>
                                    <div className="flex gap-1">
                                        <Badge variant="outline">{item.type}</Badge>
                                        <Badge variant={item.isActive ? 'default' : 'secondary'}>{item.isActive ? 'Active' : 'Hidden'}</Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

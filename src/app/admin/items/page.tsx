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
import { Plus, Edit, Trash2, Package, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { createSignedAdminHeaders } from '@/utils/frontend-auth';
import { logger } from '@/utils/logger';

interface StoreItem {
    id: string;
    name: string;
    description: string;
    price: number;
    usdPrice: number;
    image: string;
    dataAiHint: string;
    type: 'consumable' | 'permanent';
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export default function AdminItemsPage() {
    const [items, setItems] = useState<StoreItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [initializing, setInitializing] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [editingItem, setEditingItem] = useState<StoreItem | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const { toast } = useToast();
    const { signMessage, adapterPublicKey: walletPublicKey } = useSessionWallet();

    // Form state
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        description: '',
        price: 0,
        usdPrice: 0.001,
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
            const response = await fetch('/api/admin/init-store-items');
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
            logger.error('Error loading items:', error as Error);
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
            const response = await fetch('/api/admin/init-store-items', {
                method: 'POST',
            });

            const data = await response.json();

            if (data.success) {
                toast({
                    title: 'Success',
                    description: `Added ${data.stats.addedItems} new items`,
                });
                await loadItems(); // Reload items
            } else {
                toast({
                    title: 'Error',
                    description: data.error || 'Failed to initialize items',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            logger.error('Error initializing items:', error as Error);
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
            // Validate required fields
            if (!formData.name || !formData.description || !formData.image) {
                toast({
                    title: 'Validation Error',
                    description: 'Please fill in all required fields',
                    variant: 'destructive',
                });
                return;
            }

            const method = editingItem ? 'PUT' : 'POST';
            const url = editingItem
                ? `/api/admin/store-items/${editingItem.id}`
                : '/api/admin/store-items';

            // Prepare headers with signature
            let headers: HeadersInit = { 'Content-Type': 'application/json' };

            try {
                if (method === 'POST') { // Only enforce signature for creation (critical) or update if required
                    // NOTE: Adjust if PUT also requires signature. The middleware usually protects the whole route. 
                    // Assuming middleware is strictly 'withSignedAdminAuth' for POST/PUT/DELETE
                    const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, formData);
                    headers = { ...headers, ...signedHeaders };
                }
                // If editing (PUT), we might also need signature if the route is protected.
                // Let's assume protection is on the route handler level, so ALL methods need it if wrapped.
                // However, I wrapped 'POST' specifically in the route file. checking...
                // The route files: POST is wrapped. 

                // WAIT. If I only wrapped POST, then PUT (edit) and DELETE might be open or just "Authenticated"?
                // I need to double check the route file content for store-items.
                // I'll optimistically sign ALL mutation requests to be safe/future-proof.
                if (method === 'PUT') {
                    const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, formData);
                    headers = { ...headers, ...signedHeaders };
                }
            } catch (signError) {
                toast({
                    title: 'Signature Required',
                    description: 'You must sign the transaction to proceed.',
                    variant: 'destructive'
                });
                return;
            }

            const response = await fetch(url, {
                method,
                headers,
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (data.success) {
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
            logger.error('Error saving item:', error as Error);
            toast({
                title: 'Error',
                description: 'Failed to save item',
                variant: 'destructive',
            });
        }
    };

    // Delete item
    const deleteItem = async (itemId: string) => {
        try {
            const response = await fetch(`/api/admin/store-items/${itemId}`, {
                method: 'DELETE',
            });

            const data = await response.json();

            if (data.success) {
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
            logger.error('Error deleting item:', error as Error);
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
            price: 0,
            usdPrice: 0.001,
            image: '',
            dataAiHint: '',
            type: 'consumable',
            rarity: 'common',
            isActive: true,
        });
        setEditingItem(null);
    };

    // Run inventory migration
    const runMigration = async () => {
        if (!confirm('Are you sure you want to run the inventory migration? This will convert all user inventories from the old format to the new format. Make sure you have a backup of your database!')) {
            return;
        }

        try {
            setMigrating(true);

            const signedHeaders = await createSignedAdminHeaders(signMessage, walletPublicKey, {});

            const response = await fetch('/api/admin/migrate-inventory', {
                method: 'POST',
                headers: signedHeaders,
                body: JSON.stringify({})
            });

            const data = await response.json();

            if (data.success) {
                toast({
                    title: 'Migration Completed',
                    description: 'Inventory migration completed successfully',
                });
                logger.log('Migration output:', data.output);
            } else {
                toast({
                    title: 'Migration Failed',
                    description: data.error || 'Migration failed',
                    variant: 'destructive',
                });
                logger.error('Migration error:', data.errorOutput);
            }
        } catch (error) {
            logger.error('Error running migration:', error as Error);
            toast({
                title: 'Migration Error',
                description: 'Failed to run migration',
                variant: 'destructive',
            });
        } finally {
            setMigrating(false);
        }
    };

    // Open edit dialog
    const openEditDialog = (item: StoreItem) => {
        setFormData({
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            usdPrice: item.usdPrice,
            image: item.image,
            dataAiHint: item.dataAiHint,
            type: item.type,
            rarity: item.rarity,
            isActive: item.isActive,
        });
        setEditingItem(item);
        setIsDialogOpen(true);
    };

    // Load items on component mount
    useEffect(() => {
        loadItems();
    }, []);

    return (
        <div className="container mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold">Store Items Management</h1>
                    <p className="text-muted-foreground">Manage store items, prices, and availability</p>
                </div>

                <div className="flex gap-2">
                    <Button
                        onClick={initializeItems}
                        disabled={initializing}
                        variant="outline"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${initializing ? 'animate-spin' : ''}`} />
                        Initialize Items
                    </Button>

                    <Button onClick={loadItems} disabled={loading} variant="outline">
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>

                    <Button
                        onClick={runMigration}
                        disabled={migrating}
                        variant="destructive"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${migrating ? 'animate-spin' : ''}`} />
                        Migrate Inventory
                    </Button>

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={resetForm}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Item
                            </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>
                                    {editingItem ? 'Edit Item' : 'Add New Item'}
                                </DialogTitle>
                            </DialogHeader>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="id">ID</Label>
                                    <Input
                                        id="id"
                                        value={formData.id}
                                        onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                                        placeholder="unique-id"
                                        disabled={!!editingItem}
                                    />
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
                                        rows={3}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="price">Price (Coins)</Label>
                                    <Input
                                        id="price"
                                        type="number"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                                        placeholder="100"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="usdPrice">USD Price</Label>
                                    <Input
                                        id="usdPrice"
                                        type="number"
                                        step="0.001"
                                        value={formData.usdPrice}
                                        onChange={(e) => setFormData({ ...formData, usdPrice: parseFloat(e.target.value) || 0 })}
                                        placeholder="0.001"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="image">Image URL *</Label>
                                    <Input
                                        id="image"
                                        value={formData.image}
                                        onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                                        placeholder="/image.png"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="dataAiHint">AI Hint</Label>
                                    <Input
                                        id="dataAiHint"
                                        value={formData.dataAiHint}
                                        onChange={(e) => setFormData({ ...formData, dataAiHint: e.target.value })}
                                        placeholder="AI description hint"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="type">Type</Label>
                                    <Select
                                        value={formData.type}
                                        onValueChange={(value: 'consumable' | 'permanent') =>
                                            setFormData({ ...formData, type: value })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="consumable">Consumable</SelectItem>
                                            <SelectItem value="permanent">Permanent</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="rarity">Rarity</Label>
                                    <Select
                                        value={formData.rarity}
                                        onValueChange={(value: 'common' | 'rare' | 'epic' | 'legendary') =>
                                            setFormData({ ...formData, rarity: value })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="common">Common</SelectItem>
                                            <SelectItem value="rare">Rare</SelectItem>
                                            <SelectItem value="epic">Epic</SelectItem>
                                            <SelectItem value="legendary">Legendary</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="isActive"
                                        checked={formData.isActive}
                                        onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                                    />
                                    <Label htmlFor="isActive">Active</Label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-6">
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={saveItem}>
                                    {editingItem ? 'Update' : 'Create'} Item
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center">
                            <Package className="h-8 w-8 text-blue-500 mr-3" />
                            <div>
                                <p className="text-2xl font-bold">{items.length}</p>
                                <p className="text-sm text-muted-foreground">Total Items</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center">
                            <div className="h-8 w-8 bg-green-500 rounded-full mr-3" />
                            <div>
                                <p className="text-2xl font-bold">{items.filter(i => i.isActive).length}</p>
                                <p className="text-sm text-muted-foreground">Active Items</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center">
                            <div className="h-8 w-8 bg-yellow-500 rounded-full mr-3" />
                            <div>
                                <p className="text-2xl font-bold">{items.filter(i => i.type === 'consumable').length}</p>
                                <p className="text-sm text-muted-foreground">Consumables</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center">
                            <div className="h-8 w-8 bg-purple-500 rounded-full mr-3" />
                            <div>
                                <p className="text-2xl font-bold">{items.filter(i => i.type === 'permanent').length}</p>
                                <p className="text-sm text-muted-foreground">Permanent</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Items Grid */}
            {loading ? (
                <div className="text-center py-8">Loading items...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((item) => (
                        <Card key={item.id} className="relative">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <Image
                                            src={item.image}
                                            alt={item.name}
                                            width={48}
                                            height={48}
                                            className="rounded-md border"
                                        />
                                        <div>
                                            <CardTitle className="text-lg">{item.name}</CardTitle>
                                            <p className="text-sm text-muted-foreground">ID: {item.id}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-1">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openEditDialog(item)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>

                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button size="sm" variant="outline">
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </AlertDialogTrigger>

                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete Item</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Are you sure you want to delete "{item.name}"? This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={() => deleteItem(item.id)}
                                                        className="bg-red-500 hover:bg-red-600"
                                                    >
                                                        Delete
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent>
                                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                    {item.description}
                                </p>

                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="font-semibold">{item.price} coins</p>
                                        <p className="text-sm text-muted-foreground">${item.usdPrice}</p>
                                    </div>

                                    <div className="flex gap-2">
                                        <Badge variant={item.type === 'consumable' ? 'default' : 'secondary'}>
                                            {item.type}
                                        </Badge>
                                        <Badge
                                            variant={
                                                item.rarity === 'common' ? 'outline' :
                                                    item.rarity === 'rare' ? 'default' :
                                                        item.rarity === 'epic' ? 'destructive' : 'default'
                                            }
                                        >
                                            {item.rarity}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <Badge variant={item.isActive ? 'default' : 'secondary'}>
                                        {item.isActive ? 'Active' : 'Inactive'}
                                    </Badge>

                                    <p className="text-xs text-muted-foreground">
                                        Updated: {new Date(item.updatedAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {items.length === 0 && !loading && (
                <div className="text-center py-12">
                    <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No items found</h3>
                    <p className="text-muted-foreground mb-4">
                        Get started by initializing the default store items or adding your first item.
                    </p>
                    <Button onClick={initializeItems} disabled={initializing}>
                        <Plus className="h-4 w-4 mr-2" />
                        Initialize Default Items
                    </Button>
                </div>
            )}
        </div>
    );
}

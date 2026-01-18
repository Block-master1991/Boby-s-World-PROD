'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { StoreItemFormData } from '@/hooks/useStoreItemsManagement';
import { Loader2, Upload } from 'lucide-react';
import React from 'react';

type ItemType = 'consumable' | 'permanent';
type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';

interface FormFieldProps {
    id: string; label: string; children: React.ReactNode; hint?: string; fullWidth?: boolean;
}

const FormField: React.FC<FormFieldProps> = ({ id, label, children, hint, fullWidth }) => (
    <div className={fullWidth ? "col-span-2 space-y-2" : "space-y-2"}>
        <Label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label} *</Label>
        {children}
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
);

const SelectField = <T extends string>({ label, value, onValueChange, options }: { label: string, value: T, onValueChange: (v: T) => void, options: T[] }) => (
    <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</Label>
        <Select value={value} onValueChange={(v) => onValueChange(v as T)}>
            <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>
                {options.map(o => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
            </SelectContent>
        </Select>
    </div>
);

export const StoreItemForm: React.FC<{
    formData: StoreItemFormData, setFormData: (d: StoreItemFormData) => void,
    isEditing: boolean, uploading: boolean, onImageUpload: (f: File) => void
}> = ({ formData: f, setFormData: s, isEditing: id, uploading: u, onImageUpload: oiu }) => (
    <div className="grid grid-cols-2 gap-6 py-2">
        <FormField id="id" label="ID" hint="Fixed ID used in game logic">
            <Input id="id" value={f.id} onChange={(e) => s({ ...f, id: e.target.value })} disabled={id} className="font-mono text-sm" />
        </FormField>
        <FormField id="name" label="Name">
            <Input id="name" value={f.name} onChange={(e) => s({ ...f, name: e.target.value })} />
        </FormField>
        <FormField id="description" label="Description" fullWidth>
            <Textarea id="description" value={f.description} onChange={(e) => s({ ...f, description: e.target.value })} rows={2} />
        </FormField>
        <FormField id="price" label="Price (USD)">
            <Input id="price" type="number" step="0.001" value={f.price} onChange={(e) => s({ ...f, price: parseFloat(e.target.value) || 0 })} />
        </FormField>
        <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Image *</Label>
            <div className="flex gap-2">
                <Input value={f.image} onChange={(e) => s({ ...f, image: e.target.value })} className="flex-1 text-xs font-mono" />
                <label className="cursor-pointer shrink-0">
                    <div className="bg-secondary h-10 px-3 rounded-md flex items-center gap-2 text-xs font-bold">
                        {u ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
                    </div>
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && oiu(e.target.files[0])} disabled={u} />
                </label>
            </div>
        </div>
        <SelectField<ItemType> label="Type" value={f.type} onValueChange={(v) => s({ ...f, type: v })} options={['consumable', 'permanent']} />
        <SelectField<ItemRarity> label="Rarity" value={f.rarity} onValueChange={(v) => s({ ...f, rarity: v })} options={['common', 'rare', 'epic', 'legendary']} />
        <div className="flex items-center space-x-3 bg-muted/30 p-3 rounded-lg border border-muted/50 mt-1">
            <Switch id="isActive" checked={f.isActive} onCheckedChange={(c) => s({ ...f, isActive: c })} />
            <div><Label htmlFor="isActive" className="text-sm font-bold">Visible in Store</Label></div>
        </div>
    </div>
);

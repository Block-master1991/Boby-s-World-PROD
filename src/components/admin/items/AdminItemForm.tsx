'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { StoreItemFormData } from '@/hooks/useAdminItems';

interface FormProps {
  formData: StoreItemFormData;
  setFormData: (data: StoreItemFormData) => void;
  isEditing: boolean;
}

function BasicInfoFields({ formData, setFormData, isEditing }: FormProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="id">ID</Label>
        <Input
          id="id"
          value={formData.id}
          onChange={(e) => setFormData({ ...formData, id: e.target.value })}
          placeholder="unique-id"
          disabled={isEditing}
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
    </>
  );
}

function PricingFields({ formData, setFormData }: Omit<FormProps, 'isEditing'>) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="price">Price (Coins)</Label>
        <Input
          id="price"
          type="number"
          value={formData.price}
          onChange={(e) =>
            setFormData({ ...formData, price: parseInt(e.target.value) || 0 })
          }
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
          onChange={(e) =>
            setFormData({ ...formData, usdPrice: parseFloat(e.target.value) || 0 })
          }
          placeholder="0.001"
        />
      </div>
    </>
  );
}

function ItemMediaFields({ formData, setFormData }: Omit<FormProps, 'isEditing'>) {
  return (
    <>
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
    </>
  );
}

function ItemClassificationFields({ formData, setFormData }: Omit<FormProps, 'isEditing'>) {
  return (
    <>
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
    </>
  );
}

function ItemStatusField({ formData, setFormData }: Omit<FormProps, 'isEditing'>) {
  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="isActive"
        checked={formData.isActive}
        onCheckedChange={(checked) =>
          setFormData({ ...formData, isActive: checked })
        }
      />
      <Label htmlFor="isActive">Active</Label>
    </div>
  );
}

interface AdminItemFormProps {
  formData: StoreItemFormData;
  setFormData: (data: StoreItemFormData) => void;
  onCancel: () => void;
  onSave: () => void;
  isEditing: boolean;
}

export function AdminItemForm({
  formData,
  setFormData,
  onCancel,
  onSave,
  isEditing,
}: AdminItemFormProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <BasicInfoFields
          formData={formData}
          setFormData={setFormData}
          isEditing={isEditing}
        />
        <PricingFields formData={formData} setFormData={setFormData} />
        <ItemMediaFields formData={formData} setFormData={setFormData} />
        <ItemClassificationFields formData={formData} setFormData={setFormData} />
        <ItemStatusField formData={formData} setFormData={setFormData} />
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave}>{isEditing ? 'Update' : 'Create'} Item</Button>
      </div>
    </>
  );
}

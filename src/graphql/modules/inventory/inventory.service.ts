import { getActiveStoreItems, getAllStoreItems, getStoreItemById } from '@/lib/server-items-read';
import type { InventoryItem } from '@/types/database';
import { UseItemSchema } from '../../validation/schemas';
import { InventoryRepository } from './inventory.repository';

export interface InventoryCounts {
  protectionBottleCount: number;
  guardianShieldCount: number;
  speedyPawsTreatCount: number;
  coinMagnetTreatCount: number;
  items: InventoryItem[];
}

export class InventoryService {
  // Store management
  static getStoreItems() {
    return getAllStoreItems();
  }

  static getActiveStoreItems() {
    return getActiveStoreItems();
  }

  static getStoreItem(id: string) {
    return getStoreItemById(id);
  }

  // Removed static cache and TTL - prioritizing data consistency

  static async getUserInventoryCounts(userId: string) {
    // Direct repository access ensures fresh data
    const inventory = await InventoryRepository.getUserInventory(userId);
    
    const counts = {
      protectionBottleCount: 0,
      guardianShieldCount: 0,
      speedyPawsTreatCount: 0,
      coinMagnetTreatCount: 0,
    };

    const itemIdMap: Record<string, keyof typeof counts> = {
      '1': 'protectionBottleCount',
      '2': 'guardianShieldCount',
      '3': 'speedyPawsTreatCount',
      '4': 'coinMagnetTreatCount',
    };

    const mappedItems = inventory.map((item) => {
      const sanitizedItem = {
        id: String(item.id || `item-${Math.random()}`),
        itemType: item.type ? String(item.type) : null,
        name: String(item.name || 'Unknown Item'),
        rarity: String(item.rarity || 'Common'),
        image: item.image ? String(item.image) : null,
        quantity: Math.floor(Number(item.quantity) || 1)
      };

      const key = itemIdMap[String(sanitizedItem.id)];
      if (key) {
        counts[key] += sanitizedItem.quantity;
      }

      return sanitizedItem;
    });

    return { ...counts, items: mappedItems };
  }

  static async useItem(userId: string, itemId: string, quantityToUse: number) {
    // Validate input
    UseItemSchema.parse({ userId, itemId, quantity: quantityToUse });

    const inventory = await InventoryRepository.getUserInventory(userId);
    
    // Logic remains same ...
    const matchingItems = inventory.filter((item) => String(item.id) === String(itemId));
    const totalAvailable = matchingItems.reduce((sum: number, item) => sum + (item.quantity || 1), 0);

    if (totalAvailable < quantityToUse) {
      throw new Error(`Insufficient quantity. Have ${totalAvailable}, need ${quantityToUse}`);
    }

    let remainingToRemove = quantityToUse;
    const newInventory: InventoryItem[] = [];

    for (const item of inventory) {
      if (String(item.id) === String(itemId) && remainingToRemove > 0) {
        const itemQty = item.quantity || 1;
        if (itemQty <= remainingToRemove) {
          remainingToRemove -= itemQty;
        } else {
          newInventory.push({ ...item, quantity: itemQty - remainingToRemove });
          remainingToRemove = 0;
        }
      } else {
        newInventory.push(item);
      }
    }

    await InventoryRepository.updateInventory(userId, newInventory);
    
    return totalAvailable - quantityToUse;
  }
}

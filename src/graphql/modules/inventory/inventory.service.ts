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

    inventory.forEach((item) => {
      const key = itemIdMap[String(item.id)];
      if (key) {
        counts[key] += item.quantity || 1;
      }
    });

    return { ...counts, items: inventory };
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

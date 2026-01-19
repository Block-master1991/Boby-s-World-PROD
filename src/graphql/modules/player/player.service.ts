import type { DocumentData } from 'firebase-admin/firestore';
import { AddCoinsSchema } from '../../validation/schemas';
import { PlayerRepository } from './player.repository';

export interface PlayerData {
  id: string;
  publicKey: string;
  level: number;
  coins: number;
  experience: number;
  inventory: unknown[];
  createdAt: string;
  lastLogin?: string;
}

import type { GraphQLContext } from '../../context';

// ... imports

export class PlayerService {
  // Removed static cache and TTL in favor of DataLoader

  private static sanitizeInventory(inventory: unknown[]): unknown[] {
    return (inventory as Record<string, unknown>[]).map(item => ({
      id: String(item['id'] || `item-${Math.random()}`),
      itemType: item['type'] ? String(item['type']) : null,
      name: String(item['name'] || 'Unknown Item'),
      rarity: String(item['rarity'] || 'Common'),
      image: item['image'] ? String(item['image']) : null,
      quantity: Math.floor(Number(item['quantity']) || 1)
    }));
  }

  private static formatTimestamps(player: DocumentData) {
    const { createdAt, lastLogin } = player;
    return {
      createdAt: createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      lastLogin: lastLogin?.toDate?.()?.toISOString(),
    };
  }

  private static formatPlayerData(player: DocumentData, userId: string): PlayerData {
    const stats = player['gameStats'] || {};
    const { createdAt, lastLogin } = this.formatTimestamps(player);

    return {
      id: player['id'] || userId,
      publicKey: player['publicKey'] || userId,
      level: Number(stats['level'] || 1),
      coins: Number(player['gameUSDTBalance'] ?? player['coins'] ?? 0),
      experience: Math.floor(stats['experience'] || player['experience'] || 0),
      inventory: this.sanitizeInventory(player['inventory'] || []),
      createdAt,
      lastLogin,
    };
  }

  static async getPlayerData(userId: string, context?: GraphQLContext) {
    // Use DataLoader if context and loader are available
    if (context?.loaders?.player) {
      const player = await context.loaders.player.load(userId);
      if (!player) return null;
      return this.formatPlayerData(player, userId);
    }

    // Fallback to direct repository call (legacy behavior)
    const player = await PlayerRepository.findById(userId);
    if (!player) return null;
    
    return this.formatPlayerData(player, userId);
  }

  static async addCoins(userId: string, amount: number) {
    // Validate input
    AddCoinsSchema.parse({ userId, amount });

    const player = await PlayerRepository.findById(userId);
    if (!player) throw new Error('Player not found');

    const currentBalance = Number(player['gameUSDTBalance']) || 0;
    const newBalance = currentBalance + amount;

    // Ensure we store reasonable values, but the resolver/formatter guarantees Int return
    await PlayerRepository.updateStats(userId, { gameUSDTBalance: newBalance });
    
    // DataLoader is request-scoped, so no global cache invalidation is needed.
    // Real-time updates via PubSub handle the client-side freshness.
    
    return newBalance;
  }
}

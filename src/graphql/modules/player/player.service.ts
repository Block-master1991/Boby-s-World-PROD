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

  private static formatPlayerData(player: DocumentData, userId: string) {
    // ... same implementation
    const {
      gameStats = {},
      createdAt,
      lastLogin,
      publicKey,
      gameUSDTBalance = 0,
      inventory = [],
      id = userId,
    } = player;

    return {
      id,
      publicKey: publicKey || userId,
      level: gameStats['level'] || 1,
      coins: gameUSDTBalance,
      experience: gameStats['experience'] || 0,
      inventory,
      createdAt: createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      lastLogin: lastLogin?.toDate?.()?.toISOString(),
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

    await PlayerRepository.updateStats(userId, { gameUSDTBalance: newBalance });
    
    // DataLoader is request-scoped, so no global cache invalidation is needed.
    // Real-time updates via PubSub handle the client-side freshness.
    
    return newBalance;
  }
}

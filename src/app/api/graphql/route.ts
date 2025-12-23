import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { JWTManager } from '@/lib/jwt-utils';
import { getClientIp } from '@/lib/request-utils';
import { rateLimit } from '@/lib/rate-limit';
import { validateTokenFromRequest } from '@/lib/auth-middleware';
import jwt from 'jsonwebtoken';

// GraphQL Type Definitions
const typeDefs = `
  type Query {
    health: String!
    user(id: ID!): User
    userInventory(userId: ID!): UserInventory
    gameWorld(chunkX: Int!, chunkZ: Int!, radius: Int): GameWorld
    marketData: MarketData
    userStats: UserStats
  }

  type Mutation {
    # Authentication mutations
    generateAuthNonce(publicKey: String!): AuthNonceResult!
    login(input: LoginInput!): LoginResult!

    # Game mutations
    updateUserProgress(userId: ID!, progressData: ProgressInput!): ProgressResult!
    purchaseItem(userId: ID!, itemId: ID!, quantity: Int!): PurchaseResult!
    saveGameSession(sessionData: GameSessionInput!): SessionResult!
    useConsumableItem(userId: ID!, itemId: String!, quantity: Int!): UseItemResult!

    # New GameUI mutations
    fetchPlayerData(userId: ID!): PlayerDataResult!
    addCoins(userId: ID!, amount: Int!): CoinResult!
    useItem(userId: ID!, itemId: String!): ItemResult!
    consumeProtectionBottle(userId: ID!): ItemResult!
    applyPenalty(userId: ID!, amount: Int!): PenaltyResult!
    withdrawUSDT(userId: ID!, amount: Float!): WithdrawalResult!
  }

  type Subscription {
    marketUpdates: MarketData!
    gameEvents(userId: ID!): GameEvent!
  }

  type User {
    id: ID!
    publicKey: String!
    username: String
    gameStats: GameStats
    inventory: [InventoryItem!]!
    createdAt: String!
    lastLogin: String
  }

  type UserInventory {
    protectionBottleCount: Int!
    guardianShieldCount: Int!
    speedyPawsTreatCount: Int!
    coinMagnetTreatCount: Int!
    items: [InventoryItem!]!
  }

  type GameStats {
    level: Int!
    coins: Int!
    experience: Int!
    achievements: [Achievement!]!
  }

  type Achievement {
    id: ID!
    name: String!
    description: String!
    unlockedAt: String!
    rarity: String!
  }

  type InventoryItem {
    id: ID!
    itemType: String!
    name: String!
    quantity: Int!
    rarity: String!
    image: String
  }

  type GameWorld {
    chunks: [WorldChunk!]!
  }

  type WorldChunk {
    x: Int!
    z: Int!
    terrainData: String
    entities: [WorldEntity!]!
  }

  type WorldEntity {
    id: ID!
    type: String!
    position: Position!
  }

  type Position {
    x: Float!
    y: Float!
    z: Float!
  }

  type MarketData {
    bobyPrice: Float!
    volume24h: Float!
    priceChange24h: Float!
    lastUpdated: String!
  }

  type UserStats {
    totalUsers: Int!
    onlineUsers: Int!
    offlineUsers: Int!
    activeGames: Int!
  }

  input ProgressInput {
    level: Int
    coins: Int
    experience: Int
    achievements: [ID!]
  }

  input GameSessionInput {
    userId: ID!
    sessionData: String!
    duration: Int!
  }

  type ProgressResult {
    success: Boolean!
    newLevel: Int
    earnedCoins: Int
    unlockedAchievements: [Achievement!]
  }

  type PurchaseResult {
    success: Boolean!
    remainingCoins: Int
    inventory: [InventoryItem!]
    error: String
  }

  type SessionResult {
    success: Boolean!
    sessionId: ID!
    savedAt: String!
  }

  type GameEvent {
    eventType: String!
    data: String!
    timestamp: String!
  }

  # Authentication types
  type AuthNonceResult {
    success: Boolean!
    nonce: String
    error: String
  }

  type LoginResult {
    success: Boolean!
    message: String!
    publicKey: String
    error: String
  }

  type UseItemResult {
    success: Boolean!
    message: String!
    remainingCount: Int
    error: String
  }

  input LoginInput {
    publicKey: String!
    signature: String!
    nonce: String!
  }

  # GameUI types
  type PlayerDataResult {
    success: Boolean!
    playerData: PlayerData
    error: String
  }

  type PlayerData {
    level: Int!
    coins: Int!
    experience: Int!
    inventory: [InventoryItem!]!
  }

  type CoinResult {
    success: Boolean!
    newBalance: Int!
    error: String
  }

  type PenaltyResult {
    success: Boolean!
    newBalance: Int!
    penaltyApplied: Int!
    error: String
  }

  type WithdrawalResult {
    success: Boolean!
    withdrawalId: ID!
    amount: Float!
    error: String
  }
`;

// GraphQL Resolvers
const resolvers = {
    Query: {
        health: () => 'OK',

        user: async (_: any, { id }: { id: string }, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id) {
                    throw new Error('Authentication required');
                }

                const userDoc = await db.collection('players').doc(id).get();
                if (!userDoc.exists) {
                    return null;
                }

                const userData = userDoc.data();
                return {
                    id: userDoc.id,
                    ...userData,
                    createdAt: userData?.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                    lastLogin: userData?.lastLogin?.toDate?.()?.toISOString(),
                };
            } catch (error) {
                console.error('[GraphQL] Error fetching user:', error);
                throw new Error('Failed to fetch user data');
            }
        },

        gameWorld: async (_: any, { chunkX, chunkZ, radius = 1 }: { chunkX: number, chunkZ: number, radius: number }, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Generate world data for the requested chunks
                const chunks = [];
                for (let x = chunkX - radius; x <= chunkX + radius; x++) {
                    for (let z = chunkZ - radius; z <= chunkZ + radius; z++) {
                        chunks.push({
                            x,
                            z,
                            terrainData: `terrain_${x}_${z}`,
                            entities: [
                                {
                                    id: `entity_${x}_${z}_1`,
                                    type: 'coin',
                                    position: { x: x * 32, y: 0, z: z * 32 }
                                }
                            ]
                        });
                    }
                }

                return { chunks };
            } catch (error) {
                console.error('[GraphQL] Error fetching game world:', error);
                throw new Error('Failed to fetch game world');
            }
        },

        marketData: async () => {
            try {
                // Fetch real Boby price from Jupiter API
                console.log('[GraphQL] Fetching market data from Jupiter API...');
                const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/boby-price-jup`, {
                    method: 'GET',
                });

                if (!response.ok) {
                    throw new Error(`Jupiter API returned ${response.status}`);
                }

                const jupiterData = await response.json();

                if (jupiterData.error) {
                    throw new Error(jupiterData.error);
                }

                // Return real market data with Jupiter price
                return {
                    bobyPrice: jupiterData.price,
                    volume24h: 0, // Jupiter API doesn't provide volume, set to 0 for now
                    priceChange24h: 0, // Jupiter API doesn't provide change, set to 0 for now
                    lastUpdated: new Date().toISOString(),
                };
            } catch (error) {
                console.error('[GraphQL] Error fetching market data from Jupiter:', error);
                // Fallback to mock data if Jupiter API fails
                return {
                    bobyPrice: 0.00001234,
                    volume24h: 1234567.89,
                    priceChange24h: 5.67,
                    lastUpdated: new Date().toISOString(),
                };
            }
        },

        userInventory: async (_: any, { userId }: { userId: string }, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id || context.user.id !== userId) {
                    throw new Error('Unauthorized');
                }

                const userDoc = await db.collection('players').doc(userId).get();
                if (!userDoc.exists) {
                    return {
                        protectionBottleCount: 0,
                        guardianShieldCount: 0,
                        speedyPawsTreatCount: 0,
                        coinMagnetTreatCount: 0,
                        items: [],
                    };
                }

                const userData = userDoc.data();
                const inventory = userData?.inventory || [];

                // Count items by type
                const counts = {
                    protectionBottleCount: 0,
                    guardianShieldCount: 0,
                    speedyPawsTreatCount: 0,
                    coinMagnetTreatCount: 0,
                };

                // Map item IDs to count properties
                const itemIdMap: { [key: string]: keyof typeof counts } = {
                    '1': 'protectionBottleCount',
                    '2': 'guardianShieldCount',
                    '3': 'speedyPawsTreatCount',
                    '4': 'coinMagnetTreatCount',
                };

                inventory.forEach((item: any) => {
                    const countKey = itemIdMap[item.id];
                    if (countKey) {
                        counts[countKey] += item.quantity || 1;
                    }
                });

                return {
                    ...counts,
                    items: inventory,
                };
            } catch (error) {
                console.error('[GraphQL] Error fetching user inventory:', error);
                throw new Error('Failed to fetch user inventory');
            }
        },

        userStats: async (_: any, args: any, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Get real user statistics from database
                const usersSnapshot = await db.collection('players').get();
                const totalUsers = usersSnapshot.size;

                // Get online users (users with recent activity - last 10 minutes)
                const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
                const recentUsersQuery = db.collection('players').where('lastLogin', '>', tenMinutesAgo);
                const recentUsersSnapshot = await recentUsersQuery.get();
                const onlineUsers = recentUsersSnapshot.size;

                const offlineUsers = totalUsers - onlineUsers;

                // Get active games (users who have played in the last hour)
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                const activeGamesQuery = db.collection('gameSessions').where('createdAt', '>', oneHourAgo);
                const activeGamesSnapshot = await activeGamesQuery.get();
                const activeGames = activeGamesSnapshot.size;

                return {
                    totalUsers,
                    onlineUsers,
                    offlineUsers,
                    activeGames,
                };
            } catch (error) {
                console.error('[GraphQL] Error fetching user stats:', error);
                // Return zeros instead of throwing to prevent UI breakage
                return {
                    totalUsers: 0,
                    onlineUsers: 0,
                    offlineUsers: 0,
                    activeGames: 0,
                };
            }
        },
    },

    Mutation: {
        generateAuthNonce: async (_: any, { publicKey }: { publicKey: string }) => {
            try {
                // Delegate to existing REST API
                const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/login?publicKey=${encodeURIComponent(publicKey)}`, {
                    method: 'GET',
                });

                if (response.ok) {
                    const data = await response.json();
                    return {
                        success: true,
                        nonce: data.nonce,
                    };
                } else {
                    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                    return {
                        success: false,
                        error: errorData.error || 'Failed to generate nonce',
                    };
                }
            } catch (error) {
                console.error('[GraphQL] Error generating auth nonce:', error);
                return {
                    success: false,
                    error: 'Internal server error',
                };
            }
        },

        login: async (_: any, { input }: { input: { publicKey: string, signature: string, nonce: string } }, context: any) => {
            try {
                // Delegate to existing REST API
                const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'user-agent': context?.request?.headers?.get('user-agent') || 'GraphQL-Client',
                        'x-forwarded-for': context?.request?.headers?.get('x-forwarded-for') || context?.request?.ip || '127.0.0.1',
                    },
                    body: JSON.stringify(input),
                });

                if (response.ok) {
                    const data = await response.json();
                    return {
                        success: true,
                        message: data.message || 'Login successful',
                        publicKey: data.publicKey,
                    };
                } else {
                    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                    return {
                        success: false,
                        error: errorData.error || 'Login failed',
                    };
                }
            } catch (error) {
                console.error('[GraphQL] Error during login:', error);
                return {
                    success: false,
                    error: 'Internal server error',
                };
            }
        },

        updateUserProgress: async (_: any, { userId, progressData }: any, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id || context.user.id !== userId) {
                    throw new Error('Unauthorized');
                }

                const userRef = db.collection('players').doc(userId);
                await userRef.update({
                    'gameStats.level': progressData.level || 1,
                    'gameStats.coins': progressData.coins || 0,
                    'gameStats.experience': progressData.experience || 0,
                    lastUpdated: new Date(),
                });

                return {
                    success: true,
                    newLevel: progressData.level,
                    earnedCoins: progressData.coins,
                    unlockedAchievements: [],
                };
            } catch (error) {
                console.error('[GraphQL] Error updating progress:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },

        purchaseItem: async (_: any, { userId, itemId, quantity }: any, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id || context.user.id !== userId) {
                    throw new Error('Unauthorized');
                }

                // Mock purchase logic
                const userRef = db.collection('players').doc(userId);
                const userDoc = await userRef.get();
                const userData = userDoc.data();

                if (!userData?.gameStats?.coins || userData.gameStats.coins < 100) {
                    throw new Error('Insufficient coins');
                }

                // Update inventory and coins
                await userRef.update({
                    'gameStats.coins': userData.gameStats.coins - 100,
                    'inventory': [
                        ...(userData.inventory || []),
                        {
                            id: itemId,
                            itemType: 'consumable',
                            name: 'Test Item',
                            quantity,
                            rarity: 'common',
                        }
                    ],
                    lastUpdated: new Date(),
                });

                return {
                    success: true,
                    remainingCoins: userData.gameStats.coins - 100,
                    inventory: [
                        ...(userData.inventory || []),
                        {
                            id: itemId,
                            itemType: 'consumable',
                            name: 'Test Item',
                            quantity,
                            rarity: 'common',
                        }
                    ],
                };
            } catch (error) {
                console.error('[GraphQL] Error purchasing item:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Purchase failed',
                };
            }
        },

        saveGameSession: async (_: any, { sessionData }: any, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id) {
                    throw new Error('Authentication required');
                }

                const sessionRef = db.collection('gameSessions').doc();
                await sessionRef.set({
                    userId: context.user.id,
                    sessionData: sessionData.sessionData,
                    duration: sessionData.duration,
                    createdAt: new Date(),
                });

                return {
                    success: true,
                    sessionId: sessionRef.id,
                    savedAt: new Date().toISOString(),
                };
            } catch (error) {
                console.error('[GraphQL] Error saving session:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to save session',
                };
            }
        },

        useConsumableItem: async (_: any, { userId, itemId, quantity }: any, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id || context.user.id !== userId) {
                    throw new Error('Unauthorized');
                }

                const userRef = db.collection('players').doc(userId);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    throw new Error('User not found');
                }

                const userData = userDoc.data();
                const inventory = userData?.inventory || [];

                // Find the item in inventory
                const itemIndex = inventory.findIndex((item: any) => item.id === itemId);

                if (itemIndex === -1) {
                    throw new Error('Item not found in inventory');
                }

                const item = inventory[itemIndex];

                if (item.quantity < quantity) {
                    throw new Error('Insufficient item quantity');
                }

                // Update inventory
                if (item.quantity === quantity) {
                    // Remove item completely
                    inventory.splice(itemIndex, 1);
                } else {
                    // Reduce quantity
                    item.quantity -= quantity;
                }

                await userRef.update({
                    inventory,
                    lastUpdated: new Date(),
                });

                return {
                    success: true,
                    message: `Used ${quantity} ${item.name}(s)`,
                    remainingCount: item.quantity - quantity,
                };
            } catch (error) {
                console.error('[GraphQL] Error using consumable item:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to use item',
                };
            }
        },

        // New GameUI mutations
        fetchPlayerData: async (_: any, { userId }: { userId: string }, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id || context.user.id !== userId) {
                    return {
                        success: false,
                        error: 'Unauthorized'
                    };
                }

                const userDoc = await db.collection('players').doc(userId).get();
                if (!userDoc.exists) {
                    return {
                        success: false,
                        error: 'User not found'
                    };
                }

                const userData = userDoc.data();

                return {
                    success: true,
                    playerData: {
                        level: userData?.gameStats?.level || 1,
                        coins: userData?.gameUSDTBalance || 0, // ✅ Fixed: use correct field name
                        experience: userData?.gameStats?.experience || 0,
                        inventory: userData?.inventory || [],
                    }
                };
            } catch (error) {
                console.error('[GraphQL] Error fetching player data:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to fetch player data'
                };
            }
        },

        addCoins: async (_: any, { userId, amount }: { userId: string, amount: number }, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id || context.user.id !== userId) {
                    return {
                        success: false,
                        error: 'Unauthorized'
                    };
                }

                const userRef = db.collection('players').doc(userId);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    return {
                        success: false,
                        error: 'User not found'
                    };
                }

                const userData = userDoc.data();
                const currentBalance = userData?.gameUSDTBalance || 0;
                const newBalance = currentBalance + amount;

                await userRef.update({
                    gameUSDTBalance: newBalance,
                    lastUpdated: new Date(),
                    lastInteraction: FieldValue.serverTimestamp()
                });

                return {
                    success: true,
                    newBalance
                };
            } catch (error) {
                console.error('[GraphQL] Error adding coins:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to add coins'
                };
            }
        },

        useItem: async (_: any, { userId, itemId }: { userId: string, itemId: string }, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id || context.user.id !== userId) {
                    return {
                        success: false,
                        error: 'Unauthorized'
                    };
                }

                const userRef = db.collection('players').doc(userId);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    return {
                        success: false,
                        error: 'User not found'
                    };
                }

                const userData = userDoc.data();
                const inventory = userData?.inventory || [];

                // Find and use the item
                const itemIndex = inventory.findIndex((item: any) => String(item.id) === String(itemId));

                if (itemIndex === -1) {
                    return {
                        success: false,
                        error: 'Item not found in inventory'
                    };
                }

                const item = inventory[itemIndex];
                const newInventory = [...inventory];

                if (item.quantity <= 1) {
                    // Remove item completely
                    newInventory.splice(itemIndex, 1);
                } else {
                    // Reduce quantity
                    newInventory[itemIndex] = {
                        ...item,
                        quantity: item.quantity - 1
                    };
                }

                await userRef.update({
                    inventory: newInventory,
                    lastUpdated: new Date(),
                    lastInteraction: FieldValue.serverTimestamp()
                });

                return {
                    success: true,
                    message: `Used ${item.name}`,
                    remainingCount: Math.max(0, item.quantity - 1)
                };
            } catch (error) {
                console.error('[GraphQL] Error using item:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to use item'
                };
            }
        },

        consumeProtectionBottle: async (_: any, { userId }: { userId: string }, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id || context.user.id !== userId) {
                    return {
                        success: false,
                        error: 'Unauthorized'
                    };
                }

                const userRef = db.collection('players').doc(userId);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    return {
                        success: false,
                        error: 'User not found'
                    };
                }

                const userData = userDoc.data();
                const inventory = userData?.inventory || [];

                // Find protection bottle (item ID 1)
                const bottleIndex = inventory.findIndex((item: any) => String(item.id) === '1');

                if (bottleIndex === -1) {
                    return {
                        success: false,
                        error: 'Protection bottle not found in inventory'
                    };
                }

                const bottle = inventory[bottleIndex];
                const newInventory = [...inventory];

                if (bottle.quantity <= 1) {
                    // Remove bottle completely
                    newInventory.splice(bottleIndex, 1);
                } else {
                    // Reduce quantity
                    newInventory[bottleIndex] = {
                        ...bottle,
                        quantity: bottle.quantity - 1
                    };
                }

                await userRef.update({
                    inventory: newInventory,
                    lastUpdated: new Date(),
                    lastInteraction: FieldValue.serverTimestamp()
                });

                return {
                    success: true,
                    message: 'Protection bottle consumed',
                    remainingCount: Math.max(0, bottle.quantity - 1)
                };
            } catch (error) {
                console.error('[GraphQL] Error consuming protection bottle:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to consume protection bottle'
                };
            }
        },

        applyPenalty: async (_: any, { userId, amount }: { userId: string, amount: number }, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id || context.user.id !== userId) {
                    return {
                        success: false,
                        error: 'Unauthorized'
                    };
                }

                const userRef = db.collection('players').doc(userId);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    return {
                        success: false,
                        error: 'User not found'
                    };
                }

                const userData = userDoc.data();
                const currentCoins = userData?.gameStats?.coins || 0;
                const newBalance = Math.max(0, currentCoins - amount);

                await userRef.update({
                    'gameStats.coins': newBalance,
                    lastUpdated: new Date(),
                    lastInteraction: FieldValue.serverTimestamp()
                });

                return {
                    success: true,
                    newBalance,
                    penaltyApplied: amount
                };
            } catch (error) {
                console.error('[GraphQL] Error applying penalty:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to apply penalty'
                };
            }
        },

        withdrawUSDT: async (_: any, { userId, amount }: { userId: string, amount: number }, context: any) => {
            try {
                await initializeAdminApp();
                const db = getFirestore();

                // Verify authentication
                if (!context.user?.id || context.user.id !== userId) {
                    return {
                        success: false,
                        error: 'Unauthorized'
                    };
                }

                // For now, just simulate the withdrawal
                // In a real implementation, this would integrate with USDT transfer logic
                console.log(`[GraphQL] Simulated USDT withdrawal: ${amount} USDT for user ${userId}`);

                const withdrawalId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                return {
                    success: true,
                    withdrawalId,
                    amount
                };
            } catch (error) {
                console.error('[GraphQL] Error withdrawing USDT:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to withdraw USDT'
                };
            }
        },
    },

    User: {
        gameStats: async (parent: any) => {
            // Return default stats if not set
            return {
                level: parent.gameStats?.level || 1,
                coins: parent.gameStats?.coins || 0,
                experience: parent.gameStats?.experience || 0,
                achievements: parent.gameStats?.achievements || [],
            };
        },

        inventory: async (parent: any) => {
            return parent.inventory || [];
        },
    },
};

// Simple GraphQL endpoint using existing URQL client
export async function POST(request: NextRequest) {
    try {
        const { query, variables } = await request.json();
        console.log('[GraphQL] --- START REQUEST ---');
        console.log('[GraphQL] Query:', query);
        console.log('[GraphQL] Variables:', JSON.stringify(variables, null, 2));

        // Proper authentication using middleware utility
        const userPayload = await validateTokenFromRequest(request);
        let user = null;

        if (userPayload?.sub) {
            user = {
                id: userPayload.sub,
                publicKey: userPayload.sub,
            };
            console.log('[GraphQL] Authenticated user:', user.id);
        } else {
            console.log('[GraphQL] No authenticated user found for request.');
        }

        // Simple query processing (mock implementation)
        let result: any = {};

        if (query.includes('health')) {
            console.log('[GraphQL] Matching health query');
            result = { data: { health: 'OK' } };
        } else if (query.includes('user(') && user) {
            console.log('[GraphQL] Matching user query for:', user.id);
            // Mock user data
            result = {
                data: {
                    user: {
                        id: user.id,
                        publicKey: user.publicKey,
                        gameStats: {
                            level: 1,
                            coins: 1000,
                            experience: 0,
                            achievements: []
                        },
                        inventory: [],
                        createdAt: new Date().toISOString(),
                    }
                }
            };
        } else if ((query.includes('userInventory(') || query.includes('userInventory')) && user) {
            console.log('[GraphQL] Matching userInventory query for:', user.id);
            // Get user inventory from database
            try {
                await initializeAdminApp();
                const db = getFirestore();
                const userDoc = await db.collection('players').doc(user.id).get();

                let inventoryData = {
                    protectionBottleCount: 0,
                    guardianShieldCount: 0,
                    speedyPawsTreatCount: 0,
                    coinMagnetTreatCount: 0,
                    items: [],
                };

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const inventory = userData?.inventory || [];

                    // Count items by type
                    const counts = {
                        protectionBottleCount: 0,
                        guardianShieldCount: 0,
                        speedyPawsTreatCount: 0,
                        coinMagnetTreatCount: 0,
                    };

                    // Map item IDs to count properties
                    const itemIdMap: { [key: string]: keyof typeof counts } = {
                        '1': 'protectionBottleCount',
                        '2': 'guardianShieldCount',
                        '3': 'speedyPawsTreatCount',
                        '4': 'coinMagnetTreatCount',
                    };

                    inventory.forEach((item: any) => {
                        const countKey = itemIdMap[String(item.id)];
                        if (countKey) {
                            (counts as any)[countKey] += item.quantity || 1;
                        }
                    });

                    inventoryData = {
                        ...counts,
                        items: inventory,
                    };
                }

                result = { data: { userInventory: inventoryData } };
            } catch (error) {
                console.error('[GraphQL] Error fetching user inventory:', error);
                result = {
                    errors: [{ message: 'Failed to fetch user inventory' }]
                };
            }
        } else if (query.includes('generateAuthNonce(')) {
            // Generate authentication nonce
            const publicKeyMatch = query.match(/generateAuthNonce\(publicKey:\s*"([^"]+)"/);
            if (publicKeyMatch) {
                const publicKey = publicKeyMatch[1];
                try {
                    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/login?publicKey=${encodeURIComponent(publicKey)}`, {
                        method: 'GET',
                    });

                    if (response.ok) {
                        const data = await response.json();
                        result = { data: { generateAuthNonce: { success: true, nonce: data.nonce } } };
                    } else {
                        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                        result = { data: { generateAuthNonce: { success: false, error: errorData.error } } };
                    }
                } catch (error) {
                    result = { data: { generateAuthNonce: { success: false, error: 'Internal server error' } } };
                }
            }
        } else if (query.includes('login(') && variables?.input) {
            // Handle login mutation
            try {
                const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'user-agent': request.headers.get('user-agent') || 'GraphQL-Client',
                        'x-forwarded-for': getClientIp(request),
                    },
                    body: JSON.stringify(variables.input),
                });

                if (response.ok) {
                    const data = await response.json();
                    result = { data: { login: { success: true, message: data.message, publicKey: data.publicKey } } };
                } else {
                    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                    result = { data: { login: { success: false, error: errorData.error } } };
                }
            } catch (error) {
                result = { data: { login: { success: false, error: 'Internal server error' } } };
            }
        } else if ((query.includes('useConsumableItem(') || query.includes('useConsumableItem')) && user) {
            console.log('[GraphQL] Matching useConsumableItem mutation for:', user.id);
            // Handle use consumable item mutation
            try {
                await initializeAdminApp();
                const db = getFirestore();
                const userRef = db.collection('players').doc(user.id);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    result = { data: { useConsumableItem: { success: false, error: 'User not found' } } };
                } else {
                    const userData = userDoc.data();
                    let inventory = userData?.inventory || [];

                    // Unified logic to handle both individual items (REST style) and quantity-based items (GraphQL style)
                    // First, filter items by ID
                    const matchingItems = inventory.filter((item: any) =>
                        String(item.id) === String(variables.itemId)
                    );

                    // Calculate total available quantity across all instances
                    const totalAvailable = matchingItems.reduce((sum: number, item: any) =>
                        sum + (typeof item.quantity === 'number' ? item.quantity : 1), 0
                    );

                    if (totalAvailable < variables.quantity) {
                        result = { data: { useConsumableItem: { success: false, error: `Insufficient quantity. Have ${totalAvailable}, need ${variables.quantity}` } } };
                    } else {
                        let remainingToRemove = variables.quantity;
                        const newInventory = [];
                        let firstItemName = 'item';

                        for (const item of inventory) {
                            if (String(item.id) === String(variables.itemId) && remainingToRemove > 0) {
                                firstItemName = item.name || firstItemName;
                                const itemQty = typeof item.quantity === 'number' ? item.quantity : 1;

                                if (itemQty <= remainingToRemove) {
                                    // Remove this whole entry
                                    remainingToRemove -= itemQty;
                                } else {
                                    // Partially use this entry
                                    newInventory.push({
                                        ...item,
                                        quantity: itemQty - remainingToRemove
                                    });
                                    remainingToRemove = 0;
                                }
                            } else {
                                // Keep this item
                                newInventory.push(item);
                            }
                        }

                        await userRef.update({
                            inventory: newInventory,
                            lastUpdated: new Date(),
                            lastInteraction: FieldValue.serverTimestamp()
                        });

                        result = {
                            data: {
                                useConsumableItem: {
                                    success: true,
                                    message: `Used ${variables.quantity} ${firstItemName}(s)`,
                                    remainingCount: totalAvailable - variables.quantity
                                }
                            }
                        };
                    }
                }
            } catch (error) {
                console.error('[GraphQL] Error in useConsumableItem:', error);
                result = { data: { useConsumableItem: { success: false, error: 'Failed to use item' } } };
            }
        } else if (query.includes('userStats')) {
            // Get real user statistics from database
            try {
                await initializeAdminApp();
                const db = getFirestore();

                const usersSnapshot = await db.collection('players').get();
                const totalUsers = usersSnapshot.size;

                // Get online users (users with recent activity - last 10 minutes)
                const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
                const recentUsersQuery = db.collection('players').where('lastLogin', '>', tenMinutesAgo);
                const recentUsersSnapshot = await recentUsersQuery.get();
                const onlineUsers = recentUsersSnapshot.size;

                const offlineUsers = totalUsers - onlineUsers;

                // Get active games (users who have played in the last hour)
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                const activeGamesQuery = db.collection('gameSessions').where('createdAt', '>', oneHourAgo);
                const activeGamesSnapshot = await activeGamesQuery.get();
                const activeGames = activeGamesSnapshot.size;

                result = {
                    data: {
                        userStats: {
                            totalUsers,
                            onlineUsers,
                            offlineUsers,
                            activeGames,
                        }
                    }
                };
            } catch (error) {
                console.error('[GraphQL] Error fetching user stats:', error);
                result = {
                    data: {
                        userStats: {
                            totalUsers: 0,
                            onlineUsers: 0,
                            offlineUsers: 0,
                            activeGames: 0,
                        }
                    }
                };
            }
        } else if ((query.includes('fetchPlayerData(') || query.includes('fetchPlayerData')) && user) {
            console.log('[GraphQL] Matching fetchPlayerData mutation for:', user.id);
            // Handle fetch player data mutation
            try {
                await initializeAdminApp();
                const db = getFirestore();
                const userDoc = await db.collection('players').doc(user.id).get();

                if (!userDoc.exists) {
                    result = { data: { fetchPlayerData: { success: false, error: 'User not found' } } };
                } else {
                    const userData = userDoc.data();
                    result = {
                        data: {
                            fetchPlayerData: {
                                success: true,
                                playerData: {
                                    level: userData?.gameStats?.level || 1,
                                    coins: userData?.gameUSDTBalance || 0, // ✅ Fixed: use correct field name
                                    experience: userData?.gameStats?.experience || 0,
                                    inventory: userData?.inventory || [],
                                }
                            }
                        }
                    };
                }
            } catch (error) {
                console.error('[GraphQL] Error in fetchPlayerData:', error);
                result = { data: { fetchPlayerData: { success: false, error: 'Failed to fetch player data' } } };
            }
        } else if ((query.includes('addCoins(') || query.includes('addCoins')) && user && variables) {
            console.log('[GraphQL] Matching addCoins mutation for:', user.id);
            // Handle add coins mutation
            try {
                await initializeAdminApp();
                const db = getFirestore();
                const userRef = db.collection('players').doc(user.id);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    result = { data: { addCoins: { success: false, error: 'User not found' } } };
                } else {
                    const userData = userDoc.data();
                    const currentBalance = userData?.gameUSDTBalance || 0;
                    const newBalance = currentBalance + (variables.amount || 0);

                    await userRef.update({
                        gameUSDTBalance: newBalance,
                        lastUpdated: new Date(),
                        lastInteraction: FieldValue.serverTimestamp()
                    });

                    result = {
                        data: {
                            addCoins: {
                                success: true,
                                newBalance
                            }
                        }
                    };
                }
            } catch (error) {
                console.error('[GraphQL] Error in addCoins:', error);
                result = { data: { addCoins: { success: false, error: 'Failed to add coins' } } };
            }
        } else if ((query.includes('useItem(') || query.includes('useItem')) && user && variables) {
            console.log('[GraphQL] Matching useItem mutation for:', user.id);
            // Handle use item mutation
            try {
                await initializeAdminApp();
                const db = getFirestore();
                const userRef = db.collection('players').doc(user.id);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    result = { data: { useItem: { success: false, error: 'User not found' } } };
                } else {
                    const userData = userDoc.data();
                    const inventory = userData?.inventory || [];
                    const itemIndex = inventory.findIndex((item: any) => String(item.id) === String(variables.itemId));

                    if (itemIndex === -1) {
                        result = { data: { useItem: { success: false, error: 'Item not found in inventory' } } };
                    } else {
                        const item = inventory[itemIndex];
                        const newInventory = [...inventory];

                        if (item.quantity <= 1) {
                            newInventory.splice(itemIndex, 1);
                        } else {
                            newInventory[itemIndex] = {
                                ...item,
                                quantity: item.quantity - 1
                            };
                        }

                        await userRef.update({
                            inventory: newInventory,
                            lastUpdated: new Date(),
                            lastInteraction: FieldValue.serverTimestamp()
                        });

                        result = {
                            data: {
                                useItem: {
                                    success: true,
                                    message: `Used ${item.name}`,
                                    remainingCount: Math.max(0, item.quantity - 1)
                                }
                            }
                        };
                    }
                }
            } catch (error) {
                console.error('[GraphQL] Error in useItem:', error);
                result = { data: { useItem: { success: false, error: 'Failed to use item' } } };
            }
        } else if ((query.includes('consumeProtectionBottle(') || query.includes('consumeProtectionBottle')) && user) {
            console.log('[GraphQL] Matching consumeProtectionBottle mutation for:', user.id);
            // Handle consume protection bottle mutation
            try {
                await initializeAdminApp();
                const db = getFirestore();
                const userRef = db.collection('players').doc(user.id);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    result = { data: { consumeProtectionBottle: { success: false, error: 'User not found' } } };
                } else {
                    const userData = userDoc.data();
                    const inventory = userData?.inventory || [];
                    const bottleIndex = inventory.findIndex((item: any) => String(item.id) === '1');

                    if (bottleIndex === -1) {
                        result = { data: { consumeProtectionBottle: { success: false, error: 'Protection bottle not found in inventory' } } };
                    } else {
                        const bottle = inventory[bottleIndex];
                        const newInventory = [...inventory];

                        if (bottle.quantity <= 1) {
                            newInventory.splice(bottleIndex, 1);
                        } else {
                            newInventory[bottleIndex] = {
                                ...bottle,
                                quantity: bottle.quantity - 1
                            };
                        }

                        await userRef.update({
                            inventory: newInventory,
                            lastUpdated: new Date(),
                            lastInteraction: FieldValue.serverTimestamp()
                        });

                        result = {
                            data: {
                                consumeProtectionBottle: {
                                    success: true,
                                    message: 'Protection bottle consumed',
                                    remainingCount: Math.max(0, bottle.quantity - 1)
                                }
                            }
                        };
                    }
                }
            } catch (error) {
                console.error('[GraphQL] Error in consumeProtectionBottle:', error);
                result = { data: { consumeProtectionBottle: { success: false, error: 'Failed to consume protection bottle' } } };
            }
        } else if ((query.includes('applyPenalty(') || query.includes('applyPenalty')) && user && variables) {
            console.log('[GraphQL] Matching applyPenalty mutation for:', user.id);
            // Handle apply penalty mutation
            try {
                await initializeAdminApp();
                const db = getFirestore();
                const userRef = db.collection('players').doc(user.id);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    result = { data: { applyPenalty: { success: false, error: 'User not found' } } };
                } else {
                    const userData = userDoc.data();
                    const currentCoins = userData?.gameStats?.coins || 0;
                    const newBalance = Math.max(0, currentCoins - (variables.amount || 0));

                    await userRef.update({
                        'gameStats.coins': newBalance,
                        lastUpdated: new Date(),
                        lastInteraction: FieldValue.serverTimestamp()
                    });

                    result = {
                        data: {
                            applyPenalty: {
                                success: true,
                                newBalance,
                                penaltyApplied: variables.amount || 0
                            }
                        }
                    };
                }
            } catch (error) {
                console.error('[GraphQL] Error in applyPenalty:', error);
                result = { data: { applyPenalty: { success: false, error: 'Failed to apply penalty' } } };
            }
        } else if ((query.includes('withdrawUSDT(') || query.includes('withdrawUSDT')) && user && variables) {
            console.log('[GraphQL] Matching withdrawUSDT mutation for:', user.id);
            // Handle withdraw USDT mutation
            try {
                // For now, just simulate the withdrawal
                console.log(`[GraphQL] Simulated USDT withdrawal: ${variables.amount} USDT for user ${user.id}`);

                const withdrawalId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                result = {
                    data: {
                        withdrawUSDT: {
                            success: true,
                            withdrawalId,
                            amount: variables.amount
                        }
                    }
                };
            } catch (error) {
                console.error('[GraphQL] Error in withdrawUSDT:', error);
                result = { data: { withdrawUSDT: { success: false, error: 'Failed to withdraw USDT' } } };
            }
        } else if (query.includes('marketData')) {
            result = {
                data: {
                    marketData: {
                        bobyPrice: 0.00001234,
                        volume24h: 1234567.89,
                        priceChange24h: 5.67,
                        lastUpdated: new Date().toISOString(),
                    }
                }
            };
        } else {
            console.log('[GraphQL] No matching handler found for query. User authenticated:', !!user);
            const isAuthIssue = (query.includes('user(') || query.includes('userInventory') || query.includes('useConsumableItem')) && !user;
            result = {
                errors: [{
                    message: isAuthIssue
                        ? 'Authentication required for this operation'
                        : 'GraphQL query not supported or missing required parameters'
                }]
            };
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('[GraphQL] Error:', error);
        return NextResponse.json({
            errors: [{ message: 'Internal server error' }]
        }, { status: 500 });
    }
}

export async function GET() {
    // Simple health check
    return NextResponse.json({
        data: { health: 'OK' }
    });
}

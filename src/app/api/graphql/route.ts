import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { logger } from 'utils/logger';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getClientIp } from '@/lib/request-utils';
import { AdvancedRateLimiter } from '@/lib/advancedRateLimiter';
import { validateTokenFromRequest } from '@/lib/auth-middleware';
import type { CreateItemInput, UpdateItemInput } from '@/lib/server-items';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { extractMutationName, checkGraphQLMutationRateLimit } from '@/lib/graphql-rate-limiter';
import { auditLogger } from '@/lib/audit-logger';
import redis from '@/lib/redis';

// GraphQL Type Definitions
const typeDefs = `
  type Query {
    health: String!
    user(id: ID!): User
    userInventory(userId: ID!): UserInventory
    gameWorld(chunkX: Int!, chunkZ: Int!, radius: Int): GameWorld
    marketData: MarketData
    userStats: UserStats

    # Item management queries
    storeItems: [StoreItem!]!
    storeItem(id: ID!): StoreItem
    activeStoreItems: [StoreItem!]!
    storeItemsStats: StoreItemsStats!
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

    # Item management mutations
    createStoreItem(input: CreateItemInput!): ItemResult!
    updateStoreItem(id: ID!, input: UpdateItemInput!): ItemResult!
    updateItemPrice(id: ID!, price: Int!): ItemResult!
    toggleItemStatus(id: ID!, isActive: Boolean!): ItemResult!
    deleteStoreItem(id: ID!): ItemResult!
    reinitializeStoreItems: ItemResult!
  }

  type Subscription {
    bobyPriceUpdates: PriceUpdate!
    userActivityUpdates: UserActivityUpdate!
    gameEvents(userId: ID!): GameEvent!
  }

  type PriceUpdate {
    price: Float!
    changePercent: Float!
    timestamp: String!
  }

  type UserActivityUpdate {
    onlineUsers: Int!
    activeGames: Int!
    timestamp: String!
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

  # Store Item Management Types
  type StoreItem {
    id: ID!
    name: String!
    description: String!
    price: Int!
    usdPrice: Float!
    image: String!
    dataAiHint: String!
    type: ItemType!
    rarity: ItemRarity!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  enum ItemType {
    consumable
    permanent
  }

  enum ItemRarity {
    common
    rare
    epic
    legendary
  }

  type ItemResult {
    success: Boolean!
    item: StoreItem
    message: String!
  }

  input CreateItemInput {
    name: String!
    description: String!
    price: Int!
    usdPrice: Float!
    image: String!
    dataAiHint: String!
    type: ItemType!
    rarity: ItemRarity!
  }

  input UpdateItemInput {
    name: String
    description: String
    price: Int
    usdPrice: Float
    image: String
    dataAiHint: String
    type: ItemType
    rarity: ItemRarity
    isActive: Boolean
  }

  type StoreItemsStats {
    total: Int!
    active: Int!
    inactive: Int!
    byType: StoreItemsByType!
    byRarity: StoreItemsByRarity!
  }

  type StoreItemsByType {
    consumable: Int!
    permanent: Int!
  }

  type StoreItemsByRarity {
    common: Int!
    rare: Int!
    epic: Int!
    legendary: Int!
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
                logger.error('[GraphQL] Error fetching user:', error as Error);
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
                logger.error('[GraphQL] Error fetching game world:', error as Error);
                throw new Error('Failed to fetch game world');
            }
        },

        marketData: async (_: any, __: any, context: any) => {
            try {
                // Get dynamic base URL from request
                const request = context?.request;
                const baseUrl = request ? `${request.nextUrl.protocol}//${request.nextUrl.host}` : 'http://localhost:3000';

                // Fetch real Boby price from Jupiter API
                logger.log('[GraphQL] Fetching market data from Jupiter API...');
                const response = await fetch(`${baseUrl}/api/boby-price-jup`, {
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
                logger.error('[GraphQL] Error fetching market data from Jupiter:', error as Error);
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
                logger.error('[GraphQL] Error fetching user inventory:', error as Error);
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
                logger.error('[GraphQL] Error fetching user stats:', error);
                // Return zeros instead of throwing to prevent UI breakage
                return {
                    totalUsers: 0,
                    onlineUsers: 0,
                    offlineUsers: 0,
                    activeGames: 0,
                };
            }
        },

        // ===== Item Management Queries =====
        storeItems: async (_: any, __: any, context: any) => {
            const { getAllStoreItems } = await import('@/lib/server-items');
            return await getAllStoreItems();
        },

        storeItem: async (_: any, { id }: { id: string }, context: any) => {
            const { getStoreItemById } = await import('@/lib/server-items');
            return await getStoreItemById(id);
        },

        activeStoreItems: async (_: any, __: any, context: any) => {
            const { getActiveStoreItems } = await import('@/lib/server-items');
            return await getActiveStoreItems();
        },

        storeItemsStats: async (_: any, __: any, context: any) => {
            const { getStoreItemsStats } = await import('@/lib/server-items');
            return await getStoreItemsStats();
        },
    },

    Mutation: {
        // ===== Item Management Mutations =====
        createStoreItem: async (_: any, { input }: { input: CreateItemInput }, context: any) => {
            const { createStoreItem } = await import('@/lib/server-items');
            return await createStoreItem(input);
        },

        updateStoreItem: async (_: any, { id, input }: { id: string, input: UpdateItemInput }, context: any) => {
            const { updateStoreItem } = await import('@/lib/server-items');
            return await updateStoreItem(id, input);
        },

        updateItemPrice: async (_: any, { id, price }: { id: string, price: number }, context: any) => {
            const { updateItemPrice } = await import('@/lib/server-items');
            return await updateItemPrice(id, price);
        },

        toggleItemStatus: async (_: any, { id, isActive }: { id: string, isActive: boolean }, context: any) => {
            const { toggleItemStatus } = await import('@/lib/server-items');
            return await toggleItemStatus(id, isActive);
        },

        deleteStoreItem: async (_: any, { id }: { id: string }, context: any) => {
            const { deleteStoreItem } = await import('@/lib/server-items');
            return await deleteStoreItem(id);
        },

        reinitializeStoreItems: async (_: any, __: any, context: any) => {
            const { reinitializeStoreItems } = await import('@/lib/server-items');
            return await reinitializeStoreItems();
        },

        generateAuthNonce: async (_: any, { publicKey }: { publicKey: string }, context: any) => {
            try {
                // Get dynamic base URL from request
                const request = context?.request;
                const baseUrl = request ? `${request.nextUrl.protocol}//${request.nextUrl.host}` : 'http://localhost:3000';

                // Delegate to existing REST API
                const response = await fetch(`${baseUrl}/api/auth/login?publicKey=${encodeURIComponent(publicKey)}`, {
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
                logger.error('[GraphQL] Error generating auth nonce:', error);
                return {
                    success: false,
                    error: 'Internal server error',
                };
            }
        },

        login: async (_: any, { input }: { input: { publicKey: string, signature: string, nonce: string } }, context: any) => {
            try {
                // Get dynamic base URL from request
                const request = context?.request;
                const baseUrl = request ? `${request.nextUrl.protocol}//${request.nextUrl.host}` : 'http://localhost:3000';

                // Delegate to existing REST API
                const response = await fetch(`${baseUrl}/api/auth/login`, {
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
                logger.error('[GraphQL] Error during login:', error);
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
                logger.error('[GraphQL] Error updating progress:', error);
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

                // Get item data from database
                const { getStoreItemById } = await import('@/lib/server-items');
                const itemData = await getStoreItemById(itemId);

                if (!itemData || !itemData.isActive) {
                    throw new Error('Item not found or not available for purchase');
                }

                // Calculate total price
                const totalPrice = itemData.price * quantity;

                const userRef = db.collection('players').doc(userId);
                const userDoc = await userRef.get();
                const userData = userDoc.data();

                if (!userData) {
                    throw new Error('User data not found');
                }

                const userBalance = userData.gameUSDTBalance || 0;
                if (userBalance < totalPrice) {
                    throw new Error(`Insufficient coins. Required: ${totalPrice}, Available: ${userBalance}`);
                }

                // Check if user already has this item in inventory
                const existingInventory = userData.inventory || [];
                const existingItemIndex = existingInventory.findIndex((item: any) => String(item.id) === String(itemId));

                let updatedInventory;
                if (existingItemIndex >= 0) {
                    // Update existing item quantity
                    updatedInventory = [...existingInventory];
                    updatedInventory[existingItemIndex] = {
                        ...updatedInventory[existingItemIndex],
                        quantity: updatedInventory[existingItemIndex].quantity + quantity
                    };
                } else {
                    // Add new item to inventory
                    updatedInventory = [
                        ...existingInventory,
                        {
                            id: itemId,
                            itemType: itemData.type,
                            name: itemData.name,
                            quantity,
                            rarity: itemData.rarity,
                            image: itemData.image,
                        }
                    ];
                }

                // Update user data
                await userRef.update({
                    gameUSDTBalance: userData.gameUSDTBalance - totalPrice,
                    inventory: updatedInventory,
                    lastUpdated: new Date(),
                    lastInteraction: FieldValue.serverTimestamp()
                });

                logger.log(`[Purchase] User ${userId} purchased ${quantity}x ${itemData.name} for ${totalPrice} coins`);

                return {
                    success: true,
                    remainingCoins: userData.gameUSDTBalance - totalPrice,
                    inventory: updatedInventory,
                };
            } catch (error) {
                logger.error('[GraphQL] Error purchasing item:', error);
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
                logger.error('[GraphQL] Error saving session:', error);
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
                logger.error('[GraphQL] Error using consumable item:', error);
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
                logger.error('[GraphQL] Error fetching player data:', error);
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

                // Use transaction to prevent race conditions
                const result = await db.runTransaction(async (transaction) => {
                    const userDoc = await transaction.get(userRef);

                    if (!userDoc.exists) {
                        throw new Error('User not found');
                    }

                    const userData = userDoc.data();
                    const currentBalance = userData?.gameUSDTBalance || 0;
                    const newBalance = currentBalance + amount;

                    transaction.update(userRef, {
                        gameUSDTBalance: newBalance,
                        lastUpdated: new Date(),
                        lastInteraction: FieldValue.serverTimestamp()
                    });

                    return {
                        success: true,
                        newBalance
                    };
                });

                return result;
            } catch (error) {
                logger.error('[GraphQL] Error adding coins:', error);
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
                logger.error('[GraphQL] Error using item:', error);
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
                logger.error('[GraphQL] Error consuming protection bottle:', error);
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
                logger.error('[GraphQL] Error applying penalty:', error);
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
                logger.log(`[GraphQL] Simulated USDT withdrawal: ${amount} USDT for user ${userId}`);

                const withdrawalId = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                return {
                    success: true,
                    withdrawalId,
                    amount
                };
            } catch (error) {
                logger.error('[GraphQL] Error withdrawing USDT:', error);
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

    Subscription: {
        bobyPriceUpdates: {
            subscribe: async function* (root: any, args: any, context: any) {
                // Price update subscription - emits price changes every few seconds

                // Get dynamic base URL from request context
                const request = context?.request;
                const baseUrl = request ? `${request.nextUrl.protocol}//${request.nextUrl.host}` : 'http://localhost:3000';

                // Initialize with real current price from API
                let lastPrice = 0.00001234; // fallback default

                try {
                    logger.log('[Subscription] Fetching initial price for bobyPriceUpdates...');
                    const initResponse = await fetch(`${baseUrl}/api/boby-price-jup`, {
                        method: 'GET',
                    });

                    if (initResponse.ok) {
                        const initData = await initResponse.json();
                        if (initData.price && typeof initData.price === 'number') {
                            lastPrice = initData.price;
                            logger.log(`[Subscription] Initialized with real price: ${lastPrice}`);
                        } else {
                            logger.warn('[Subscription] Invalid price format from API, using fallback');
                        }
                    } else {
                        logger.warn('[Subscription] Failed to fetch initial price, using fallback');
                    }
                } catch (error) {
                    logger.error('[Subscription] Error fetching initial price:', error);
                    logger.log('[Subscription] Using fallback price:', lastPrice);
                }

                while (true) {
                    try {
                        // Fetch current price from Jupiter API
                        const response = await fetch(`${baseUrl}/api/boby-price-jup`, {
                            method: 'GET',
                        });

                        if (response.ok) {
                            const data = await response.json();
                            const currentPrice = data.price;

                            if (currentPrice && typeof currentPrice === 'number') {
                                // Calculate price change percentage
                                const changePercent = lastPrice > 0 ? ((currentPrice - lastPrice) / lastPrice) * 100 : 0;

                                // Only emit if price actually changed significantly
                                if (Math.abs(changePercent) > 0.01) { // 0.01% threshold to avoid noise
                                    logger.log(`[Subscription] Price change detected: ${lastPrice} -> ${currentPrice} (${changePercent.toFixed(4)}%)`);

                                    yield {
                                        bobyPriceUpdates: {
                                            price: currentPrice,
                                            changePercent,
                                            timestamp: new Date().toISOString(),
                                        }
                                    };
                                    lastPrice = currentPrice;
                                }
                            } else {
                                logger.warn('[Subscription] Invalid price format in update');
                            }
                        } else {
                            logger.warn(`[Subscription] API returned status ${response.status}`);
                        }
                    } catch (error) {
                        logger.error('[GraphQL Subscription] Error fetching price update:', error);
                    }

                    // Wait 30 seconds before next update
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
            }
        },

        userActivityUpdates: {
            subscribe: async function* () {
                // User activity subscription - emits user activity stats every 10 seconds
                while (true) {
                    try {
                        await initializeAdminApp();
                        const db = getFirestore();

                        // Get online users (users with recent activity - last 10 minutes)
                        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
                        const recentUsersQuery = db.collection('players').where('lastLogin', '>', tenMinutesAgo);
                        const recentUsersSnapshot = await recentUsersQuery.get();
                        const onlineUsers = recentUsersSnapshot.size;

                        // Get active games (users who have played in the last 5 minutes)
                        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                        const activeGamesQuery = db.collection('gameSessions').where('createdAt', '>', fiveMinutesAgo);
                        const activeGamesSnapshot = await activeGamesQuery.get();
                        const activeGames = activeGamesSnapshot.size;

                        yield {
                            userActivityUpdates: {
                                onlineUsers,
                                activeGames,
                                timestamp: new Date().toISOString(),
                            }
                        };
                    } catch (error) {
                        logger.error('[GraphQL Subscription] Error fetching user activity:', error);
                        // Emit default values on error
                        yield {
                            userActivityUpdates: {
                                onlineUsers: 0,
                                activeGames: 0,
                                timestamp: new Date().toISOString(),
                            }
                        };
                    }

                    // Wait 10 seconds before next update
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
            }
        },

        gameEvents: {
            subscribe: (_: any, { userId }: { userId: string }, context: any) => {
                // Game events subscription for specific user
                // This would typically use a pub/sub system like Redis
                // For now, we'll simulate with a simple generator
                return (async function* () {
                    // Verify authentication
                    if (!context.user?.id || context.user.id !== userId) {
                        throw new Error('Unauthorized');
                    }

                    while (true) {
                        // In a real implementation, this would listen to a pub/sub channel
                        // for game events specific to this user
                        // For now, we'll just emit a heartbeat every 30 seconds
                        yield {
                            gameEvents: {
                                eventType: 'heartbeat',
                                data: 'User is active',
                                timestamp: new Date().toISOString(),
                            }
                        };

                        // Wait 30 seconds
                        await new Promise(resolve => setTimeout(resolve, 30000));
                    }
                })();
            }
        }
    },
};

// Simple GraphQL endpoint using existing URQL client
export const POST = withCsrfProtection(async (request: NextRequest) => {
    try {
        // Enforce Advanced Rate Limiting
        const clientIp = getClientIp(request);
        const rateLimitResult = await AdvancedRateLimiter.getInstance().checkRateLimit(
            request,
            clientIp,
            'graphql-api',
            undefined, // Device info will be extracted if available in headers
            { customLimit: 200 } // Specific limit for GraphQL: 200 req/min
        );

        if (!rateLimitResult.allowed) {
            logger.warn(`[GraphQL] Rate limit exceeded for IP ${clientIp}`);
            return NextResponse.json(
                { error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
                { status: 429 }
            );
        }

        const { query, variables } = await request.json();
        logger.log('[GraphQL] --- START REQUEST ---');
        logger.log('[GraphQL] Query:', query);
        logger.log('[GraphQL] Variables:', JSON.stringify(variables, null, 2));

        // Proper authentication using middleware utility
        const userPayload = await validateTokenFromRequest(request);
        let user = null;

        if (userPayload?.sub) {
            user = {
                id: userPayload.sub,
                publicKey: userPayload.sub,
            };
            logger.log('[GraphQL] Authenticated user:', user.id);
        } else {
            logger.log('[GraphQL] No authenticated user found for request.');
        }

        // Enforce Per-Mutation Rate Limiting
        const mutationName = extractMutationName(query);
        if (mutationName) {
            const rateLimitResult = await checkGraphQLMutationRateLimit(
                clientIp,
                mutationName,
                userPayload?.sub
            );

            if (!rateLimitResult.allowed) {
                // Log the rate limit hit
                await auditLogger.logRateLimitHit(
                    userPayload?.sub ? `User:${userPayload.sub}` : `IP:${clientIp}`,
                    `GraphQL:${mutationName}`,
                    { query, ip: clientIp, userAgent: request.headers.get('user-agent') || undefined }
                );

                logger.warn(`[GraphQL] Mutation rate limit exceeded for ${mutationName} from IP ${clientIp}`);
                return NextResponse.json(
                    { errors: [{ message: `Rate limit exceeded for this operation. Please wait ${rateLimitResult.retryAfterSeconds}s.` }] },
                    { status: 429 }
                );
            }
        }

        // Simple query processing (mock implementation)
        let result: any = {};

        if (query.includes('health')) {
            logger.log('[GraphQL] Matching health query');
            result = { data: { health: 'OK' } };
        } else if (query.includes('user(') && user) {
            logger.log('[GraphQL] Matching user query for:', user.id);
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
            logger.log('[GraphQL] Matching userInventory query for:', user.id);
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
                logger.error('[GraphQL] Error fetching user inventory:', error as Error);
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
                    // Use dynamic origin from the request to ensure it works in all environments (preview, prod, localhost)
                    const baseUrl = request.nextUrl.origin;
                    const response = await fetch(`${baseUrl}/api/auth/login?publicKey=${encodeURIComponent(publicKey)}`, {
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
                // Use dynamic origin from the request
                const baseUrl = request.nextUrl.origin;
                const response = await fetch(`${baseUrl}/api/auth/login`, {
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
            logger.log('[GraphQL] Matching useConsumableItem mutation for:', user.id);
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
                logger.error('[GraphQL] Error in useConsumableItem:', error);
                result = { data: { useConsumableItem: { success: false, error: 'Failed to use item' } } };
            }
        } else if (query.includes('userStats')) {
            // Get real user statistics with caching (TTL: 60s)
            try {
                const cacheKey = 'graphql:userStats';
                const cachedStats = await redis.get(cacheKey);

                if (cachedStats) {
                    result = { data: { userStats: JSON.parse(cachedStats) } };
                } else {
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

                    const statsData = {
                        totalUsers,
                        onlineUsers,
                        offlineUsers,
                        activeGames,
                    };

                    // Cache the result
                    await redis.setex(cacheKey, 60, JSON.stringify(statsData));

                    result = {
                        data: {
                            userStats: statsData
                        }
                    };
                }
            } catch (error) {
                logger.error('[GraphQL] Error fetching user stats:', error);
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
            logger.log('[GraphQL] Matching fetchPlayerData mutation for:', user.id);
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
                logger.error('[GraphQL] Error in fetchPlayerData:', error);
                result = { data: { fetchPlayerData: { success: false, error: 'Failed to fetch player data' } } };
            }
        } else if ((query.includes('addCoins(') || query.includes('addCoins')) && user && variables) {
            logger.log('[GraphQL] Matching addCoins mutation for:', user.id);
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

                    await auditLogger.logEvent(
                        'TRANSACTION',
                        `Added ${variables.amount} coins to user ${user.id}`,
                        { userId: user.id, amount: variables.amount, action: 'addCoins' },
                        'warn'
                    );

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
                logger.error('[GraphQL] Error in addCoins:', error);
                result = { data: { addCoins: { success: false, error: 'Failed to add coins' } } };
            }
        } else if ((query.includes('useItem(') || query.includes('useItem')) && user && variables) {
            logger.log('[GraphQL] Matching useItem mutation for:', user.id);
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
                logger.error('[GraphQL] Error in useItem:', error);
                result = { data: { useItem: { success: false, error: 'Failed to use item' } } };
            }
        } else if ((query.includes('consumeProtectionBottle(') || query.includes('consumeProtectionBottle')) && user) {
            logger.log('[GraphQL] Matching consumeProtectionBottle mutation for:', user.id);
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
                logger.error('[GraphQL] Error in consumeProtectionBottle:', error);
                result = { data: { consumeProtectionBottle: { success: false, error: 'Failed to consume protection bottle' } } };
            }
        } else if ((query.includes('applyPenalty(') || query.includes('applyPenalty')) && user && variables) {
            logger.log('[GraphQL] Matching applyPenalty mutation for:', user.id);
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

                    await auditLogger.logEvent(
                        'TRANSACTION',
                        `Applied penalty of ${variables.amount} to user ${user.id}`,
                        { userId: user.id, amount: variables.amount, action: 'applyPenalty' },
                        'warn'
                    );

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
                logger.error('[GraphQL] Error in applyPenalty:', error);
                result = { data: { applyPenalty: { success: false, error: 'Failed to apply penalty' } } };
            }
        } else if ((query.includes('withdrawUSDT(') || query.includes('withdrawUSDT')) && user && variables) {
            logger.log('[GraphQL] Matching withdrawUSDT mutation for:', user.id);
            // Handle withdraw USDT mutation
            try {
                // For now, just simulate the withdrawal
                logger.log(`[GraphQL] Simulated USDT withdrawal: ${variables.amount} USDT for user ${user.id}`);

                await auditLogger.logEvent(
                    'TRANSACTION',
                    `User ${user.id} requested withdrawal of ${variables.amount} USDT`,
                    { userId: user.id, amount: variables.amount, action: 'withdrawUSDT' },
                    'info'
                );

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
                logger.error('[GraphQL] Error in withdrawUSDT:', error);
                result = { data: { withdrawUSDT: { success: false, error: 'Failed to withdraw USDT' } } };
            }
        } else if (query.includes('marketData')) {
            logger.log('[GraphQL] Processing marketData query');
            // Cache market data for 60 seconds
            const cacheKey = 'graphql:marketData';
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    result = { data: { marketData: JSON.parse(cached) } };
                } else {
                    const marketDataResult = await resolvers.Query.marketData(null, null, { request });
                    await redis.setex(cacheKey, 60, JSON.stringify(marketDataResult));
                    result = {
                        data: {
                            marketData: marketDataResult
                        }
                    };
                }
            } catch (error) {
                logger.error('[GraphQL] Error in marketData resolver:', error);
                result = {
                    data: {
                        marketData: {
                            bobyPrice: 0.00001234, // fallback
                            volume24h: 0,
                            priceChange24h: 0,
                            lastUpdated: new Date().toISOString(),
                        }
                    }
                };
            }
        } else if (query.includes('storeItems')) {
            logger.log('[GraphQL] Processing storeItems query');
            // Cache store items for 5 minutes
            const cacheKey = 'graphql:storeItems';
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    result = { data: { storeItems: JSON.parse(cached) } };
                } else {
                    const storeItems = await resolvers.Query.storeItems(null, null, { user });
                    await redis.setex(cacheKey, 300, JSON.stringify(storeItems));
                    result = {
                        data: {
                            storeItems
                        }
                    };
                }
            } catch (error) {
                logger.error('[GraphQL] Error in storeItems query:', error);
                result = {
                    data: {
                        storeItems: []
                    }
                };
            }
        } else if (query.includes('activeStoreItems')) {
            logger.log('[GraphQL] Processing activeStoreItems query');
            // Cache active store items for 5 minutes
            const cacheKey = 'graphql:activeStoreItems';
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    result = { data: { activeStoreItems: JSON.parse(cached) } };
                } else {
                    const activeStoreItems = await resolvers.Query.activeStoreItems(null, null, { user });
                    await redis.setex(cacheKey, 300, JSON.stringify(activeStoreItems));
                    result = {
                        data: {
                            activeStoreItems
                        }
                    };
                }
            } catch (error) {
                logger.error('[GraphQL] Error in activeStoreItems query:', error);
                result = {
                    data: {
                        activeStoreItems: []
                    }
                };
            }
        } else if (query.includes('storeItem(') && variables?.id) {
            logger.log('[GraphQL] Processing storeItem query for ID:', variables.id);
            try {
                const storeItem = await resolvers.Query.storeItem(null, { id: variables.id }, { user });
                result = {
                    data: {
                        storeItem
                    }
                };
            } catch (error) {
                logger.error('[GraphQL] Error in storeItem query:', error);
                result = {
                    data: {
                        storeItem: null
                    }
                };
            }
        } else {
            logger.log('[GraphQL] No matching handler found for query. User authenticated:', !!user);
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
        logger.error('[GraphQL] Error:', error);
        return NextResponse.json({
            errors: [{ message: 'Internal server error' }]
        }, { status: 500 });
    }
});

export async function GET() {
    // Simple health check
    return NextResponse.json({
        data: { health: 'OK' }
    });
}

export interface GraphQLHookResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (variables?: unknown) => Promise<T | null | void>;
}

export interface MarketData {
  bobyPrice: number;
  volume24h: number;
  priceChange24h: number;
  lastUpdated: number;
}

export interface UserInventoryItem {
  id: string;
  itemType: string;
  name: string;
  quantity: number;
  rarity: string;
  image: string;
}

export interface UserInventory {
  protectionBottleCount: number;
  guardianShieldCount: number;
  speedyPawsTreatCount: number;
  coinMagnetTreatCount: number;
  items: UserInventoryItem[];
}

export interface UserStats {
  totalUsers: number;
  onlineUsers: number;
  offlineUsers: number;
  activeGames: number;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  publicKey?: string;
  error?: string;
}

export interface ConsumableItemResponse {
  success: boolean;
  message: string;
  remainingCount?: number;
  error?: string;
}

export interface PlayerData {
  level: number;
  coins: number;
  experience: number;
  inventory: UserInventoryItem[];
  lastProcessedBatchId?: string;
}

export interface FetchPlayerDataResponse {
  success: boolean;
  playerData?: PlayerData;
  error?: string;
}

export interface AddCoinsResponse {
  success: boolean;
  newBalance?: number;
  error?: string;
}

export interface WithdrawResponse {
  success: boolean;
  withdrawalId?: string;
  amount?: number;
  error?: string;
}

export interface PriceUpdate {
  price: number;
  changePercent: number;
  timestamp: number;
}

export interface ActivityUpdate {
  onlineUsers: number;
  activeGames: number;
  timestamp: number;
}

// Future: Upgrade Types
export interface UpgradeItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  level: number;
  maxLevel: number;
  effectValue: number;
  effectType: string;
}

export interface PurchaseUpgradeResponse {
  success: boolean;
  remainingCoins?: number;
  newLevel?: number;
  error?: string;
}

// Future: Referral Types
export interface ReferralData {
  referralCode: string;
  totalReferrals: number;
  totalEarnings: number;
  pendingRewards: number;
}

export interface ClaimReferralResponse {
  success: boolean;
  amountClaimed?: number;
  newPendingBalance?: number;
  error?: string;
}

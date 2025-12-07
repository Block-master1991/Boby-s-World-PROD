// User-confirmed Mainnet Boby Token Mint Address
export const BOBY_TOKEN_MINT_ADDRESS = '9EbJs7KsoWqAoUPTtcYf1kVyvydQgoxcvcitSbcUpump';
// CoinGecko ID for Boby token
export const BOBY_COINGECKO_ID = 'boby'; 
// Mainnet USDT (Tether) Mint Address
export const USDT_TOKEN_MINT_ADDRESS = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
// Mainnet USDC Mint Address
export const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
// Wrapped SOL Mint Address
export const SOL_TOKEN_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';
// 1 Billion Lamports per SOL
export const LAMPORTS_PER_SOL = 1_000_000_000;
// Default Public Mainnet-beta RPC
export const SOL_NETWORK = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export const STORE_TREASURY_WALLET_ADDRESS = process.env.NEXT_PUBLIC_STORE_TREASURY_WALLET_ADDRESS;

export const ADMIN_WALLET_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESS;


export const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

export const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export const FIREBASE_AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

export const FIREBASE_STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

export const FIREBASE_MESSAGING_SENDER_ID = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;

export const FIREBASE_APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

export const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

// World boundaries and enemy protection radius
export const WORLD_MIN_BOUND = -999;
export const WORLD_MAX_BOUND = 999;
export const ENEMY_PROTECTION_RADIUS_VAL = 15;
export const DOG_SPAWN_PROTECTION_RADIUS = 40; // Radius around dog's initial spawn where no coins/enemies should appear
export const ENEMY_COLLISION_PENALTY_USDT = 0.001; // Penalty amount for enemy collision
// src/lib/constants.ts
export const PERFORMANCE_SETTINGS = {
  // إعدادات LOD
  LOD_DISTANCES: {
    HIGH: 50,
    MEDIUM: 100,
    LOW: 200
  },
  
  // إعدادات التحميل
  BATCH_SIZE: 2,
  MAX_CONCURRENT_LOADS: 3,
  
  // إعدادات الذاكرة
  MAX_MEMORY_USAGE: 500 * 1024 * 1024, // 500MB
  CLEANUP_THRESHOLD: 0.8, // 80%
  
  // إعدادات الجودة
  TEXTURE_QUALITY: 1.0,
  SHADOW_QUALITY: 0.5,
  
  // إعدادات الأداء
  TARGET_FPS: 60,
  MIN_FPS: 30,
  
  // إعدادات Occlusion Culling
  OCCLUSION_CHECK_INTERVAL: 100, // ms
  MAX_OCCLUSION_OBJECTS: 1000
};

// User-confirmed Mainnet Boby Token Mint Address
export const BOBY_TOKEN_MINT_ADDRESS = '9EbJs7KsoWqAoUPTtcYf1kVyvydQgoxcvcitSbcUpump';
// Token decimals
export const BOBY_TOKEN_DECIMALS = 6;
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

export const {JUPITER_API_KEY} = process.env;

// World boundaries and enemy protection radius
// Note: World bounds optimized for performance while maintaining infinite feel
// Chunk render distance: 3 (175 units max), Ground size: 420, Camera far: 250
export const WORLD_MIN_BOUND = -50000;
export const WORLD_MAX_BOUND = 50000;
export const ENEMY_PROTECTION_RADIUS_VAL = 15;
export const DOG_SPAWN_PROTECTION_RADIUS = 40; // Radius around dog's initial spawn where no coins/enemies should appear
export const ENEMY_COLLISION_PENALTY_USDT = 0.001; // Penalty amount for enemy collision
// src/lib/constants.ts
export const PERFORMANCE_SETTINGS = {
  // LOD Settings
  LOD_DISTANCES: {
    HIGH: 50,
    MEDIUM: 100,
    LOW: 200
  },

  // Loading Settings
  BATCH_SIZE: 2,
  MAX_CONCURRENT_LOADS: 3,

  // Memory Settings
  MAX_MEMORY_USAGE: 500 * 1024 * 1024, // 500MB
  CLEANUP_THRESHOLD: 0.8, // 80%

  // Quality Settings
  TEXTURE_QUALITY: 1.0,
  SHADOW_QUALITY: 0.5,

  // Performance Settings
  TARGET_FPS: 60,
  MIN_FPS: 30,

  // Occlusion Culling Settings
  OCCLUSION_CHECK_INTERVAL: 100, // ms
  MAX_OCCLUSION_OBJECTS: 1000
};

// Asset Compression Configuration
export const ASSET_COMPRESSION_CONFIG = {
  images: {
    enableWebP: true,
    enableAVIF: true,
    webPQuality: 85,
    avifQuality: 80,
    fallbackFormat: 'png',
    maxWidth: 2048,
    maxHeight: 2048
  },

  models: {
    enableDracoCompression: true,
    enableMeshOptimization: true,
    targetVerticesPercentage: 0.8,
    normalQuality: 10,
    positionQuality: 14,
    texCoordQuality: 12,
    colorQuality: 8
  },

  audio: {
    enableCompression: true,
    targetBitrate: 128, // kbps
    sampleRate: 44100,
    channels: 2,
    formats: ['mp3', 'ogg', 'm4a']
  },

  textures: {
    enableMipmaps: true,
    enableASTC: true,
    enableETC2: true,
    maxAnisotropy: 16,
    compressionFormat: 'auto' // auto-detects best format
  }
};

// CDN Configuration
export const CDN_CONFIG = {
  enabled: process.env.NODE_ENV === 'production',
  primaryProvider: 'cloudflare', // cloudflare, aws, vercel

  cloudflare: {
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    baseUrl: 'https://cdn.bobyworld.com',
    regions: ['us-east-1', 'eu-west-1', 'asia-east-1']
  },

  aws: {
    cloudFrontDistributionId: process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-east-1',
    bucketName: 'boby-world-assets'
  },

  // Geo-routing and performance
  routing: {
    enableGeoBasedRouting: true,
    cacheTTL: 3600, // 1 hour
    staleWhileRevalidate: 86400 // 24 hours
  },

  // Preload priorities for different regions
  regionalPreload: {
    'US': ['america-assets.json'],
    'EU': ['europe-assets.json'],
    'AS': ['asia-assets.json'],
    'default': ['global-assets.json']
  }
};

// Build-time Asset Processing
export const BUILD_ASSET_PROCESSING = {
  enableBuildTimeCompression: true,
  enableAssetAnalysis: true,
  generateAssetManifest: true,

  optimization: {
    removeUnusedMaterials: true,
    mergeGeometries: true,
    optimizeAnimations: true,
    compressTextures: true
  },

  manifest: {
    includeFileSizes: true,
    includeETags: true,
    includeDependencies: true,
    generateSpritemaps: true
  },

  cdn: {
    uploadAfterBuild: process.env.NODE_ENV === 'production',
    invalidateOldAssets: true,
    generateCDNManifest: true
  }
};

export interface IntegrityCheck {
  path: string;
  expectedSHA256: string | undefined;
  expectedSize: number | undefined;
  actualSHA256: string | undefined;
  actualSize: number;
  isValid: boolean;
  lastChecked: number;
  error: string | undefined;
}

export interface IntegrityReport {
  totalChecked: number;
  passed: number;
  failed: number;
  checks: IntegrityCheck[];
  timestamp: number;
}

export interface ValidationResult {
  isValid: boolean;
  missingAssets: string[];
  corruptedAssets: string[];
  validAssets: string[];
  totalChecked: number;
  summary: {
    criticalMissing: number;
    highMissing: number;
    mediumMissing: number;
    lowMissing: number;
  };
}

export interface AssetHealthReport {
  overallHealth: "excellent" | "good" | "fair" | "poor" | "critical";
  healthPercentage: number;
  criticalAssetsLoaded: number;
  totalCriticalAssets: number;
  estimatedGameplayImpact: "none" | "minor" | "moderate" | "severe" | "unplayable";
  recommendations: string[];
}

export interface AssetMetadata {
  id: string;
  url: string;
  type: "model" | "texture" | "audio" | "ui";
  priority: number;
  estimatedSize: number; // KB
  dependencies?: string[];
  chunkCoords?: { x: number; z: number };
  lastAccessed: number;
  preloadDistance: number; // How far ahead to preload
}

export interface PreloadZone {
  centerX: number;
  centerZ: number;
  radius: number;
  assets: string[];
  priority: number;
}

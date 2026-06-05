export interface AssetInfo {
  path: string;
  type: "model" | "texture" | "audio" | "hdr";
  priority: "critical" | "high" | "medium" | "low";
  estimatedSizeMB: number;
  description: string;
  version?: string;
  sha256?: string;
  actualSizeMB?: number;
  lastModified?: string;
  compressionType?: "none" | "gzip" | "brotli";
}

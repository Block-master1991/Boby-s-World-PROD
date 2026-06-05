/**
 * Sampled log entry
 */
export interface SampledLogEntry {
  level: string;
  message: string;
  metadata?: Record<string, unknown> | undefined;
  correlationId?: string | undefined;
  timestamp: number;
}

/**
 * Sampling stats
 */
export interface SamplingStats {
  total: number;
  sampled: number;
  dropped: number;
  byLevel: Record<string, { total: number; sampled: number; dropped: number }>;
}

export interface SamplingConfig {
  enabled: boolean;
  rates?:
    | {
        trace?: number | undefined;
        debug?: number | undefined;
        info?: number | undefined;
        warn?: number | undefined;
        error?: number | undefined;
        fatal?: number | undefined;
      }
    | undefined;
  adaptiveSampling?: boolean | undefined;
  priorityRules?:
    | Array<{
        condition: (entry: SampledLogEntry) => boolean;
        rate: number;
      }>
    | undefined;
}

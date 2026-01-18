export type RedisStatus = 'connected' | 'disconnected' | 'error' | 'not_configured' | 'unknown';
export type SystemHealth = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface SuspiciousActivity {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  endpoint: string;
  ip: string;
  timestamp: string | number | Date;
}

export interface BlockedIp {
  ip: string;
  reason: string;
  blockedAt: string | number | Date;
}

export interface SecurityStats {
  redisStatus: RedisStatus;
  totalRequests: number;
  blockedRequests: number;
  suspiciousActivity: SuspiciousActivity[];
  blockedIps: BlockedIp[];
  systemHealth: SystemHealth;
  isPanicMode?: boolean;
}

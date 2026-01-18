/**
 * Log Encryption Types and Interfaces
 */

export interface EncryptionConfig {
    enabled: boolean;
    algorithm?: string;
    keyDerivation?: 'pbkdf2' | 'direct';
    encryptedFields?: string[];
    keyRotationDays?: number;
}

/**
 * Encrypted data structure
 */
export interface EncryptedData {
    encrypted: string;      // Base64 encoded encrypted data
    iv: string;            // Base64 encoded IV
    authTag: string;       // Base64 encoded auth tag
    algorithm: string;     // Algorithm used
    keyId?: string;        // Key identifier (for rotation)
    timestamp: number;     // Encryption timestamp
}

/**
 * Interface for LogEncryption class behavior
 */
export interface ILogEncryption {
    encrypt(data: string | object): EncryptedData | null;
    decrypt(encryptedData: EncryptedData): string | null;
    encryptFields<T>(data: T): T;
    decryptFields<T>(data: T): T;
    rotateKey(): void;
    updateConfig(config: Partial<EncryptionConfig>): void;
    getCurrentKeyId(): string;
}

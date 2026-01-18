/**
 * KMS Provider Interface
 * Interface for Key Management Service providers
 */

export interface KMSProvider {
    readonly name: string;
    readonly isHardwareBacked: boolean;

    /**
     * Generate a new key
     */
    generateKey(algorithm: AlgorithmIdentifier): Promise<CryptoKey>;

    /**
     * Encrypt data
     */
    encrypt(key: CryptoKey, data: Uint8Array): Promise<ArrayBuffer>;

    /**
     * Decrypt data
     */
    decrypt(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer>;

    /**
     * Securely clear the key
     */
    securelyClearKey(key: CryptoKey): Promise<void>;

    /**
     * Validate key integrity
     */
    validateIntegrity(key: CryptoKey): Promise<boolean>;
}

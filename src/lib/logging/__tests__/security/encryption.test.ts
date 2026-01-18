
/**
 * @jest-environment node
 */
import { LogEncryption } from '../../security/LogEncryption';

describe('LogEncryption', () => {
    const encryption = new LogEncryption({
        enabled: true
    });

    it('should encrypt data structure', async () => {
        const data = { message: 'secret' };
        const encrypted = await encryption.encrypt(data);

        expect(encrypted).toBeDefined();
        if (encrypted) {
            expect(encrypted.iv).toBeDefined();
            expect(encrypted.encrypted).toBeDefined(); // Correct property name from EncryptedData interface
        }
    });

    it('should handle decryption gracefully with mock', async () => {
        // Mock decryption
        const result = await encryption.decrypt({
            iv: '00',
            authTag: '00',
            encrypted: '00', // Changed data to encrypted
            algorithm: 'aes-256-gcm',
            timestamp: Date.now()
        });
        expect(result).toBeNull();
    });
});

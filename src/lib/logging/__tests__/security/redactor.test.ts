
import { PIIRedactor } from '../../security/PIIRedactor';

describe('PIIRedactor', () => {
    let redactor: PIIRedactor;

    beforeEach(() => {
        redactor = new PIIRedactor({
            enabled: true,
            strictMode: false
            // Default patterns will be used
        });
    });

    it('should redact emails', () => {
        expect(redactor.redact('Contact: test@example.com')).toBe('Contact: ***@***.***');
    });

    it('should redact credit card numbers', () => {
        const cc = '4111-1111-1111-1111';
        // Expect format like ****-****-****-1111
        const result = redactor.redact(`Payment: ${cc}`);
        expect(result).toContain('****-****-****-1111');
    });

    it('should redact IP addresses', () => {
        // 192.168.1.1 -> 192.***.***.***
        expect(redactor.redact('Source: 192.168.1.1')).toBe('Source: 192.***.***.***');
    });

    it('should redact sensitive keys in objects', () => {
        const data = {
            password: 'secret',
            token: 'xyz',
            user: {
                email: 'foo@bar.com'
            }
        };
        const redacted = redactor.redact(data) as any;
        expect(redacted.password).toBe('[REDACTED]');
        expect(redacted.token).toBe('[REDACTED]');
        // Note: The redactor replaces the value of the email field if the FIELD NAME is email?
        // Let's check implementation. 
        // Implementation: if (fieldName && isSensitive(fieldName)).
        // 'email' is NOT in SENSITIVE_FIELD_NAMES list in the code I saw (password, token, ssn, etc).
        // So it redacts the VALUE using string pattern matching.
        expect(redacted.user.email).toBe('***@***.***');
    });
});

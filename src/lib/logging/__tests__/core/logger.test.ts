
import { LoggerCore } from '../../core/LoggerCore';
import { LogLevel } from '../../core/LogLevel';

// Mock Pino
const mockPinoInstance = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis(),
    flush: jest.fn().mockResolvedValue(undefined)
};

jest.mock('pino', () => {
    const fn = jest.fn(() => mockPinoInstance);
    // Add static properties needed by LoggerCore
    Object.assign(fn, {
        stdSerializers: {
            err: (e: any) => e,
            req: (r: any) => r,
            res: (r: any) => r
        }
    });
    return fn;
});

// Mock dependencies
jest.mock('../../core/LogContext', () => ({
    contextManager: {
        getCurrentContext: jest.fn().mockReturnValue({ correlationId: 'test-id' }),
        createContext: jest.fn().mockImplementation((ctx) => ctx),
        runWithContext: jest.fn().mockImplementation((ctx, fn) => fn())
    }
}));

describe('LoggerCore', () => {
    let logger: LoggerCore;

    beforeEach(() => {
        jest.clearAllMocks();
        // Create fresh instance for each test
        logger = new LoggerCore({
            level: LogLevel.DEBUG,
            piiProtection: true,
            sanitization: true
        });
    });

    it('should initialize with correct config', () => {
        expect(logger).toBeInstanceOf(LoggerCore);
    });

    it('should log at different levels', () => {
        logger.info('info message');
        expect(mockPinoInstance.info).toHaveBeenCalledWith(expect.anything(), 'info message');

        logger.debug('debug message');
        expect(mockPinoInstance.debug).toHaveBeenCalledWith(expect.anything(), 'debug message');

        logger.warn('warn message');
        expect(mockPinoInstance.warn).toHaveBeenCalledWith(expect.anything(), 'warn message');
    });

    it('should include context in metadata', () => {
        logger.info('test context');

        // Pino is called with (metadata, message)
        const expectedMetadata = expect.objectContaining({
            correlationId: 'test-id'
        });
        expect(mockPinoInstance.info).toHaveBeenCalledWith(expectedMetadata, 'test context');
    });

    it('should handle errors correctly', () => {
        const error = new Error('test error');
        logger.error('failed op', error, { userId: '123' });

        expect(mockPinoInstance.error).toHaveBeenCalledWith(
            expect.objectContaining({
                err: error,
                userId: '123'
            }),
            'failed op'
        );
    });

    it('should sanitize PII', () => {
        // Assuming PII Redactor is enabled and email is 'test@example.com'
        logger.info('user login', { email: 'test@example.com' });

        expect(mockPinoInstance.info).toHaveBeenCalledWith(
            expect.objectContaining({
                email: '***@***.***' // Expect redaction
            }),
            'user login'
        );
    });

    it('should create child logger', () => {
        const child = logger.child({ module: 'test' });
        expect(mockPinoInstance.child).toHaveBeenCalledWith({ module: 'test' });
        expect(child).toBeInstanceOf(LoggerCore);
    });
});


import { LogQueryService } from '../../service/LogQueryService';
import { LogLevel } from '../../core/LogLevel';

describe('LogQueryService', () => {
    let service: LogQueryService;

    beforeEach(() => {
        service = LogQueryService.getInstance();
        // Reset backend if possible or just use a new one if public API allows
        // Since getInstance is a singleton, we need to be careful.
        // The implementation allows setBackend.
        // We can create a fresh memory backend.
        // service.setBackend(new MemoryLogStorage()); <-- Ideally if we imported MemoryLogStorage
        // Seeing as MemoryLogStorage is not exported index, we rely on default behavior but 
        // ingest new unique data for tests to avoid collision.
    });

    it('should ingest and retrieve logs', async () => {
        const uniqueMsg = `test log ${Date.now()}`;
        await service.ingest({
            timestamp: Date.now(),
            level: LogLevel.INFO,
            message: uniqueMsg,
            metadata: { CorrelationId: '1' }
        });

        const results = await service.search({ limit: 50, text: uniqueMsg });
        expect(results.logs.length).toBeGreaterThanOrEqual(1);
        expect(results.logs[0].message).toBe(uniqueMsg);
    });

    it('should filter by level', async () => {
        const ts = Date.now();
        await service.ingest({ timestamp: ts, level: LogLevel.INFO, message: 'info msg' });
        await service.ingest({ timestamp: ts, level: LogLevel.ERROR, message: 'error msg' });

        const results = await service.search({ level: 'error', limit: 10 });
        // Since singleton might have old logs, we filter results to find ours or just check we got some
        // Mock data generates random errors too.
        // Let's check that ALL returned logs are error
        const allErrors = results.logs.every(l => l.level === 'error');
        expect(allErrors).toBe(true);
    });

    it('should search by text', async () => {
        const unique = `needle_${Date.now()}`;
        await service.ingest({ timestamp: Date.now(), level: LogLevel.INFO, message: unique });

        const results = await service.search({ text: unique });
        expect(results.logs.length).toBe(1);
        expect(results.logs[0].message).toBe(unique);
    });
});

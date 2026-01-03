
import { BufferingMiddleware } from '../../middleware/BufferingMiddleware';
import { LogLevel } from '../../core/LogLevel';

describe('BufferingMiddleware', () => {
    let middleware: BufferingMiddleware;
    let flushSpy: jest.Mock;

    beforeEach(() => {
        jest.useFakeTimers();
        flushSpy = jest.fn();

        middleware = new BufferingMiddleware({
            maxSize: 3,
            flushInterval: 5000,
            enabled: true
        });
        middleware.onFlush(flushSpy);
    });

    afterEach(async () => {
        await middleware.destroy();
        jest.useRealTimers();
    });

    it('should buffer logs until batch size reached', async () => {
        const entry = { level: LogLevel.INFO.toString(), message: 'test', timestamp: Date.now() };

        // Log 1
        await middleware.add({ ...entry, message: '1' });
        expect(flushSpy).not.toHaveBeenCalled();

        // Log 2
        await middleware.add({ ...entry, message: '2' });
        expect(flushSpy).not.toHaveBeenCalled();

        // Log 3 (Hit batch size)
        await middleware.add({ ...entry, message: '3' });
        expect(flushSpy).toHaveBeenCalledTimes(1);
    });

    it('should flush on interval', async () => {
        await middleware.add({ level: LogLevel.INFO.toString(), message: '1', timestamp: Date.now() });
        expect(flushSpy).not.toHaveBeenCalled();

        // Fast forward time
        jest.advanceTimersByTime(5000);

        expect(flushSpy).toHaveBeenCalledTimes(1);
    });
});

// Background Processing Manager
import { logger } from 'utils/logger';

export class BackgroundProcessor {
    private tasks: Array<{
        id: string;
        task: () => Promise<void>;
        priority: number;
        timeout: number;
    }> = [];

    private isProcessing = false;
    private processingTimer: NodeJS.Timeout | null = null;

    // Add background task
    addTask(task: () => Promise<void>, priority = 1, timeout = 30000): string {
        const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.tasks.push({
            id,
            task,
            priority,
            timeout,
        });

        // Sort by priority (higher first)
        this.tasks.sort((a, b) => b.priority - a.priority);

        // Start processing if not already running
        if (!this.isProcessing) {
            this.startProcessing();
        }

        return id;
    }

    private async startProcessing(): Promise<void> {
        if (this.isProcessing || this.tasks.length === 0) return;

        this.isProcessing = true;

        while (this.tasks.length > 0) {
            const task = this.tasks.shift()!;
            const startTime = Date.now();

            try {
                let timerId: NodeJS.Timeout | undefined;
                // Create timeout promise
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timerId = setTimeout(() => reject(new Error('Task timeout')), task.timeout);
                });

                // Race between task and timeout
                // eslint-disable-next-line no-await-in-loop
                await Promise.race([
                    task.task().then(() => { if (timerId) clearTimeout(timerId); }),
                    timeoutPromise
                ]);

                const duration = Date.now() - startTime;
                logger.log(`[BackgroundProcessor] Task ${task.id} completed in ${duration}ms`);

            } catch (error) {
                logger.error(`[BackgroundProcessor] Task ${task.id} failed:`, error);
            }

            // Small delay between tasks to prevent blocking
            // eslint-disable-next-line no-await-in-loop
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.isProcessing = false;
    }

    // Get processing stats
    getStats() {
        return {
            queuedTasks: this.tasks.length,
            isProcessing: this.isProcessing,
        };
    }

    // Clear all pending tasks
    clearTasks(): void {
        this.tasks = [];
    }

    dispose(): void {
        this.clearTasks();
        if (this.processingTimer) {
            clearTimeout(this.processingTimer);
            this.processingTimer = null;
        }
    }
}

// Singleton instances
let backgroundProcessor: BackgroundProcessor | null = null;

export const initializeBackgroundProcessing = (): BackgroundProcessor => {
    if (!backgroundProcessor) {
        backgroundProcessor = new BackgroundProcessor();
    }
    return backgroundProcessor;
};

export const getBackgroundProcessor = (): BackgroundProcessor | null => {
    return backgroundProcessor;
};

export const addBackgroundTask = (
    task: () => Promise<void>,
    priority = 1,
    timeout = 30000
): string | null => {
    if (backgroundProcessor) {
        return backgroundProcessor.addTask(task, priority, timeout);
    }
    return null;
};

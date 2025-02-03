export { TaskManager } from './core/manager.js';
export { TaskQueue } from './core/queue.js';
export { Task } from './lib/task.js';

// Optionally export a preconfigured instance
export const defaultTaskManager = new TaskManager({
    maxRetries: 3,
    retryDelay: 5000,
    concurrency: 2
});
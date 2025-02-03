// src/services/tasks/core/manager.js
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import { TaskPersistenceManager } from '../utils/persistence.js';
import { TaskQueue } from './queue.js';
import { validateTask, validateTaskManager, TaskValidationError } from '../utils/validation.js';
import { ServiceConsumer } from '../../core/consumer.js';

export const TaskStatus = {
    RUNNING: 'RUNNING',
    QUEUED: 'QUEUED',
    NOT_FOUND: 'NOT_FOUND'
};

class TaskManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        try {
            validateTaskManager(options);
            
            this.options = {
                maxRetries: options.maxRetries || 3,
                retryDelay: options.retryDelay || 5000,
                concurrency: options.concurrency || 1,
                timeout: options.timeout || 300000
            };
            
            this.queue = new TaskQueue();
            this.running = true;  // Start running by default
            this.currentTask = null;
            this.persistenceManager = new TaskPersistenceManager();
            this.activeTaskCount = 0;
            this.initialized = false;
            this.serviceConsumer = new ServiceConsumer();

            this.setupEventListeners();
            
        } catch (error) {
            logger.error('Failed to initialize TaskManager:', error);
            throw error;
        }
    }

    async initialize(browserManager) {
        try {
            logger.info('Initializing task manager');

            // Set browser manager first
            if (browserManager) {
                await this.queue.setBrowserManager(browserManager);
                logger.info('Browser manager initialized for task queue');
            }

            // Initialize the persistence manager
            await this.persistenceManager.initialize();

            this.initialized = true;

            // Now load and start persistent tasks
            await this.loadAndStartPersistentTasks();

            logger.info('Task manager initialized');
            return true;
        } catch (error) {
            logger.error('Failed to initialize TaskManager:', error);
            throw error;
        }
    }

    async loadAndStartPersistentTasks() {
        if (!this.initialized) {
            logger.error('Cannot load tasks - TaskManager not initialized');
            return;
        }
    
        try {
            logger.info('Loading persistent tasks');
            const persistentTasks = await this.persistenceManager.loadPersistentTasks();
    
            logger.info(`Found ${persistentTasks.length} persistent tasks to load`);
            
            // Log details of each persistent task before processing
            persistentTasks.forEach((task, index) => {
                logger.info(`Persistent Task ${index + 1}:`, {
                    name: task.name,
                    type: task.type,
                    subType: task.subType,
                    identifier: task.identifier,
                    options: task.options
                });
            });
            
            for (const task of persistentTasks) {
                try {
                    validateTask(task);
                    
                    const taskStatus = this.getTaskStatus(task.id);
                    if (taskStatus.status === TaskStatus.NOT_FOUND) {
                        logger.info(`Adding persistent task to queue: ${task.name}`);
                        await this.addTask(task);
                    } else {
                        logger.info(`Persistent task ${task.name} is already in progress, skipping.`);
                    }
                } catch (validationError) {
                    logger.error(`Failed to validate persistent task ${task.name}:`, validationError);
                    continue;
                }
            }
    
            logger.info(`Attempted to start ${persistentTasks.length} persistent tasks`);
            
        } catch (error) {
            logger.error('Failed to load and start persistent tasks:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // When a task is added, start processing immediately
        this.queue.on('taskAdded', () => {
            if (this.running) {
                this.checkQueue();
            }
        });

        // Track task completion and failures
        this.queue.on('taskComplete', (task) => {
            this.activeTaskCount--;
            logger.info(`Task completed: ${task.name}`);
            this.checkQueue();
        });

        this.queue.on('taskFailed', (taskId, error) => {
            this.activeTaskCount--;
            logger.error(`Task failed: ${taskId}`, error);
            this.handleFailedTask(taskId, error);
            this.checkQueue();
        });
    }

    async checkQueue() {
        if (!this.running || this.activeTaskCount >= this.options.concurrency) {
            return;
        }
    
        const availableSlots = this.options.concurrency - this.activeTaskCount;
        const tasks = [];
        
        for (let i = 0; i < availableSlots; i++) {
            const task = this.queue.peek();
            if (task) {
                this.queue.remove(task.id);
                tasks.push(task);
            }
        }
    
        await Promise.all(tasks.map(task => this.processTask(task)));
    }

    async processTask(task) {
        this.activeTaskCount++;
        this.currentTask = task;

        try {
            logger.info(`Processing task: ${task.name} (Priority: ${task.options?.priority || 'normal'})`);

            let result;
            
            // Handle different task types
            switch(task.type) {
                case 'discord':
                    result = await this.handleDiscordTask(task);
                    break;
                case 'twitter-mentions':
                    result = await this.handleTwitterMentionTask(task);
                    break;
                case 'twitter':
                    result = await this.handleTwitterMonitorTask(task);
                    break;
                default:
                    // Default task execution with timeout
                    result = await Promise.race([
                        task.execute(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Task timeout')), this.options.timeout)
                        )
                    ]);
            }

            this.emit('taskComplete', task, result);
            return result;
        } catch (error) {
            this.emit('taskFailed', task, error);
            
            // Handle task-specific retry logic
            switch(task.type) {
                case 'discord':
                    await this.handleFailedDiscordTask(task, error);
                    break;
                case 'twitter-mentions':
                    await this.handleFailedMentionTask(task, error);
                    break;
                default:
                    await this.handleFailedTask(task, error);
            }
            return null;
        } finally {
            this.currentTask = null;
            this.activeTaskCount--;
            this.checkQueue();
        }
    }

    async handleDiscordTask(task) {
        try {
            logger.info(`Processing Discord task: ${task.name}`);
            
            // Use ServiceConsumer to get the Discord service
            const discordService = this.serviceConsumer.getService('discord');
            if (!discordService) {
                throw new Error('Discord service not available');
            }
    
            // Execute the task
            const result = await task.execute();
            
            // Schedule next execution if interval is set
            if (task.options.interval) {
                setTimeout(() => {
                    this.addTask(task);
                }, task.options.interval * 1000);
            }
    
            return result;
        } catch (error) {
            logger.error(`Discord task failed: ${task.name}`, error);
            throw error;
        }
    }
    async handleFailedDiscordTask(task, error) {
        task.retryCount = (task.retryCount || 0) + 1;
        const maxRetries = task.options.maxRetries || this.options.maxRetries;

        if (task.retryCount < maxRetries) {
            logger.info(`Retrying Discord task: ${task.name} (Attempt ${task.retryCount + 1}/${maxRetries})`);
            
            // Calculate backoff delay
            const backoffDelay = Math.min(
                this.options.retryDelay * Math.pow(2, task.retryCount - 1),
                300000 // Max 5 minutes
            );

            setTimeout(() => {
                this.addTask(task);
            }, backoffDelay);
        } else {
            logger.error(`Discord task failed permanently after ${maxRetries} retries:`, {
                task: task.name,
                error: error.message
            });
            this.emit('taskPermanentFailure', task, error);
        }
    }

    async handleTwitterMentionTask(task) {
        try {
            logger.info(`Processing Twitter mention monitor task: ${task.name}`);
            
            const twitterService = this.serviceConsumer.getService('twitter');
            if (!twitterService) {
                throw new Error('Twitter service not initialized');
            }
    
            // Execute the mention monitor task
            const result = await task.execute();
            
            // Schedule next execution
            if (task.options.interval) {
                setTimeout(() => {
                    this.addTask(task);
                }, task.options.interval * 1000);
            }
    
            return result;
        } catch (error) {
            logger.error(`Twitter mention monitor task failed: ${task.name}`, error);
            throw error;
        }
    }

    async handleFailedMentionTask(task, error) {
        task.retryCount = (task.retryCount || 0) + 1;
        const maxRetries = task.options.maxRetries || this.options.maxRetries;

        if (task.retryCount < maxRetries) {
            logger.info(`Retrying mention monitor task: ${task.name} (Attempt ${task.retryCount + 1}/${maxRetries})`);
            
            // Calculate backoff delay
            const backoffDelay = Math.min(
                this.options.retryDelay * Math.pow(2, task.retryCount - 1),
                300000 // Max 5 minutes
            );

            setTimeout(() => {
                this.addTask(task);
            }, backoffDelay);
        } else {
            logger.error(`Mention monitor task failed permanently after ${maxRetries} retries:`, {
                task: task.name,
                error: error.message
            });
            this.emit('taskPermanentFailure', task, error);
        }
    }

    async handleTwitterMonitorTask(task) {
        try {
            logger.info(`Processing Twitter monitor task: ${task.name}`);
            
            const twitterService = this.serviceConsumer.getService('twitter');
            if (!twitterService) {
                throw new Error('Twitter service not initialized');
            }
    
            // Execute the task using the retrieved service
            return await task.execute();
        } catch (error) {
            logger.error(`Twitter monitor task failed: ${task.name}`, error);
            throw error;
        }
    }

    async handleFailedTask(task, error) {
        // Increment the retry count and retry the task if possible, or emit the permanent failure event
        task.retryCount = (task.retryCount || 0) + 1;

        if (task.retryCount < this.options.maxRetries) {
            logger.info(`Retrying task: ${task.name} (Attempt ${task.retryCount + 1}/${this.options.maxRetries})`);
            setTimeout(() => {
                this.addTask(task);
            }, this.options.retryDelay);
        } else {
            logger.error(`Task failed permanently after ${this.options.maxRetries} retries:`, {
                task: task.name,
                error: error.message
            });
            this.emit('taskPermanentFailure', task, error);
        }
    }

    async addTask(task, priority = 'normal') {
        if (!this.initialized) {
            logger.error('Cannot add task - TaskManager not initialized');
            return null;
        }

        if (!task.id) {
            task.id = Math.random().toString(36).substr(2, 9);
        }
        
        validateTask(task);
        
        task.options = {
            ...task.options,
            priority
        };

        const sessionId = await this.queue.add(task);
        
        if (sessionId) {
            this.emit('taskAdded', task);
        }
        
        return sessionId;
    }

    addPriorityTask(task) {
        return this.addTask(task, 'high');
    }

    removeTask(taskId) {
        // Remove a task from the queue by its ID
        return this.queue.remove(taskId);
    }

    getTaskStatus(taskId) {
        // Get the status of a task by its ID
        if (this.currentTask && this.currentTask.id === taskId) {
            return { status: TaskStatus.RUNNING, task: this.currentTask };
        }

        const queuedTask = this.queue.getAll().find(task => task.id === taskId);
        if (queuedTask) {
            return { status: TaskStatus.QUEUED, task: queuedTask };
        }

        return { status: TaskStatus.NOT_FOUND, task: null };
    }

    getQueueStatus() {
        // Get the current status of the task queue
        return {
            running: this.running,
            activeTaskCount: this.activeTaskCount,
            queueSize: this.queue.size(),
            currentTask: this.currentTask,
            queuedTasks: this.queue.getAll()
        };
    }

    async start() {
        // Start the task manager if it's not already running
        if (this.running) return;
        this.running = true;
        logger.info('Task manager started');
        this.checkQueue();
    }

    async stop() {
        // Stop the task manager
        this.running = false;
        logger.info('Task manager stopped');
    }

    async cleanup() {
        // Stop the task manager, clear the queue, and remove all event listeners
        await this.stop();
        this.queue.clear();
        this.removeAllListeners();
        logger.info('Task manager cleaned up');
    }
}

// Create a singleton instance
const taskManager = new TaskManager();

// Export both the class and the singleton instance
export { TaskManager, taskManager };
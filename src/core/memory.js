import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { PostgresStorageManager } from '../utils/storage/postgres.js';
import { ServiceConsumer } from './services.js';

/**
 * Memory Cache for fast retrieval
 */
class MemoryCache {
    constructor(options = {}) {
        this.cache = new Map();
        this.maxSize = options.maxSize || 1000;
        this.ttl = options.ttl || 1000 * 60 * 5; // 5 minutes
    }

    set(key, value) {
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.value;
    }
}

/**
 * Core Memory System
 */
class MemorySystem extends EventEmitter {
    static instance = null;

    static getInstance(dependencies) {
        if (!MemorySystem.instance) {
            MemorySystem.instance = new MemorySystem(dependencies);
        }
        return MemorySystem.instance;
    }

    constructor(dependencies) {
        if (MemorySystem.instance) {
            return MemorySystem.instance;
        }
        super();

        // Initialize service consumer
        this.serviceConsumer = new ServiceConsumer();

        // Core dependencies
        this.engine = dependencies.engine;
        this.serviceManager = dependencies.serviceManager || this.serviceConsumer.serviceManager;

        // Initialize storage managers
        this.postgresManager = new PostgresStorageManager();

        // Initialize cache
        this.cache = new MemoryCache({ maxSize: 1000, ttl: 300000 }); // 5 minutes TTL

        this.initialized = false;
        MemorySystem.instance = this;

        // Sync Configuration
        this.syncConfig = {
            syncInterval: 1000 * 60 * 5, // 5 minutes
            batchSize: 100,
            retryAttempts: 3
        };
    }

    async initialize() {
        if (this.initialized) {
            logger.info('Memory System already initialized, skipping...');
            return;
        }

        try {
            // Initialize storage managers
            await this.postgresManager.initialize();

            this.initialized = true;
            this.emit('memorySystemReady');
            logger.info('Memory System initialized successfully');
        } catch (error) {
            logger.error('Memory System initialization failed:', error);
            this.emit('initializationError', error);
            throw error;
        }
    }

    async store(memory, options = {}) {
        const {
            type = 'default',
            tags = [],
            metadata = {},
            ttl = null,
            storageLocation = 'default'
        } = options;

        try {
            // Generate a UUID
            const uuid = uuidv4();

            // Properly construct the storage path
            const basePath = 'memories';
            const fullPath = memory.path
                ? `${basePath}/${memory.path}`
                : `${basePath}/${storageLocation}/${type}`;

            const memoryEntry = {
                id: uuid,
                path: fullPath,
                content: memory,
                type,
                tags,
                timestamp: new Date().toISOString(),
                metadata: {
                    ...metadata,
                    ttl: ttl ? Date.now() + ttl : null,
                    storageLocation
                }
            };

            // Store in PostgreSQL
            await this.postgresManager.storeMemory(memoryEntry);

            this.cache.set(uuid, memoryEntry);

            return {
                uuid,
                path: fullPath
            };
        } catch (error) {
            logger.error('Memory storage failed:', error);
            throw error;
        }
    }

    async retrieve(query, options = {}) {
        const {
            type = null,
            tags = [],
            maxResults = 10
        } = options;

        try {
            // Retrieve from PostgreSQL
            const memories = await this.postgresManager.retrieveMemories(query, {
                type,
                tags,
                limit: maxResults
            });

            return memories;
        } catch (error) {
            logger.error('Memory retrieval failed:', error);
            throw error;
        }
    }

    async retrieveFromStorage(id) {
        try {
            // Fallback to PostgreSQL
            const memory = await this.postgresManager.retrieveMemory(id);
            if (memory) {
                this.cache.set(id, memory);
            }

            return memory;
        } catch (error) {
            logger.error('Failed to retrieve memory from storage:', error);
            return null;
        }
    }

    async cleanup() {
        try {
            // Clear caches
            this.cache.clear?.();

            // Clean up storage managers
            await this.postgresManager.cleanup?.();

            // Reset the singleton
            MemorySystem.instance = null;
            this.initialized = false;

            logger.info('Memory System cleaned up successfully');
        } catch (error) {
            logger.error('Memory System cleanup failed:', error);
        }
    }

    getStats() {
        return {
            cache: {
                size: this.cache.cache.size,
                maxSize: this.cache.maxSize
            }
        };
    }
}

export default MemorySystem;
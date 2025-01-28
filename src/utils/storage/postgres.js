import pg from 'pg';
import { logger } from '../logger.js';
import { DatabaseMigrationService } from '../../core/services/database.js';
import { config } from 'dotenv';
// Initialize dotenv
config();

const { Pool } = pg;

/**
 * Utility class for managing PostgreSQL storage operations
 */
export class PostgresStorageManager {
    constructor(config = {}) {
        this.config = {
            user: config.user || process.env.POSTGRES_USER,
            host: config.host || process.env.POSTGRES_HOST,
            database: config.database || process.env.POSTGRES_DB,
            password: config.password || process.env.POSTGRES_PASSWORD,
            port: parseInt(config.port || process.env.POSTGRES_PORT || '5432', 10)
        };

        this.pool = new Pool(this.config);
        this.poolEnded = false; // Track if pool is closed
        this.migrationService = new DatabaseMigrationService(this.config);
    }

    /**
     * Initialize the database connection and run migrations
     */
    async initialize() {
        try {
            await this.migrationService.initialize();
            await this.testConnection();
            await this.ensureTablesExist();
            
            logger.info('✅ PostgreSQL storage manager initialized successfully');
        } catch (error) {
            logger.error('❌ PostgreSQL initialization failed:', error);
            throw error;
        }
    }

    /**
 * Get all memories with their metadata
 */
async getAllMemoriesWithMetadata() {
    const client = await this.pool.connect();
    try {
        const result = await client.query(`
            SELECT 
                id, 
                type, 
                metadata, 
                embedding
            FROM memories
        `);

        // Parse metadata if it's a string
        return result.rows.map(row => {
            if (typeof row.metadata === 'string') {
                try {
                    row.metadata = JSON.parse(row.metadata);
                } catch (parseError) {
                    logger.warn(`Failed to parse metadata for memory ${row.id}:`, parseError);
                    row.metadata = {};
                }
            }
            return row;
        });
    } catch (error) {
        logger.error('Failed to retrieve memories with metadata:', error);
        throw error;
    } finally {
        client.release();
    }
}
    /**
     * Test database connection
     */
    async testConnection() {
        const client = await this.pool.connect();
        try {
            await client.query('SELECT NOW()');
            logger.info('✅ PostgreSQL connection test successful');
        } catch (error) {
            logger.error('❌ PostgreSQL connection test failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Ensure all required tables exist
     */
    async ensureTablesExist() {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
    
            // Create chat_sessions table
            await client.query(`
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id SERIAL PRIMARY KEY,
                    chat_id UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    metadata JSONB
                );
            `);
    
            // Create chat_messages table
            await client.query(`
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id SERIAL PRIMARY KEY,
                    chat_id UUID REFERENCES chat_sessions(chat_id) ON DELETE CASCADE,
                    sender VARCHAR(50) NOT NULL,
                    message TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            `);
    
            await client.query('COMMIT');
            logger.info('✅ Chat-related tables verified');
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('❌ Table verification failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

/**
 * Create a new chat session
 * @returns {Promise<string>} The UUID of the newly created chat session
 */
async createChatSession() {
    const client = await this.pool.connect();
    try {
        const result = await client.query(`
            INSERT INTO chat_sessions DEFAULT VALUES
            RETURNING chat_id
        `);

        if (result.rows.length === 0) {
            throw new Error('Failed to create chat session');
        }

        const chatId = result.rows[0].chat_id;
        logger.info(`✅ Chat session created successfully with ID: ${chatId}`);
        return chatId;
    } catch (error) {
        logger.error('❌ Error creating chat session:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Save a chat message to the database
 * @param {string} chatId - The ID of the chat session
 * @param {string} sender - The sender of the message ('user' or 'ai')
 * @param {string} message - The message content
 * @returns {Promise<void>}
 */
async saveChatMessage(chatId, sender, message) {
    const client = await this.pool.connect();
    try {
        await client.query(`
            INSERT INTO chat_messages (chat_id, sender, message)
            VALUES ($1, $2, $3)
        `, [chatId, sender, message]);

        logger.info(`✅ Chat message saved for session ${chatId}`);
    } catch (error) {
        logger.error('❌ Error saving chat message:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Fetch chat history for a session
 * @param {string} chatId - The ID of the chat session
 * @returns {Promise<Array<{sender: string, message: string}>>} The chat history
 */
async getChatHistory(chatId) {
    const client = await this.pool.connect();
    try {
        const result = await client.query(`
            SELECT sender, message
            FROM chat_messages
            WHERE chat_id = $1
            ORDER BY timestamp ASC
        `, [chatId]);

        return result.rows;
    } catch (error) {
        logger.error('❌ Error fetching chat history:', error);
        throw error;
    } finally {
        client.release();
    }
}

async getAllChatSessions() {
    const client = await this.pool.connect();
    try {
        // Corrected query to use the chat_sessions table
        const query = 'SELECT chat_id FROM chat_sessions ORDER BY created_at DESC';
        const result = await client.query(query);
        return result.rows.map(row => row.chat_id);
    } catch (error) {
        logger.error('❌ Error fetching chat sessions:', error);
        throw error;
    } finally {
        client.release();
    }
}

async deleteEmptyChatSessions() {
    const client = await this.pool.connect();
    try {
        // Query to delete chat sessions with no associated messages
        const query = `
            DELETE FROM chat_sessions cs
            WHERE NOT EXISTS (
                SELECT 1 
                FROM chat_messages cm 
                WHERE cm.chat_id = cs.chat_id
            )
            RETURNING chat_id;
        `;
        const result = await client.query(query);
        logger.info(`✅ Deleted ${result.rowCount} empty chat sessions`);
        return result.rowCount;
    } catch (error) {
        logger.error('❌ Error deleting empty chat sessions:', error);
        throw error;
    } finally {
        client.release();
    }
}
    /**
     * Store a single memory with its embedding
     */
    async storeMemory(memory, embedding) {
        const client = await this.pool.connect();
        try {
            await client.query(
                `INSERT INTO memories 
                (id, content, type, tags, timestamp, metadata, embedding, source) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO UPDATE 
                SET content = EXCLUDED.content, 
                    type = EXCLUDED.type, 
                    tags = EXCLUDED.tags,
                    metadata = EXCLUDED.metadata,
                    embedding = EXCLUDED.embedding`,
                [
                    memory.id,
                    memory.content,
                    memory.type,
                    memory.tags,
                    memory.timestamp,
                    JSON.stringify(memory.metadata),
                    embedding,
                    memory.source
                ]
            );
            return true;
        } catch (error) {
            logger.error('PostgreSQL memory storage failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Store multiple memories in a transaction
     */
    async storeMemoryBatch(memories, embeddings) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            for (let i = 0; i < memories.length; i++) {
                const memory = memories[i];
                const embedding = embeddings[i];

                await client.query(
                    `INSERT INTO memories 
                    (id, content, type, tags, timestamp, metadata, embedding, source) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (id) DO UPDATE 
                    SET content = EXCLUDED.content, 
                        type = EXCLUDED.type, 
                        tags = EXCLUDED.tags,
                        metadata = EXCLUDED.metadata,
                        embedding = EXCLUDED.embedding`,
                    [
                        memory.id,
                        memory.content,
                        memory.type,
                        memory.tags,
                        memory.timestamp,
                        JSON.stringify(memory.metadata),
                        embedding,
                        memory.source
                    ]
                );
            }

            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Batch PostgreSQL storage failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Query memories with vector similarity search
     */
    async queryMemoriesByEmbedding(embedding, options = {}) {
        const {
            limit = 10,
            minSimilarity = 0.6,
            type = null,
            tags = []
        } = options;

        const client = await this.pool.connect();
        try {
            let query = `
                SELECT *, 
                    1 - (embedding <=> $1::float[]) as similarity
                FROM memories
                WHERE 1 - (embedding <=> $1::float[]) >= $2
            `;
            
            const params = [embedding, minSimilarity];
            let paramCount = 3;

            if (type) {
                query += ` AND type = $${paramCount}`;
                params.push(type);
                paramCount++;
            }

            if (tags.length > 0) {
                query += ` AND tags @> $${paramCount}`;
                params.push(tags);
                paramCount++;
            }

            query += ` ORDER BY similarity DESC LIMIT $${paramCount}`;
            params.push(limit);

            const result = await client.query(query, params);
            return result.rows;
        } catch (error) {
            logger.error('Vector similarity query failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Load vectors for the HNSW index initialization
     */
    async loadVectorIndex() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT id, embedding, metadata,
                       type, tags, source
                FROM memories 
                WHERE embedding IS NOT NULL
                ORDER BY timestamp DESC
            `);

            logger.info(`Retrieved ${result.rows.length} vectors from database`);
            return result.rows;
        } catch (error) {
            logger.error('Failed to load vectors from database:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Retrieve memory by ID
     */
    async retrieveMemory(id) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT * FROM memories WHERE id = $1',
                [id]
            );
            
            if (result.rows.length === 0) {
                return null;
            }

            const memory = result.rows[0];
            if (typeof memory.metadata === 'string') {
                try {
                    memory.metadata = JSON.parse(memory.metadata);
                } catch (parseError) {
                    logger.warn(`Failed to parse metadata for memory ${id}:`, parseError);
                    memory.metadata = {};
                }
            }

            return memory;
        } catch (error) {
            logger.error(`Failed to retrieve memory ${id}:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get all memory IDs from database
     */
    async getAllMemoryIds() {
        const client = await this.pool.connect();
        try {
            logger.debug('Fetching all memory IDs from database');
            const result = await client.query('SELECT id FROM memories');
            const ids = new Set(result.rows.map(row => row.id));
            logger.debug(`Retrieved ${ids.size} memory IDs`);
            return ids;
        } catch (error) {
            logger.error('Failed to get memory IDs:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get memory statistics
     */
    async getMemoryStats() {
        const client = await this.pool.connect();
        try {
            const stats = await client.query(`
                SELECT 
                    COUNT(*) as total_memories,
                    COUNT(DISTINCT type) as unique_types,
                    COUNT(DISTINCT source) as unique_sources,
                    COUNT(NULLIF(embedding IS NULL, true)) as memories_with_embeddings
                FROM memories
            `);
            
            return stats.rows[0];
        } catch (error) {
            logger.error('Failed to get memory stats:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Clean up expired memories
     */
    async cleanupExpiredMemories() {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            
            const result = await client.query(`
                DELETE FROM memories 
                WHERE metadata->>'ttl' IS NOT NULL 
                AND (metadata->>'ttl')::bigint < $1
                RETURNING id
            `, [Date.now()]);
            
            await client.query('COMMIT');
            
            logger.info(`Cleaned up ${result.rowCount} expired memories`);
            return result.rows.map(row => row.id);
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to cleanup expired memories:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get memory IDs by type
     */
    async getMemoryIdsByType(type) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT id FROM memories WHERE type = $1',
                [type]
            );
            return new Set(result.rows.map(row => row.id));
        } catch (error) {
            logger.error(`Failed to get memory IDs for type ${type}:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete memories by IDs
     */
    async deleteMemories(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            
            const result = await client.query(
                'DELETE FROM memories WHERE id = ANY($1::text[])',
                [ids]
            );
            
            await client.query('COMMIT');
            
            logger.info(`Deleted ${result.rowCount} memories`);
            return result.rowCount;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to delete memories:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update memory metadata
     */
    async updateMemoryMetadata(id, metadata) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `UPDATE memories 
                 SET metadata = metadata || $2::jsonb 
                 WHERE id = $1
                 RETURNING *`,
                [id, JSON.stringify(metadata)]
            );
            
            if (result.rows.length === 0) {
                logger.warn(`Memory ${id} not found for metadata update`);
                return null;
            }
            
            return result.rows[0];
        } catch (error) {
            logger.error(`Failed to update metadata for memory ${id}:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Save vector index state
     */
    async saveVectorIndexState(indexState) {
        const client = await this.pool.connect();
        try {
            await client.query(
                `INSERT INTO system_state (key, value)
                VALUES ('vector_index', $1)
                ON CONFLICT (key) DO UPDATE
                SET value = EXCLUDED.value`,
                [JSON.stringify(indexState)]
            );
        } catch (error) {
            logger.error('Failed to save vector index state:', error);
            throw error;
        } finally {
            client.release();
        }
    }
    
    async cleanup() {
        try {
          await this.migrationService.cleanup();
    
          if (!this.poolEnded) {
            await this.pool.end();
            this.poolEnded = true;
            logger.info('PostgreSQL manager cleaned up successfully');
          } else {
            logger.warn('PostgreSQL pool already ended, skipping...');
          }
        } catch (error) {
          logger.error('PostgreSQL cleanup failed:', error);
          throw error;
        }
      }
    }
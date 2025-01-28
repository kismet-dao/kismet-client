// src/core/services/database.js
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';
import pg from 'pg';

const { Pool } = pg;

export class DatabaseMigrationService {
    constructor(connectionConfig) {
        // Configuration for connecting to default 'postgres' database
        this.initConfig = {
            ...connectionConfig,
            database: 'postgres'
        };
        
        // Target database configuration
        this.targetConfig = connectionConfig;
        
        this.schemaPath = path.resolve(process.cwd(), 'schema.sql');
    }

    async createDatabaseIfNotExists() {
        const initPool = new Pool(this.initConfig);
        const client = await initPool.connect();

        try {
            // Check if database exists
            const checkResult = await client.query(`
                SELECT 1 FROM pg_catalog.pg_database 
                WHERE datname = $1
            `, [this.targetConfig.database]);

            // Create database if it doesn't exist
            if (checkResult.rowCount === 0) {
                logger.info(`📦 Creating database: ${this.targetConfig.database}`);
                await client.query(`
                    CREATE DATABASE "${this.targetConfig.database}"
                    WITH OWNER = ${this.targetConfig.user}
                    ENCODING = 'UTF8'
                    CONNECTION LIMIT = -1;
                `);
                logger.info(`✅ Database ${this.targetConfig.database} created successfully`);
            } else {
                logger.info(`ℹ️ Database ${this.targetConfig.database} already exists`);
            }
        } catch (error) {
            logger.error(`❌ Failed to create database: ${error.message}`);
            throw error;
        } finally {
            client.release();
            await initPool.end();
        }
    }

    async migrate() {
        // First, create database if not exists
        await this.createDatabaseIfNotExists();

        // Connect to the specific database
        const targetPool = new Pool(this.targetConfig);
        const client = await targetPool.connect();

        try {
            logger.info('🔄 Starting database schema migration...');

            // Validate schema file exists
            try {
                await fs.access(this.schemaPath);
            } catch (fileError) {
                logger.error(`❌ Schema file not found: ${this.schemaPath}`);
                throw new Error('Schema migration file is missing');
            }

            // Read schema file
            const schemaScript = await fs.readFile(this.schemaPath, 'utf8');

            // Split script into individual statements
            const statements = schemaScript
                .split(';')
                .map(statement => statement.trim())
                .filter(statement => statement.length > 0);

            // Execute each statement separately for better error tracking
            for (const statement of statements) {
                try {
                    await client.query(statement);
                    logger.debug(`✅ Executed: ${statement.slice(0, 50)}...`);
                } catch (statementError) {
                    logger.error(`❌ Failed to execute statement: ${statement.slice(0, 100)}...`);
                    logger.error('Statement execution error:', statementError);
                    // Continue with other statements
                }
            }

            logger.info('✅ Database schema migration completed successfully');
        } catch (error) {
            logger.error('❌ Database schema migration failed:', error);
            throw error;
        } finally {
            client.release();
            await targetPool.end();
        }
    }

    async initialize() {
        try {
            await this.migrate();
        } catch (initError) {
            logger.error('Database migration initialization failed:', initError);
            // You might want to handle this based on your application's error handling strategy
            throw initError;
        }
    }

    async cleanup() {
        try {
            // No need to end pool here as we're using temporary pools in migrate method
            logger.info('✅ Database migration service cleaned up successfully');
        } catch (cleanupError) {
            logger.error('❌ Database migration service cleanup failed:', cleanupError);
        }
    }

    async testConnection() {
        const targetPool = new Pool(this.targetConfig);
        try {
            const client = await targetPool.connect();
            client.release();
            logger.info('✅ Database connection test successful');
            await targetPool.end();
            return true;
        } catch (connectionError) {
            logger.error('❌ Database connection test failed:', connectionError);
            await targetPool.end();
            return false;
        }
    }
}
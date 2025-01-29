// src/errors/databaseErrorHandler.js
import { logger } from '../utils/logger.js';

export class DatabaseConnectionError extends Error {
    constructor(message, originalError) {
        super(message);
        this.name = 'DatabaseConnectionError';
        this.originalError = originalError;
    }
}

export function handleDatabaseConnectionError(error) {
    const errorMessages = {
        base: '❌ Failed to connect to PostgreSQL database. Please check:',
        checks: [
            '1. Is PostgreSQL running?',
            '2. Check your PostgreSQL port in your .env file:',
            `   Current attempted port: ${process.env.POSTGRES_PORT || '5432'}`,
            '3. Verify your .env configuration:',
            '   POSTGRES_USER=your_username',
            '   POSTGRES_PASSWORD=your_password',
            '   POSTGRES_DB=your_database',
            '   POSTGRES_HOST=localhost',
            '   POSTGRES_PORT=5432'
        ]
    };

    // Add specific error information
    if (error.code === 'ECONNREFUSED') {
        errorMessages.checks.push(
            `\n⚠️ Connection refused on port ${error.port || process.env.POSTGRES_PORT || '5432'}:`,
            '• To start PostgreSQL: brew services start postgresql',
            '• Check if PostgreSQL is running on a different port:',
            '  psql -c "SHOW port;"'
        );
    }

    // Log formatted error message
    logger.error('\n' + errorMessages.base);
    errorMessages.checks.forEach(check => logger.error(check));
    
    throw new DatabaseConnectionError(
        'Database connection failed. Check logs for troubleshooting steps.',
        error
    );
}

export function validateDatabaseConfig(config) {
    const requiredFields = ['user', 'host', 'database', 'port'];
    const missingFields = requiredFields.filter(field => !config[field]);
    
    if (missingFields.length > 0) {
        const message = `Missing required database configuration: ${missingFields.join(', ')}`;
        logger.error(message);
        throw new DatabaseConnectionError(message);
    }
}
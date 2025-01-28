import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../../resources/logs');
        this.logFile = path.join(this.logDir, 'app.log');
        this.maxWidth = 80;
        
        // Log level configuration
        this.LOG_LEVELS = {
            none: 0,
            error: 1,
            info: 2,
            debug: 3
        };
        
        // Default to info level
        this.currentLevel = this.LOG_LEVELS.info;
        this.debugMode = false;
        
        // Initialize log directory
        this.initializeLogDir();
    }

    async initializeLogDir() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create log directory:', error);
        }
    }

    setLevel(level) {
        const normalizedLevel = level.toLowerCase();
        if (this.LOG_LEVELS.hasOwnProperty(normalizedLevel)) {
            this.currentLevel = this.LOG_LEVELS[normalizedLevel];
            this.debugMode = normalizedLevel === 'debug';
        }
    }
    
    shouldLog(level) {
        return this.LOG_LEVELS[level] <= this.currentLevel;
    }

    wrapText(text, maxWidth) {
        if (text.length <= maxWidth) {
            return [text];
        }

        const lines = [];
        let remainingText = text.trim();

        while (remainingText.length > maxWidth) {
            let breakIndex = remainingText.lastIndexOf(' ', maxWidth);
            
            if (breakIndex === -1 || breakIndex < maxWidth / 2) {
                breakIndex = maxWidth;
            }

            lines.push(remainingText.slice(0, breakIndex).trimRight());
            remainingText = remainingText.slice(breakIndex).trimLeft();
        }

        if (remainingText) {
            lines.push(remainingText);
        }

        return lines;
    }

    async writeToFile(message) {
        try {
            await fs.appendFile(this.logFile, message + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    formatMessage(level, message, context = {}) {
        const timestamp = new Date().toISOString();
        const contextStr = Object.keys(context).length ? 
            ` | ${JSON.stringify(context)}` : '';
        
        const baseMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
        
        if (baseMessage.length > this.maxWidth) {
            const wrappedLines = this.wrapText(baseMessage, this.maxWidth);
            return wrappedLines.join('\n');
        }
        return baseMessage;
    }

    info(message, context = {}) {
        if (this.shouldLog('info')) {
            const formatted = this.formatMessage('INFO', message, context);
            console.log(chalk.blue('ℹ'), chalk.blue(formatted));
            this.writeToFile(formatted);
        }
    }

    success(message, context = {}) {
        if (this.shouldLog('info')) {
            const formatted = this.formatMessage('SUCCESS', message, context);
            console.log(chalk.green('✔'), chalk.green(formatted));
            this.writeToFile(formatted);
        }
    }

    warn(message, context = {}) {
        if (this.shouldLog('info')) {
            const formatted = this.formatMessage('WARN', message, context);
            console.log(chalk.yellow('⚠'), chalk.yellow(formatted));
            this.writeToFile(formatted);
        }
    }

    error(message, error = null, context = {}) {
        if (this.shouldLog('error')) {
            if (error) {
                context.error = {
                    message: error.message,
                    stack: this.debugMode ? error.stack : undefined
                };
            }
            const formatted = this.formatMessage('ERROR', message, context);
            console.log(chalk.red('✖'), chalk.red(formatted));
            this.writeToFile(formatted);
        }
    }

    debug(message, context = {}) {
        if (this.shouldLog('debug')) {
            const formatted = this.formatMessage('DEBUG', message, context);
            console.log(chalk.gray('🔍'), chalk.gray(formatted));
            this.writeToFile(formatted);
        }
    }

    // Special event logging methods - these follow info level
    twitterEvent(message, context = {}) {
        if (this.shouldLog('info')) {
            const formatted = this.formatMessage('TWITTER', message, context);
            console.log(chalk.cyan('🐦'), chalk.cyan(formatted));
            this.writeToFile(formatted);
        }
    }

    transaction(message, context = {}) {
        if (this.shouldLog('info')) {
            const formatted = this.formatMessage('TRANSACTION', message, context);
            console.log(chalk.magenta('💰'), chalk.magenta(formatted));
            this.writeToFile(formatted);
        }
    }

    async clearLogs() {
        try {
            await fs.writeFile(this.logFile, '');
            this.info('Logs cleared successfully');
        } catch (error) {
            this.error('Failed to clear logs', error);
        }
    }

    async getLogs(limit = 100) {
        try {
            const content = await fs.readFile(this.logFile, 'utf8');
            const lines = content.split('\n').filter(Boolean);
            return lines.slice(-limit);
        } catch (error) {
            this.error('Failed to read logs', error);
            return [];
        }
    }

    getCurrentLevel() {
        return Object.keys(this.LOG_LEVELS).find(
            key => this.LOG_LEVELS[key] === this.currentLevel
        );
    }

    getLogLevelStatus() {
        const current = this.getCurrentLevel();
        return {
            current,
            available: Object.keys(this.LOG_LEVELS),
            debugMode: this.debugMode
        };
    }
}

// Create and export singleton instance
export const logger = new Logger();

// Export class for testing or if multiple instances are needed
export default Logger;
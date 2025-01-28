import { logger } from '../../utils/logger.js';
import { WebSocketClient } from '../../clients/websocket/client.js';

export class WebSocketService {
    constructor(options = {}) {
        this.options = options;
        this.client = null;
        this.eventHandlers = new Map();
        this.connectionState = {
            attemptInProgress: false,
            currentStage: 'disconnected',
            lastError: null,
            reconnectCount: 0,
            backoffDelay: options.initialBackoffDelay || 1000,
            maxBackoffDelay: options.maxBackoffDelay || 30000,
            maxReconnectAttempts: options.maxReconnectAttempts || 5
        };
        this.activeCharacter = null;
        this.messageQueue = [];
        this.connectionPromise = null;
        this.isCleaningUp = false;
    }

    async initialize() {
        try {
            logger.info('🌐 Initializing WebSocket service...');
            const url = process.env.WEBSOCKET_AGENTS_URL;
            
            if (!url) {
                throw new Error('No WebSocket URL provided for agents');
            }

            await this.establishConnection(url);
            logger.info('✅ WebSocket service initialized successfully');
            
            // Register cleanup handler for process termination
            process.on('SIGTERM', () => this.cleanup());
            process.on('SIGINT', () => this.cleanup());
            
            if (this.activeCharacter) {
                await this.broadcastActiveCharacter(this.activeCharacter);
            }
        } catch (error) {
            logger.error('❌ Failed to initialize WebSocket service:', error);
            throw error;
        }
    }

    async establishConnection(url) {
        if (this.connectionState.attemptInProgress || this.isCleaningUp) {
            return this.connectionPromise;
        }

        this.connectionPromise = this._connect(url);
        return this.connectionPromise;
    }

    async establishConnection(url) {
        if (this.connectionState.attemptInProgress) {
            return this.connectionPromise;
        }

        this.connectionPromise = this._connect(url);
        return this.connectionPromise;
    }

    async _connect(url) {
        this.connectionState.attemptInProgress = true;
        this.connectionState.currentStage = 'connecting';

        try {
            while (this.connectionState.reconnectCount < this.connectionState.maxReconnectAttempts) {
                try {
                    await this._attemptConnection(url);
                    return this.client;
                } catch (error) {
                    await this._handleConnectionFailure(error);
                }
            }
            throw new Error(`Failed to establish connection after ${this.connectionState.maxReconnectAttempts} attempts`);
        } finally {
            this.connectionState.attemptInProgress = false;
            this.connectionPromise = null;
        }
    }

    async _attemptConnection(url) {
        if (this.client) {
            this.client.removeAllListeners();
            await this._cleanupExistingConnection();
        }

        this.client = new WebSocketClient({
            url,
            ...this.options,
            reconnectAttempts: 1
        });

        await this._setupConnection();
    }

    async _setupConnection() {
        return new Promise((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
                reject(new Error('Connection setup timeout'));
            }, this.options.timeout || 10000);

            this._setupEventHandlers(resolve, reject);

            this.client.connect().catch(error => {
                clearTimeout(connectionTimeout);
                reject(error);
            });
        });
    }

    _setupEventHandlers(resolve, reject) {
        const handlers = {
            open: () => {
                this._handleSuccessfulConnection();
                this._processMessageQueue();
                resolve(this.client);
            },
            error: (error) => {
                this._handleConnectionError(error);
                reject(error);
            },
            close: (event) => {
                this._handleConnectionClose(event);
            },
            message: (message) => {
                this._handleMessage(message);
            }
        };

        Object.entries(handlers).forEach(([event, handler]) => {
            this.client.on(event, handler);
        });

        // Set up character handling
        this.client.onMessageType('active_character', (character) => {
            this._handleCharacterUpdate(character);
        });
    }

    async _handleConnectionFailure(error) {
        this.connectionState.lastError = error;
        this.connectionState.reconnectCount++;
        
        const backoffDelay = Math.min(
            this.connectionState.backoffDelay * Math.pow(1.5, this.connectionState.reconnectCount - 1),
            this.connectionState.maxBackoffDelay
        );

        logger.warn(`Connection attempt ${this.connectionState.reconnectCount} failed. Retrying in ${backoffDelay}ms`, {
            error: error.message,
            attempts: `${this.connectionState.reconnectCount}/${this.connectionState.maxReconnectAttempts}`
        });

        await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }

    _handleSuccessfulConnection() {
        this.connectionState.currentStage = 'connected';
        this.connectionState.reconnectCount = 0;
        this.connectionState.backoffDelay = this.options.initialBackoffDelay || 1000;
        this.connectionState.lastError = null;
        logger.info('WebSocket connected successfully');
        this.emit('connected');
    }

    _handleConnectionError(error) {
        logger.error('WebSocket error:', error);
        this.emit('error', error);
    }

    _handleConnectionClose(event) {
        this.connectionState.currentStage = 'disconnected';
        logger.info('WebSocket closed:', event);
        this.emit('close', event);
        
        if (this.shouldAttemptReconnect()) {
            this._scheduleReconnection();
        }
    }

    _handleMessage(message) {
        logger.debug('Message received:', message);
        this.emit('message', message);
    }

    _handleCharacterUpdate(character) {
        logger.info('Active character update received:', {
            name: character.name,
            role: character.role
        });
        this.emit('characterUpdate', character);
    }

    async _cleanupExistingConnection() {
        try {
            await this.client.close();
        } catch (error) {
            logger.warn('Error during connection cleanup:', error);
        }
    }

    shouldAttemptReconnect() {
        return (
            this.connectionState.currentStage !== 'connecting' &&
            !this.connectionState.attemptInProgress &&
            this.connectionState.reconnectCount < this.connectionState.maxReconnectAttempts
        );
    }

    _scheduleReconnection() {
        const delay = this.connectionState.backoffDelay;
        logger.info(`Scheduling reconnection attempt in ${delay}ms`);
        
        setTimeout(() => {
            const url = process.env.WEBSOCKET_AGENTS_URL;
            if (url) {
                this.establishConnection(url).catch(error => {
                    logger.error('Scheduled reconnection failed:', error);
                });
            }
        }, delay);
    }

    async _processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const { type, message } = this.messageQueue.shift();
            try {
                await this.send(type, message);
            } catch (error) {
                logger.error('Failed to process queued message:', error);
                this.messageQueue.unshift({ type, message });
                break;
            }
        }
    }

    async broadcastActiveCharacter(character) {
        try {
            this.activeCharacter = character;
            const message = {
                name: character.name,
                role: character.role,
                traits: {
                    interests: character.traits?.interests || [],
                    values: character.traits?.values || [],
                    objectives: character.traits?.objectives || []
                }
            };
    
            if (this.isConnected()) {
                await this.send('active_character', message);
                logger.info('Active character broadcast:', {
                    name: character.name,
                    role: character.role
                });
            } else {
                this.messageQueue.push({ type: 'active_character', message });
                logger.warn('Connection not ready, queued character broadcast');
            }
        } catch (error) {
            logger.error('Failed to broadcast active character:', error);
            throw error;
        }
    }

    isConnected() {
        return (
            this.client &&
            this.client.isConnected &&
            this.connectionState.currentStage === 'connected'
        );
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).delete(handler);
        }
    }

    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            for (const handler of this.eventHandlers.get(event)) {
                try {
                    handler(data);
                } catch (error) {
                    logger.error(`Error in ${event} event handler:`, error);
                }
            }
        }
    }

    async send(type, message) {
        if (!this.isConnected()) {
            this.messageQueue.push({ type, message });
            throw new Error('WebSocket is not connected');
        }

        try {
            await this.client.send(type, message);
        } catch (error) {
            logger.error('Failed to send message:', error);
            throw error;
        }
    }

    async logout() {
        try {
            logger.info('🚪 Initiating WebSocket logout process...');
            
            // Send logout notification before closing
            if (this.isConnected()) {
                await this.send('agent_status_update', {
                    status: 'inactive',
                    reason: 'logout'
                });
            }

            // Perform cleanup
            await this.cleanup();
            
            logger.info('✅ Logout process completed successfully');
        } catch (error) {
            logger.error('❌ Error during logout process:', error);
            throw error;
        }
    }

    async cleanup() {
        if (this.isCleaningUp) {
            logger.debug('Cleanup already in progress, skipping...');
            return;
        }

        this.isCleaningUp = true;
        try {
            logger.info('🧹 Cleaning up WebSocket service...');
            
            // Clear any pending reconnection attempts
            this.connectionState.attemptInProgress = false;
            this.connectionState.currentStage = 'disconnected';
            
            // Cancel any pending messages
            this.messageQueue = [];
            
            if (this.client) {
                // Remove all event listeners
                this.client.removeAllListeners();
                
                if (this.client.isConnected) {
                    // Try to send a final status update
                    try {
                        await this.send('agent_update', {
                            status: 'inactive',
                            reason: 'cleanup'
                        });
                    } catch (error) {
                        logger.warn('Could not send final status update:', error);
                    }
                    
                    // Close the connection
                    await this._cleanupExistingConnection();
                }
                
                this.client = null;
            }

            // Clear all event handlers
            this.eventHandlers.clear();
            
            // Reset state
            this.activeCharacter = null;
            this.connectionState = {
                attemptInProgress: false,
                currentStage: 'disconnected',
                lastError: null,
                reconnectCount: 0,
                backoffDelay: this.options.initialBackoffDelay || 1000
            };
            
            logger.info('✅ WebSocket service cleanup complete');
        } catch (error) {
            logger.error('❌ WebSocket service cleanup failed:', error);
            throw error;
        } finally {
            this.isCleaningUp = false;
            this.connectionPromise = null;
        }
    }

    // Add specific shutdown method for application termination
    async shutdown() {
        try {
            logger.info('📴 Initiating WebSocket service shutdown...');
            
            // Disable reconnection attempts
            if (this.client) {
                this.client.shouldReconnect = false;
            }
            
            // Perform cleanup
            await this.cleanup();
            
            // Remove process event listeners
            process.removeListener('SIGTERM', this.cleanup);
            process.removeListener('SIGINT', this.cleanup);
            
            logger.info('✅ WebSocket service shutdown complete');
        } catch (error) {
            logger.error('❌ WebSocket service shutdown failed:', error);
            throw error;
        }
    }
}
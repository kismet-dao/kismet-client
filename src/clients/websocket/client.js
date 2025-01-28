import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../../utils/logger.js';

export class WebSocketClient extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            url: options.url || process.env.WEBSOCKET_AGENTS_URL || 'wss://kismet.money/ws/agents',
            protocols: options.protocols || [],
            reconnectAttempts: options.reconnectAttempts || 
                parseInt(process.env.WEBSOCKET_RECONNECT_ATTEMPTS || 5),
            reconnectDelay: options.reconnectDelay || 
                parseInt(process.env.WEBSOCKET_RECONNECT_DELAY || 1000),
            timeout: options.timeout || 
                parseInt(process.env.WEBSOCKET_TIMEOUT || 10000)
        };

        this.socket = null;
        this.reconnectCount = 0;
        this.isConnected = false;
        this.messageHandlers = new Map();
        this.shouldReconnect = true;
        this.connectionPromise = null;
        this.reconnectTimer = null;
        this.lastCharacterState = null;

        this.registerCharacterHandler();
    }

    connect() {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.shouldReconnect = true;
        this.connectionPromise = this.connectSocket();
        
        return this.connectionPromise.finally(() => {
            this.connectionPromise = null;
        });
    }

    connectSocket() {
        return new Promise((resolve, reject) => {
            try {
                if (this.socket) {
                    this.socket.removeAllListeners();
                    this.socket.close();
                }

                this.socket = new WebSocket(this.config.url, this.config.protocols);
                
                const connectionTimeout = setTimeout(() => {
                    reject(new Error('WebSocket connection timeout'));
                    this.handleClose(1000, 'Connection timeout');
                }, this.config.timeout);
                
                this.socket.on('open', () => {
                    clearTimeout(connectionTimeout);
                    this.handleOpen();
                    resolve(this.socket);
                });
                
                this.socket.on('message', (data) => this.handleMessage(data));
                this.socket.on('close', (code, reason) => this.handleClose(code, reason));
                this.socket.on('error', (error) => this.handleError(error, reject));
                
            } catch (error) {
                logger.error('WebSocket connection error', { error });
                this.emit('error', error);
                reject(error);
            }
        });
    }

    handleOpen() {
        this.isConnected = true;
        this.reconnectCount = 0;
        logger.info('WebSocket connection established', { url: this.config.url });
        this.emit('open');

        // Restore character state if available
        if (this.lastCharacterState) {
            this.send('active_character', this.lastCharacterState);
            logger.info('Restored character state after reconnection');
        }
    }

    handleError(error, reject) {
        logger.error('WebSocket error', { error });
        this.emit('error', error);
        if (!this.isConnected) {
            reject?.(error);
        }
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            switch (message.type) {
                case 'connected':
                    this.handleConnectedMessage(message);
                    break;
                case 'active_character':
                    this.handleActiveCharacterMessage(message);
                    break;
                case 'heartbeat':
                    this.emit('heartbeat', message.message);
                    break;
                default:
                    this.handleDefaultMessage(message);
            }
        } catch (error) {
            this.handleMessageParseError(data, error);
        }
    }

    handleConnectedMessage(message) {
        logger.info('Connection confirmed, client ID:', message.message);
        this.clientId = message.message;
        this.emit('connected', message.message);
    }

    handleActiveCharacterMessage(message) {
        try {
            const character = typeof message.message === 'string' ? 
                JSON.parse(message.message) : message.message;
            
            // Store character state for reconnection
            this.lastCharacterState = character;
            
            logger.info('Active character updated:', {
                name: character.name,
                role: character.role
            });
            this.emit('characterUpdate', character);
        } catch (error) {
            logger.error('Failed to process character update:', error);
        }
    }

    handleDefaultMessage(message) {
        this.emit('message', message);
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            handler(message.message);
        }
    }

    handleMessageParseError(data, parseError) {
        if (typeof data === 'string' && data.startsWith("Agent message processed:")) {
            this.handleProcessedMessage(data);
        } else {
            logger.warn('Failed to parse WebSocket message', {
                error: parseError,
                rawMessage: data.toString()
            });
            this.emit('rawMessage', data);
        }
    }

    handleProcessedMessage(data) {
        try {
            const jsonPart = data.substring(data.indexOf('{'));
            const processedMessage = JSON.parse(jsonPart);
            logger.info('Server processed message:', processedMessage);
            this.emit('processedMessage', processedMessage);
        } catch (error) {
            logger.error('Failed to parse processed message', {
                error,
                rawMessage: data
            });
        }
    }

    handleClose(code, reason) {
        if (!this.isConnected) return; // Prevent duplicate close handling
        
        this.isConnected = false;
        logger.info('WebSocket connection closed', { code, reason });
        this.emit('close', { code, reason });
        
        if (this.shouldReconnect) {
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        // Clear any existing reconnection timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        if (this.reconnectCount < this.config.reconnectAttempts) {
            this.reconnectCount++;
            logger.info(`Scheduling reconnection attempt (${this.reconnectCount}/${this.config.reconnectAttempts})...`);
            
            this.reconnectTimer = setTimeout(() => {
                this.connect().catch(error => {
                    logger.error('Reconnection attempt failed', { error });
                    if (this.reconnectCount >= this.config.reconnectAttempts) {
                        logger.error('Max reconnection attempts reached');
                        this.emit('reconnectFailed');
                    }
                });
            }, this.config.reconnectDelay);
        } else {
            logger.error('Max reconnection attempts reached');
            this.emit('reconnectFailed');
        }
    }

    send(type, message) {
        if (!this.isConnected) {
            throw new Error('WebSocket is not connected');
        }

        try {
            const payload = { type, message };
            this.socket.send(JSON.stringify(payload));
        } catch (error) {
            logger.error('Failed to send WebSocket message', { error });
            throw error;
        }
    }

    registerCharacterHandler() {
        this.onMessageType('active_character', (character) => {
            this.lastCharacterState = character;
            this.emit('characterUpdate', character);
        });
    }

    onMessageType(type, handler) {
        this.messageHandlers.set(type, handler);
    }

    removeMessageHandler(type) {
        this.messageHandlers.delete(type);
    }

    close() {
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.socket) {
            this.socket.close();
            this.isConnected = false;
        }
        this.connectionPromise = null;
    }

    removeAllListeners() {
        super.removeAllListeners();
        this.messageHandlers.clear();
    }
}
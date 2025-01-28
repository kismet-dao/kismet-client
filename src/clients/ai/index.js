// src/clients/ai/index.js
import { logger } from '../../utils/logger.js';
import { OllamaClient } from './ollama/ollama.js';

// Track the active client globally
let activeClient = null;

/**
 * Manages Ollama client instances and their lifecycle
 */
export class OllamaClientManager {
    constructor() {
        this.state = {
            client: null
        };
    }

    async getClient() {
        try {
            if (!this.state.client || !this.state.client.initialized) {
                logger.debug('Creating new Ollama client');

                await this.cleanup();

                const newClient = new OllamaClient();
                await newClient.initialize();

                this.state = {
                    client: newClient
                };

                activeClient = this.state.client;

                logger.info('Created and initialized new Ollama client');
            }

            return this.state.client;
        } catch (error) {
            logger.error('Failed to get/create Ollama client:', {
                error: error.message
            });
            throw error;
        }
    }

    async cleanup() {
        if (this.state.client) {
            try {
                await this.state.client.cleanup();
                this.state = {
                    client: null
                };

                activeClient = null;

                logger.info('Cleaned up Ollama client state');
            } catch (error) {
                logger.error('Ollama client cleanup failed:', error);
                throw error;
            }
        }
    }
}

// Create singleton instance
const ollamaClientManager = new OllamaClientManager();

/**
 * Public Ollama client interface
 */
export const ollamaClient = {
    initialized: false,
    model: null,

    async initialize() {
        const client = await ollamaClientManager.getClient();
        await client.initializeClient();
        this.initialized = true;
        this.model = client.model; // Ensure the model is set here
        return client;
    },

    async initializeClient() {
        return this.initialize();
    },

    async setModel(modelName) {
        this.model = modelName;
        return this.model;
    },

    async getCurrentModel() {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.model; // Return the current model
    },

    async cleanup() {
        try {
            await ollamaClientManager.cleanup();
            this.initialized = false;
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    },

    async sendMessage(message) {
        if (!this.initialized) {
            console.log('Ollama client not initialized, attempting to initialize...'); 
            await this.initializeClient();
        }

        try {
            const client = await ollamaClientManager.getClient();
            const systemMessage = 'You are a helpful AI assistant.';
            const response = await client.sendMessage(message, systemMessage);

            logger.info('Message sent successfully');
            logger.debug('Response:', response);
            return response;
        } catch (error) {
            logger.error('Error sending message to Ollama:', error);
            throw error;
        }
    },
};

export default ollamaClient;
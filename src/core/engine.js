// src/core/engine.js
import { ollamaClient } from '../clients/ai/index.js';
import { logger } from '../utils/logger.js';

export class AIManager {
    constructor() {
        this.initialized = false;
    }

    async initClient() {
        if (this.initialized) {
            console.log('AI client already initialized, skipping...'); // Debug log
            return;
        }

        try {
            logger.info('Initializing AI client...');
            await ollamaClient.initializeClient();
            this.initialized = true;
            logger.info('AI client initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize AI client:', error);
            throw error;
        }
    }

    async sendMessage(message) {
        if (!this.initialized) {
            console.error('AI client not initialized'); // Debug log
            throw new Error('AI client not initialized');
        }
    
        try {
            logger.info('Sending message to Ollama...');
    
            const response = await ollamaClient.sendMessage(message);
    
            logger.info('Message sent successfully');
            return response;
        } catch (error) {
            console.error('Error in sendMessage:', error); // Debug log
            logger.error('Error sending message:', error);
            throw error;
        }
    }

    async setModel(modelName) {
        if (!this.initialized) {
            console.error('AI client not initialized'); // Debug log
            throw new Error('AI client not initialized');
        }

        try {
            logger.info(`Switching model to ${modelName}...`);
            await ollamaClient.setModel(modelName);
            logger.info(`Model switched to ${modelName} successfully`);
        } catch (error) {
            console.error('Error in setModel:', error); // Debug log
            logger.error('Error switching model:', error);
            throw error;
        }
    }

    async getCurrentModel() {
        if (!this.initialized) {
            console.error('AI client not initialized');
            throw new Error('AI client not initialized');
        }
    
        try {
            logger.info('Fetching current model...');
            const currentModel = await ollamaClient.getCurrentModel(); // Use ollamaClient.getCurrentModel
            logger.info(`Current model is ${currentModel}`);
            return currentModel;
        } catch (error) {
            console.error('Error in getCurrentModel:', error);
            logger.error('Error fetching current model:', error);
            throw error;
        }
    }

    async cleanup() {
        console.log('Cleaning up AI client...'); // Debug log
        try {
            logger.info('Cleaning up AI client...');
            await ollamaClient.cleanup();
            this.initialized = false;
            logger.info('AI client cleanup completed');
            console.log('AI client cleanup completed'); // Debug log
        } catch (error) {
            logger.error('Error during cleanup:', error);
            throw error;
        }
    }
}
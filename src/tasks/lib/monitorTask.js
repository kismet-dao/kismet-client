// src/services/tasks/models/monitorTask.js
import { Task } from './task.js';
import { logger } from '../../utils/logger.js';
import { ServiceConsumer } from '../../core/consumer.js';

export class MonitorTask extends Task {
    constructor(config) {
        super({
            id: config.id,
            name: `Monitor ${config.type}: ${config.identifier}`,
            execute: () => this.executeMonitor(),
            priority: 'normal'
        });
        
        // Initialize ServiceConsumer
        this.serviceConsumer = new ServiceConsumer();

        this.type = config.type;
        this.identifier = config.identifier;
        this.options = {
            interval: config.interval || 60,
            scrolls: config.scrolls || 3,
            limit: config.limit || Infinity,
            visible: config.visible || false,
            threadInterval: config.threadInterval || 30,
            threads: config.threads || [],
            priority: config.priority || 'normal',
            includeReplies: config.includeReplies || true,
            includeRetweets: config.includeRetweets || true
        };
    }
    
    async executeMonitor() {
        try {
            logger.info(`Starting monitor task: ${this.name}`);
            
            switch (this.type) {
                case 'twitter':
                    return await this.executeTwitterMonitor();
                case 'twitter-mentions':
                    return await this.executeTwitterMentionMonitor();
                default:
                    throw new Error(`Unsupported monitor type: ${this.type}`);
            }
        } catch (error) {
            logger.error(`Monitor task failed: ${this.name}`, error);
            throw error;
        }
    }

    async executeTwitterMonitor() {
        const twitterService = this.serviceConsumer.getService('twitter');
        if (!twitterService) {
            throw new Error('Twitter service not available');
        }

        return await twitterService.handleMonitorCommand(
            this.identifier,
            this.options.interval,
            this.options.scrolls,
            this.options.visible,
            this.options.limit
        );
    }

    async executeTwitterMentionMonitor() {
        const twitterService = this.serviceConsumer.getService('twitter');
        if (!twitterService) {
            throw new Error('Twitter service not available');
        }

        return await twitterService.handleMentionMonitor(
            this.identifier,
            this.options.interval,
            this.options.scrolls,
            this.options.visible,
            this.options.limit,
            {
                includeReplies: this.options.includeReplies,
                includeRetweets: this.options.includeRetweets
            }
        );
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            identifier: this.identifier,
            options: this.options,
            createdAt: this.createdAt
        };
    }
}
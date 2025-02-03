// src/tasks/lib/discordTask.js
import { Task } from './task.js';
import { logger } from '../../utils/logger.js';
import chalk from 'chalk';
import { ServiceConsumer } from '../../core/services.js';
import { ApplicationDependencies } from '../../core/app.js';
import path from 'path';
import fs from 'fs/promises';

const DISCORD_CHANNELS = {
    info: process.env.DISCORD_INFO_CHANNEL_ID || '1230218659729899591',
    official: process.env.DISCORD_OFFICIAL_CHANNEL_ID || '1230218659729899593',
    tweets: process.env.DISCORD_TWEETS_CHANNEL_ID || '1302242439171408003',
    general: process.env.DISCORD_GENERAL_CHANNEL_ID || '1299375961472499762'
};

// Log available channels at startup
//logger.info('Initialized Discord channels:', 
//    Object.entries(DISCORD_CHANNELS)
//        .map(([name, id]) => `${name}: ${id}`)
//        .join(', ')
//);

export class DiscordTask extends Task {
    constructor(config = {}) {
        // Ensure config is an object with default empty object
        const safeConfig = config || {};

        // Log the incoming configuration for debugging
        logger.debug('Creating Discord task with config:', safeConfig);

        // Determine the channel identifier
        const channelIdentifier = safeConfig.channelId || safeConfig.identifier || safeConfig.channel || 'general';

        // Resolve the channel ID first
        const resolvedChannelId = DiscordTask.resolveChannelId(channelIdentifier);

        // Call super first with basic config
        super({
            id: safeConfig.id,
            name: `Discord ${safeConfig.type || 'monitor'}: ${channelIdentifier}`,
            type: 'discord',
            execute: async () => await this.executeDiscordTask(),
            options: {
                interval: safeConfig.interval || 30,
                priority: safeConfig.priority || 'normal',
                channelId: resolvedChannelId,
                guildId: safeConfig.guildId,
                threadId: safeConfig.threadId,
                messageId: safeConfig.messageId,
                // AI-related options
                aiEnabled: safeConfig.aiEnabled !== false,
                aiTriggerPrefix: process.env.AI_TRIGGER_PREFIX || 'hey kismet',
                requiredPermissions: [
                    'ViewChannel',
                    'SendMessages',
                    'AddReactions',
                    'ReadMessageHistory'
                ],
                autoReact: safeConfig.autoReact || false,
                autoPin: safeConfig.autoPin || false,
                reactions: safeConfig.reactions || ['👍'],
                persist: safeConfig.persist || false,
                maxRetries: safeConfig.maxRetries || 3
            }
        });

        // Initialize dependencies
        this.serviceConsumer = new ServiceConsumer();
        this.dependencies = ApplicationDependencies.getInstance();

        // Set additional Discord-specific properties
        this.subType = safeConfig.type || 'monitor';
        this.identifier = resolvedChannelId;

        // Log successful initialization
        logger.info('Created Discord task:', {
            type: this.subType,
            channel: this.getChannelName(resolvedChannelId),
            channelId: resolvedChannelId,
            options: this.options
        });

        this.processedItems = new Set();
        this.lastProcessedId = null;
        this.lastBotMessageId = null;
    }
    
    static resolveChannelId(identifier) {
        if (!identifier) {
            throw new Error('Channel identifier is required');
        }

        if (/^\d+$/.test(identifier)) {
            return identifier;
        }

        const channel = String(identifier).toLowerCase();
        if (channel in DISCORD_CHANNELS) {
            const channelId = DISCORD_CHANNELS[channel];
            if (!channelId) {
                throw new Error(`Channel "${channel}" not configured`);
            }
            return channelId;
        }

        throw new Error(`Unknown channel identifier: ${identifier}`);
    }

    getChannelName(channelId) {
        const entry = Object.entries(DISCORD_CHANNELS).find(([_, id]) => id === channelId);
        return entry ? entry[0].toUpperCase() : channelId;
    }

    async executeDiscordTask() {
        try {
            logger.info(`Starting Discord task: ${this.name}`);
            console.log(chalk.blue(`\n🎮 Executing Discord task: ${this.subType}`));
            console.log(chalk.cyan(`   Channel: ${this.getChannelName(this.options.channelId)} (${this.options.channelId})`));
            console.log(chalk.dim(`   Interval: ${this.options.interval}s`));

            switch (this.subType) {
                case 'monitor':
                    return await this.executeMonitor();
                case 'announcement':
                    return await this.executeAnnouncement();
                case 'reaction':
                    return await this.executeReactionTask();
                default:
                    throw new Error(`Unsupported Discord task type: ${this.subType}`);
            }
        } catch (error) {
            logger.error(`Discord task failed: ${this.name}`, error);
            throw error;
        }
    }

    async executeMonitor() {
        const discordService = this.serviceConsumer.getService('discord');
        if (!discordService) {
            throw new Error('Discord service not available');
        }

        try {
            console.log(chalk.dim(`\n📡 Monitoring Discord channel...`));

            const messages = await discordService.getChannelMessages(
                this.options.channelId, 
                { 
                    limit: 100,
                    after: this.lastProcessedId || '0'
                }
            );

            // Sort messages by timestamp to process in order
            const sortedMessages = [...messages].sort((a, b) => 
                a.createdTimestamp - b.createdTimestamp
            );

            for (const message of sortedMessages) {
                // Skip if already processed
                if (this.processedItems.has(message.id)) {
                    continue;
                }

                // Skip bot's own messages
                if (message.author.bot) {
                    this.processedItems.add(message.id);
                    continue;
                }

                // Update last message ID as we process
                if (BigInt(message.id) > BigInt(this.lastProcessedId || '0')) {
                    this.lastProcessedId = message.id;
                }

                // Check for AI trigger if enabled
                if (this.options.aiEnabled) {
                    const isDirectCommand = message.content.toLowerCase().startsWith(this.options.aiTriggerPrefix);
                    const isReplyToBot = message.reference?.messageId === this.lastBotMessageId;
                    
                    if (isDirectCommand || isReplyToBot) {
                        await this._handleAIResponse(message);
                    }
                }
                
                // Add to processed set
                this.processedItems.add(message.id);
            }

            // Clean up processed items set if it gets too large
            if (this.processedItems.size > 1000) {
                const itemsArray = [...this.processedItems];
                this.processedItems = new Set(itemsArray.slice(-1000));
            }

            return {
                success: true,
                processedCount: messages.length,
                lastMessageId: this.lastProcessedId
            };
        } catch (error) {
            logger.error('Discord monitor failed:', error);
            throw error;
        }
    }

    async _handleAIResponse(message) {
        try {
            const discordService = this.serviceConsumer.getService('discord');
            if (!discordService?.client) {
                throw new Error('Discord service not available');
            }

            // First check if we've already responded by checking stored messages
            const dataDir = path.join('resources', 'data', 'discord');
            const filePath = path.join(dataDir, `${this.options.channelId}.json`);
            
            try {
                const data = await fs.readFile(filePath, 'utf8');
                const messages = JSON.parse(data);
                const existingMessage = messages.find(msg => msg.id === message.id);
                
                if (existingMessage?.responded) {
                    logger.debug('Skipping already responded message:', { messageId: message.id });
                    return;
                }
            } catch (error) {
                // If we can't read the file, continue with the response
                logger.warn('Could not check message response status:', error);
            }

            // Get query based on message type
            let query;
            if (message.content.toLowerCase().startsWith(this.options.aiTriggerPrefix)) {
                query = message.content.slice(this.options.aiTriggerPrefix.length).trim();
            } else {
                query = message.content.trim();
            }

            if (!query) {
                const response = await message.reply('Hey! What can I help you with? 😊');
                this.lastBotMessageId = response.id;
                return;
            }

            try {
                const channel = await discordService.client.getClient().channels.fetch(this.options.channelId);
                if (!channel?.isTextBased()) {
                    throw new Error('Channel not found or not text-based');
                }

                await channel.sendTyping().catch(() => {});

                const aiManager = this.dependencies.engine.getDependency('aiManager');
                if (!aiManager) {
                    throw new Error('AI service not available');
                }

                // Get response with timeout
                const response = await Promise.race([
                    aiManager.sendMessage(query),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Response timeout')), 30000)
                    )
                ]);

                // Send response
                const botResponse = await discordService.client.sendMessage(this.options.channelId, {
                    content: response,
                    reply: {
                        messageReference: message.id,
                        failIfNotExists: false
                    }
                });

                // Update stored message to mark as responded
                try {
                    const data = await fs.readFile(filePath, 'utf8');
                    const messages = JSON.parse(data);
                    const messageIndex = messages.findIndex(msg => msg.id === message.id);
                    
                    if (messageIndex !== -1) {
                        messages[messageIndex].responded = true;
                        messages[messageIndex].botResponseId = botResponse.id;
                        await fs.writeFile(filePath, JSON.stringify(messages, null, 2), 'utf8');
                    }
                } catch (error) {
                    logger.error('Error updating message response status:', error);
                }

                // Store bot message ID and conversation context
                this.lastBotMessageId = botResponse.id;
                this.conversationContext.set(message.author.id, {
                    lastQuery: query,
                    lastResponse: response,
                    timestamp: Date.now()
                });

                logger.info('AI Response sent:', {
                    channel: this.options.channelId,
                    user: message.author.tag,
                    query,
                    messageId: message.id,
                    responseId: botResponse.id,
                    model: aiManager.getActiveModel?.()
                });

            } catch (error) {
                logger.error('AI response error:', error);
                
                const errorResponse = await discordService.client.sendMessage(this.options.channelId, {
                    content: 'Oops! Something went wrong. Mind trying again? 😅',
                    reply: {
                        messageReference: message.id,
                        failIfNotExists: false
                    }
                });

                this.lastBotMessageId = errorResponse.id;

                // Mark message as responded even on error to prevent retry spam
                try {
                    const data = await fs.readFile(filePath, 'utf8');
                    const messages = JSON.parse(data);
                    const messageIndex = messages.findIndex(msg => msg.id === message.id);
                    
                    if (messageIndex !== -1) {
                        messages[messageIndex].responded = true;
                        messages[messageIndex].botResponseId = errorResponse.id;
                        messages[messageIndex].error = true;
                        await fs.writeFile(filePath, JSON.stringify(messages, null, 2), 'utf8');
                    }
                } catch (storageError) {
                    logger.error('Error updating message error status:', storageError);
                }
            }

        } catch (error) {
            logger.error('Fatal error in AI handler:', {
                error: error.message,
                channelId: this.options.channelId,
                messageId: message.id
            });
        }
    }

    async handleNewMessage(message) {
        try {
            // Construct file path
            const dataDir = path.join('resources', 'data', 'discord');
            const filePath = path.join(dataDir, `${this.options.channelId}.json`);      

            // Read existing messages or initialize empty array
            let existingMessages = [];
            try {
                await fs.mkdir(dataDir, { recursive: true });
                try {
                    const existingData = await fs.readFile(filePath, 'utf8');
                    existingMessages = JSON.parse(existingData);
                } catch (readError) {
                    if (readError.code !== 'ENOENT') {
                        logger.warn('Error reading message store:', readError);
                    }
                }
            } catch (error) {
                logger.error('Error accessing message store:', error);
            }

            // Check if message already exists
            const existingMessage = existingMessages.find(msg => msg.id === message.id);
            if (existingMessage) {
                return; // Skip if already processed
            }

            // Log new message
            console.log(chalk.blue('\n📨 New message detected:'));
            console.log(chalk.cyan(`   From: ${message.author.tag}`));
            console.log(chalk.white(`   "${message.content}"`));
            
            if (message.embeds?.length > 0) {
                console.log(chalk.yellow('   📎 Contains embeds'));
            }
            if (message.attachments?.size > 0) {
                console.log(chalk.yellow('   📎 Contains attachments'));
            }

            // Prepare enhanced message data
            const messageData = {
                id: message.id,
                author: message.author.tag,
                content: message.content,
                timestamp: message.createdTimestamp,
                embeds: message.embeds?.length || 0,
                attachments: message.attachments?.size || 0,
                reference: message.reference?.messageId || null,
                responded: false,
                botResponseId: null
            };

            // Add to storage
            existingMessages.push(messageData);

            // Sort by timestamp
            existingMessages.sort((a, b) => {
                const aId = BigInt(a.id);
                const bId = BigInt(b.id);
                return aId < bId ? -1 : aId > bId ? 1 : 0;
            });

            // Keep last 1000 messages
            if (existingMessages.length > 1000) {
                existingMessages = existingMessages.slice(-1000);
            }

            // Save updated messages
            await fs.writeFile(filePath, JSON.stringify(existingMessages, null, 2), 'utf8');

            // Emit the message event
            this.emit('message', {
                type: 'discord_message',
                channelId: this.options.channelId,
                messageId: message.id,
                author: message.author.tag,
                content: message.content,
                timestamp: message.createdTimestamp
            });

        } catch (error) {
            logger.error('Error processing Discord message:', error);
        }
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'discord',
            subType: this.subType,
            identifier: this.identifier,
            options: {
                ...this.options,
                type: this.subType
            }
        };
    }
}

export default DiscordTask;
// src/services/tasks/models/twitterMentionMonitorTask.js
import { MonitorTask } from './monitorTask.js';
import { logger } from '../../utils/logger.js';
import chalk from 'chalk';
import { ServiceConsumer } from '../../core/consumer.js';

export class TwitterMentionMonitorTask extends MonitorTask {
    constructor(config) {
        super({
            ...config,
            name: `Monitor Twitter mentions: ${config.identifier}`,
            type: 'twitter-mentions'
        });

        // Initialize ServiceConsumer (inheriting from parent class)
        this.serviceConsumer = new ServiceConsumer();

        this.lastCheckedId = null;
        this.options = {
            ...this.options,
            searchQuery: `@${config.identifier}`,
            includeReplies: config.includeReplies || true,
            includeRetweets: config.includeRetweets || true,
            interval: config.interval || 300,
            scrolls: config.scrolls || 2
        };

        // Keep track of processed mentions to avoid duplicates
        this.processedMentions = new Set();
        this.mentionsDate = null;
    }

    async executeMonitor() {
        try {
            logger.info(`Starting Twitter mention monitor for: ${this.identifier}`);
            
            // Log monitor startup with nice formatting
            console.log(chalk.blue('\n🔍 Starting mention monitoring:'));
            console.log(chalk.cyan(`   Account: @${this.identifier}`));
            console.log(chalk.dim(`   Interval: ${this.options.interval}s`));
            console.log(chalk.dim(`   Filters: ${this.getFilterDescription()}`));
            
            return await this.executeTwitterMentionMonitor();
        } catch (error) {
            logger.error(`Twitter mention monitor failed for ${this.identifier}:`, error);
            console.log(chalk.red(`\n❌ Monitoring error: ${error.message}`));
            throw error;
        }
    }

    getFilterDescription() {
        const filters = [];
        if (this.options.includeReplies) filters.push('replies');
        if (this.options.includeRetweets) filters.push('retweets');
        return filters.length ? filters.join(', ') : 'none';
    }

    async executeTwitterMentionMonitor() {
        const twitterService = this.serviceConsumer.getService('twitter');
        if (!twitterService) {
            throw new Error('Twitter service not available');
        }

        // Construct search parameters
        const searchParams = new URLSearchParams({
            q: this.options.searchQuery,
            f: 'live',
            src: 'typed_query'
        });

        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().slice(0, 10);

        // Add since parameter to search query
        searchParams.append('since', today);

        if (!this.options.includeReplies) {
            searchParams.append('f', 'tweets');
        }
        if (!this.options.includeRetweets) {
            searchParams.append('q', '-filter:retweets');
        }

        const searchUrl = `https://twitter.com/search?${searchParams.toString()}`;
        
        console.log(chalk.dim(`\n📡 Checking for new mentions...`));

        return await twitterService.handleMentionMonitor(
            this.identifier,
            this.options.interval,
            this.options.scrolls,
            this.options.visible,
            this.options.limit
        );
    }

    async handleNewMention(mention) {
        try {
            // Update mentions date if it's a new day
            const today = new Date().toISOString().slice(0, 10);
            if (this.mentionsDate !== today) {
                this.processedMentions.clear();
                this.mentionsDate = today;
            }

            // Skip if mention is from before today
            const mentionDate = new Date(mention.timestamp);
            mentionDate.setHours(0, 0, 0, 0);
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);
            
            if (mentionDate < todayDate) {
                return;  
            }

            // Skip if we've already processed this mention
            if (this.processedMentions.has(mention.id)) {
                return;
            }

            // Update tracking
            if (mention.id > (this.lastCheckedId || 0)) {
                this.lastCheckedId = mention.id;
            }
            this.processedMentions.add(mention.id);

            // Log the mention with nice formatting
            console.log(chalk.blue('\n📨 New mention detected:'));
            console.log(chalk.cyan(`   From: @${mention.author.username}`));
            console.log(chalk.white(`   "${mention.text}"`));
            
            // Log engagement metrics if available
            if (mention.metrics) {
                console.log(chalk.yellow(`   📊 Engagement:`));
                console.log(chalk.dim(`      • ${mention.metrics.replies || 0} replies`));
                console.log(chalk.dim(`      • ${mention.metrics.retweets || 0} retweets`));
                console.log(chalk.dim(`      • ${mention.metrics.likes || 0} likes`));
                if (mention.metrics.views) {
                    console.log(chalk.dim(`      • ${mention.metrics.views} views`));
                }
            }

            // Log timestamp and link
            console.log(chalk.dim(`   🕒 ${new Date(mention.timestamp).toLocaleString()}`));
            console.log(chalk.dim(`   🔗 ${mention.permanentUrl}`));

            // Log to file logger
            logger.info(`New mention of @${this.identifier} detected:`, {
                from: mention.author.username,
                text: mention.text,
                url: mention.permanentUrl,
                timestamp: mention.timestamp,
                metrics: mention.metrics
            });

            // Emit event for external handling
            this.emit('mention', {
                type: 'mention',
                username: mention.author.username,
                text: mention.text,
                url: mention.permanentUrl,
                timestamp: mention.timestamp,
                metrics: mention.metrics
            });

        } catch (error) {
            logger.error('Error processing mention:', error);
            console.log(chalk.red(`\n❌ Error processing mention: ${error.message}`));
        }
    }

    async handleMonitoringError(error) {
        logger.error(`Monitoring error for @${this.identifier}:`, error);
        console.log(chalk.red(`\n❌ Monitoring error: ${error.message}`));
        console.log(chalk.yellow(`   🔄 Retrying in ${this.options.interval} seconds...`));
    }

    toJSON() {
        return {
            ...super.toJSON(),
            lastCheckedId: this.lastCheckedId,
            options: {
                ...this.options,
                type: 'twitter-mentions'
            }
        };
    }
}
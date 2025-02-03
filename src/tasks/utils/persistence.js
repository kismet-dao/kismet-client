// src/services/tasks/utils/persistence.js
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logger.js';
import { MonitorTask } from '../lib/monitorTask.js';
import { DiscordTask } from '../lib/discordTask.js';
import { TwitterMentionMonitorTask } from '../lib/twitterMentionTask.js';

export class TaskPersistenceManager {
    constructor(configPath = './resources/config/tasks') {
        this.configPath = configPath;
        this.tasksFile = path.join(configPath, 'tasks.json');
    }

    async initialize() {
        try {
            // Create the config directory if it doesn't exist
            await fs.mkdir(this.configPath, { recursive: true });
            
            try {
                await fs.access(this.tasksFile);
                logger.info('Persistent tasks file exists');
            } catch {
                // Create the file with initial structure
                await fs.writeFile(this.tasksFile, JSON.stringify({
                    tasks: [],
                    lastUpdated: new Date().toISOString()
                }, null, 2));
                logger.info('Created persistent tasks file');
            }
        } catch (error) {
            logger.error('Failed to initialize task persistence:', error);
            throw error;
        }
    }

    async savePersistentTask(taskConfig) {
        try {
            await this.initialize(); // Ensure storage exists
            const currentTasks = await this.loadPersistentTasks();
            
            const existingIndex = currentTasks.findIndex(task => 
                task.type === taskConfig.type && task.identifier === taskConfig.identifier
            );
            
            if (existingIndex !== -1) {
                currentTasks[existingIndex] = {
                    ...taskConfig,
                    updatedAt: new Date().toISOString()
                };
            } else {
                currentTasks.push({
                    ...taskConfig,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }

            await fs.writeFile(this.tasksFile, JSON.stringify({
                tasks: currentTasks,
                lastUpdated: new Date().toISOString()
            }, null, 2));
            
            logger.info(`Saved persistent task: ${taskConfig.name}`);
            return true;
        } catch (error) {
            logger.error('Failed to save persistent task:', error);
            return false;
        }
    }

    async loadPersistentTasks() {
        try {
            await this.initialize();
            const data = await fs.readFile(this.tasksFile, 'utf8');
            const { tasks = [] } = JSON.parse(data);
            
            logger.info(`Retrieving persistent tasks from ${this.tasksFile}`);
            
            // Convert the plain objects back to appropriate Task instances
            const processedTasks = tasks.map(taskConfig => {
                logger.debug('Processing persistent task config:', taskConfig);
                
                switch(taskConfig.type) {
                    case 'discord':
                        return new DiscordTask({
                            id: taskConfig.id,
                            type: taskConfig.subType || 'monitor',
                            identifier: taskConfig.identifier,
                            channelId: taskConfig.options?.channelId,
                            interval: taskConfig.options?.interval,
                            autoReact: taskConfig.options?.autoReact,
                            autoPin: taskConfig.options?.autoPin,
                            reactions: taskConfig.options?.reactions,
                            persist: true
                        });
                    case 'twitter':
                        return new MonitorTask({
                            id: taskConfig.id,
                            type: taskConfig.type,
                            identifier: taskConfig.identifier,
                            interval: taskConfig.options?.interval,
                            scrolls: taskConfig.options?.scrolls,
                            limit: taskConfig.options?.limit,
                            visible: taskConfig.options?.visible,
                            threadInterval: taskConfig.options?.threadInterval,
                            threads: taskConfig.options?.threads
                        });
                    case 'twitter-mentions':
                        return new TwitterMentionMonitorTask({
                            id: taskConfig.id,
                            identifier: taskConfig.identifier,
                            interval: taskConfig.options?.interval,
                            scrolls: taskConfig.options?.scrolls,
                            limit: taskConfig.options?.limit,
                            visible: taskConfig.options?.visible,
                            includeReplies: taskConfig.options?.includeReplies,
                            includeRetweets: taskConfig.options?.includeRetweets
                        });
                    default:
                        logger.warn(`Unknown task type for persistent task: ${taskConfig.type}`);
                        return null;
                }
            }).filter(task => task !== null);  // Remove any null tasks
    
            logger.info(`Converted ${processedTasks.length} persistent tasks`);
            return processedTasks;
        } catch (error) {
            logger.error('Failed to load persistent tasks:', error);
            return [];
        }
    }

    async removePersistentTask(type, identifier) {
        try {
            await this.initialize(); // Ensure storage exists
            const currentTasks = await this.loadPersistentTasks();
            
            const filteredTasks = currentTasks.filter(task => 
                !(task.type === type && task.identifier === identifier)
            );

            await fs.writeFile(this.tasksFile, JSON.stringify({
                tasks: filteredTasks,
                lastUpdated: new Date().toISOString()
            }, null, 2));
            
            logger.info(`Removed persistent task: ${type}/${identifier}`);
            return true;
        } catch (error) {
            logger.error('Failed to remove persistent task:', error);
            return false;
        }
    }
}
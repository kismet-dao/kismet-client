// src/core/user.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url'; // Needed to work with import.meta.url
import inquirer from 'inquirer';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';

// Determine __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the project root (assuming src is directly under the project root)
const PROJECT_ROOT = path.resolve(__dirname, '../../'); // Adjust the number of '../' as needed

const DEFAULT_CONFIG_PATH = path.join(PROJECT_ROOT, 'resources', 'config', 'user', 'settings.json');

const DEFAULT_USER_CONFIG = {
    settings: {
        theme: 'default',
        notifications: true,
        logLevel: 'error'
    },
    preferences: {
        defaultCharacter: null,
        autoSave: true,
        saveInterval: 300
    },
    character: {  // New section for character preferences
        default: 'Kismet',  // Default character name
        lastUsed: null,
        favoriteCharacters: []
    },
    session: {
        lastLogin: null,
        lastCharacter: null,
        firstLogin: true
    },
    profile: {
        name: null,
        timezone: null,
        preferredLanguage: 'English',
        useVoiceOutput: false
    }
};

class UserConfigManager {
    constructor() {
        this.configPath = DEFAULT_CONFIG_PATH;
        this.config = null;
    }

    async initialize() {
        try {
            await this.loadConfig();

            // Log the current state
            logger.debug('Current configuration state:', {
                firstLogin: this.config.session.firstLogin,
                hasProfile: !!this.config.profile,
                setupCompleted: this.config.session.setupCompleted
            });

            // Check if this is first login
            if (this.config.session.firstLogin) {
                logger.info('First time user detected, starting initialization sequence...');
                await this.runFirstLoginSequence();
            } else {
                logger.info('Existing user detected, skipping initialization sequence');
            }

            // Update last login time
            await this.updateSessionData({
                lastLogin: new Date().toISOString()
            });

            logger.info('User configuration initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize user configuration:', error);
            throw error;
        }
    }

    async initializeGUI() {
        try {
            await this.loadConfigGUI();
            logger.info('User configuration initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize user configuration:', error);
            throw error;
        }
    }

    async loadConfigGUI() {
        try {
            // First check if config exists
            try {
                await fs.access(this.configPath);
            } catch (error) {
                return;
            }
    
            // Read and parse config
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
    

            const settings = this.config.settings;
    
            // Update logger based on config
            this.updateLoggerConfig(settings.logLevel);
    
            logger.debug('User configuration loaded successfully');
        } catch (error) {
            logger.error('Error loading user configuration:', error);
            throw new Error('Failed to load user configuration');
        }
    }

    async runFirstLoginSequence() {
        console.log(chalk.cyan('\n👋 Welcome to Kismet! Let\'s get to know you better.\n'));
        
        try {
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'What should I call you?',
                    validate: input => input.trim().length >= 1 || 'Please enter a name'
                },
                {
                    type: 'list',
                    name: 'preferredLanguage',
                    message: 'What\'s your preferred language?',
                    choices: ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese']
                },
                {
                    type: 'confirm',
                    name: 'useVoiceOutput',
                    message: 'Would you like to enable voice output using ElevenLabs?',
                    default: false
                },
                {
                    type: 'list',
                    name: 'theme',
                    message: 'Choose your preferred theme:',
                    choices: [
                        { name: 'Light Mode', value: 'light' },
                        { name: 'Dark Mode', value: 'dark' },
                        { name: 'System Default', value: 'default' }
                    ]
                }
            ]);

            // Get timezone automatically
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            // Update profile
            await this.updateConfig({
                profile: {
                    name: answers.name,
                    timezone: timezone,
                    preferredLanguage: answers.preferredLanguage,
                    useVoiceOutput: answers.useVoiceOutput
                },
                settings: {
                    ...this.config.settings,
                    theme: answers.theme
                },
                session: {
                    ...this.config.session,
                    firstLogin: false,
                    setupCompleted: true
                }
            });

            console.log(chalk.green('\n✨ Perfect! Your preferences have been saved.\n'));
            console.log(chalk.cyan(`Welcome aboard, ${answers.name}! I'll remember your preferences for next time.\n`));

            if (answers.useVoiceOutput) {
                console.log(chalk.yellow('Note: Voice output will be configured in the next step.\n'));
            }

        } catch (error) {
            logger.error('Error during first login sequence:', error);
            throw error;
        }
    }

    async updateConfig(updates) {
        try {
            // Deep merge updates with existing config
            this.config = this.deepMerge(this.config, updates);

            // Write updated config to file
            await fs.writeFile(
                this.configPath,
                JSON.stringify(this.config, null, 2),
                'utf8'
            );
            
            logger.debug('User configuration updated successfully');
        } catch (error) {
            logger.error('Error updating user configuration:', error);
            throw new Error('Failed to update user configuration');
        }
    }

    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    async loadConfig() {
        try {
            // First check if config exists
            try {
                await fs.access(this.configPath);
            } catch (error) {
                logger.info('User config not found, creating default configuration...');
                await this.createDefaultConfig();
                return;
            }
    
            // Read and parse config
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
    

            const settings = this.config.settings;
    
            // Update logger based on config
            this.updateLoggerConfig(settings.logLevel);
    
            logger.debug('User configuration loaded successfully');
        } catch (error) {
            logger.error('Error loading user configuration:', error);
            throw new Error('Failed to load user configuration');
        }
    }

    async setDefaultModel(modelType) {
        try {
            if (!this.config.preferences) {
                this.config.preferences = {};
            }
            this.config.preferences.defaultModel = modelType;
            await this.updateConfig(this.config);
            logger.info('Default AI model updated:', { model: modelType });
            return true;
        } catch (error) {
            logger.error('Failed to set default AI model:', error);
            return false;
        }
    }

    getDefaultModel() {
        return this.config?.preferences?.defaultModel || null;
    }
    
    getLogLevelDisplay(level) {
        const colors = {
            'none': chalk.gray,
            'error': chalk.red,
            'info': chalk.blue,
            'debug': chalk.magenta
        };
        return colors[level](level.toUpperCase());
    }
    
    getBooleanDisplay(value) {
        return value ? chalk.green('Enabled') : chalk.red('Disabled');
    }
    
    updateLoggerConfig(logLevel) {
        // Update logger's debug mode based on config
        logger.debugMode = logLevel === 'debug';
        
        // Set logger's level
        logger.setLevel(logLevel);
        
        // Log the change
        logger.debug('Logger configuration updated:', { level: logLevel });
    }

    async createDefaultConfig() {
        try {
            // Ensure directory exists
            const configDir = path.dirname(this.configPath);
            await fs.mkdir(configDir, { recursive: true });

            // Write default config
            await fs.writeFile(
                this.configPath,
                JSON.stringify(DEFAULT_USER_CONFIG, null, 2),
                'utf8'
            );
            
            this.config = { ...DEFAULT_USER_CONFIG };
            logger.info('Created default user configuration');
        } catch (error) {
            logger.error('Error creating default user configuration:', error);
            throw new Error('Failed to create default user configuration');
        }
    }

    
    async setDefaultCharacter(characterName) {
        try {
            if (!this.config.character) {
                this.config.character = {
                    default: characterName,
                    lastUsed: characterName,
                    favoriteCharacters: []
                };
            } else {
                this.config.character.default = characterName;
            }

            await this.updateConfig(this.config);
            logger.info('Default character updated:', { character: characterName });
            return true;
        } catch (error) {
            logger.error('Failed to set default character:', error);
            return false;
        }
    }

    getDefaultCharacter() {
        return this.config?.character?.default || null;
    }

    async updateCharacterPreferences(characterName) {
        if (!this.config.character) {
            this.config.character = {
                default: characterName,
                lastUsed: characterName,
                favoriteCharacters: []
            };
        } else {
            this.config.character.lastUsed = characterName;
        }

        // Update session info as well
        this.config.session.lastCharacter = characterName;

        await this.updateConfig(this.config);
    }

    getConfig() {
        return this.config;
    }

    getSetting(key) {
        return this.config?.settings?.[key];
    }

    getPreference(key) {
        return this.config?.preferences?.[key];
    }

    async setSetting(key, value) {
        if (!this.config.settings) {
            this.config.settings = {};
        }
        this.config.settings[key] = value;
        await this.updateConfig(this.config);
    }

    async setPreference(key, value) {
        if (!this.config.preferences) {
            this.config.preferences[key] = {};
        }
        this.config.preferences[key] = value;
        await this.updateConfig(this.config);
    }

    async updateSessionData(data) {
        if (!this.config.session) {
            this.config.session = {};
        }
        this.config.session = {
            ...this.config.session,
            ...data,
            lastLogin: new Date().toISOString()
        };
        await this.updateConfig(this.config);
    }
}

// Create singleton instance
const userConfigManager = new UserConfigManager();

export default userConfigManager;

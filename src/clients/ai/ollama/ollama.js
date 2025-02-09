import { logger } from "../../../utils/logger.js";
import installer from './installer.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { spawn } from 'child_process';
import readline from 'readline';
import fs from 'fs/promises';
import checkDiskSpace from 'check-disk-space';
import userConfigManager from "../../../core/user.js";

const execAsync = promisify(exec);

const DEFAULT_MODEL = 'deepseek-r1:1.5b';
const SELECTION_TIMEOUT = 30000; 

export const AVAILABLE_MODELS = [
    'deepseek-r1:1.5b',
    'deepseek-r1:7b',
    'deepseek-r1:8b',
    'deepseek-r1:14b',
    'deepseek-r1:32b',
    'deepseek-r1:70b',
    'deepseek-r1:671b',
    'llama3.3:70b',
    'sailor2:1b',
    'sailor2:8b',
    'sailor2:20b',
    'qwq:32b',  
    'marco-o1:7b',
    'tulu3:8b',
    'tulu3:70b',
    'athene-v2:72b',
    'opencoder:1.5b',
    'opencoder:8b',
    'llama3.2-vision:11b',
    'llama3.2-vision:90b',
    'smollm2:135m',
    'smollm2:360m',
    'smollm2:1.7b',
    'granite3-guardian:2b',
    'granite3-guardian:8b',
    'aya-expanse:8b',
    'aya-expanse:32b',
    'nemotron:70b',
    'llama3.2:1b',
    'llama3.2:3b',
    'qwen2.5:0.5b',
    'qwen2.5:1.5b',
    'qwen2.5:3b',
    'qwen2.5:7b',
    'qwen2.5:14b',
    'qwen2.5:32b',
    'qwen2.5:72b',
    'solar-pro:22b',
    'mistral-small:22b',
    'mistral-small:24b',
    'phi3.5:3.8b',
    'mistral-large:123b',
    'llama3.1:8b',
    'llama3.1:70b',
    'llama3.1:405b',
    'glm4:9b',
    'internlm2:1m',
    'internlm2:1.8b',
    'internlm2:7b',
    'internlm2:20b',
    'gemma2:2b',
    'gemma2:9b',
    'gemma2:27b',
    'qwen2:0.5b',
    'qwen2:1.5b',
    'qwen2:7b',
    'qwen2:72b',
    'codestral:22b',
    'phi3:3.8n',
    'phi3:14b',
    'llama3:8b',
    'llama3:70b',
    'mixtral:8x7b',
    'mixtral:8x22b',
    'mistral:7b',
    'llama2:7b',
    'llama2:13b',
    'llama2:70b',
    'codellama:7b',
    'codellama:13b',
    'codellama:34b',
    'codellama:70b',
    'neural-chat:7b',
    'openchat:13b',
    'zephyr:7b',
    'dolphin-phi:2.7b',
    'starling-lm:7b',
    'tinyllama:1.1b'
];

export const MODEL_SIZES = {
    'deepseek-r1:1.5b': 1.1,
    'deepseek-r1:7b': 4.7,
    'deepseek-r1:8b': 4.9,
    'deepseek-r1:14b': 9,
    'deepseek-r1:32b': 20,
    'deepseek-r1:70b': 43,
    'deepseek-r1:671b': 404,
    'llama3.3:70b': 43,
    'sailor2:1b': 1.1,
    'sailor2:8b': 5.2,
    'sailor2:20b': 12,
    'qwq:32b': 20,
    'marco-o1:7b': 4.7,
    'tulu3:8b': 4.9,
    'tulu3:70b': 43,
    'athene-v2:72b': 47,
    'opencoder:1.5b': 1.4,
    'opencoder:8b': 4.7,
    'llama3.2-vision:11b': 7.9,
    'llama3.2-vision:90b': 7.9,
    'smollm2:135m': 0.3,
    'smollm2:360m': 0.8,
    'smollm2:1.7b': 1.8,
    'granite3-guardian:2b': 2.7,
    'granite3-guardian:8b': 5.8,
    'aya-expanse:8b': 5.1,
    'aya-expanse:32b': 20,
    'nemotron:70b': 43,
    'llama3.2:1b': 1.3,
    'llama3.2:3b': 2.0,
    'qwen2.5:0.5b': 0.4,
    'qwen2.5:1.5b': 1,
    'qwen2.5:3b': 1.9,
    'qwen2.5:7b': 4.7,
    'qwen2.5:14b': 9,
    'qwen2.5:32b': 20,
    'qwen2.5:72b': 47,
    'solar-pro:22b': 13,
    'mistral-small:22b': 13,
    'mistral-small:24b': 14,
    'phi3.5:3.8b': 2.2,
    'mistral-large:123b': 73,
    'llama3.1:8b': 4.9,
    'llama3.1:70b': 43,
    'llama3.1:405b': 243,
    'glm4:9b': 5.5,
    'internlm2': 4.5,
    'internlm2:1m': 4.5,
    'internlm2:1.8b': 1.1,
    'internlm2:7b': 4.5,
    'internlm2:20b': 11,
    'gemma2:2b': 1.6,
    'gemma2:9b': 5.4,
    'gemma2:27b': 16,
    'qwen2:0.5b': 0.4,
    'qwen2:1.5b':  1,
    'qwen2:7b': 4.4,
    'qwen2:72b': 41,
    'codestral:22b': 13,
    'phi3:3.8n': 2.2,
    'phi3:14b': 7.9,
    'llama3:8b': 4.7,
    'llama3:70b': 40,
    'mixtral:8x7b': 26,
    'mixtral:8x22b': 80,
    'mistral:7b': 4.1,
    'llama2:7b': 3.8,
    'llama2:13b': 7.4,
    'llama2:70b': 39,
    'codellama:7b': 3.8,
    'codellama:13b': 7.4,
    'codellama:34b': 39,
    'codellama:70b': 3.8,
    'neural-chat:7b': 4.1,
    'openchat:13b': 4.1,
    'zephyr:7b': 4.1,
    'dolphin-phi:2.7': 1.6,
    'starling-lm:7b': 4.1,
    'tinyllama:1.1b': 0.638,
};


/**
 * Configuration type for OllamaClient
 * @typedef {Object} OllamaConfig
 * @property {number} [temperature=0.7] - Temperature for response generation
 * @property {string} [host="http://localhost:11434"] - Ollama API host
 * @property {string} [model="deepseek-r1:1.5b"] - Model identifier
 */

export class OllamaClient {
    constructor(config = {}) {
        this.config = {
            maxRetries: 3,
            retryDelay: 1000,
            timeout: 30000,
            temperature: config.temperature || 0.7
        };
        this.host = config.host || "http://localhost:11434";
        this.model = config.model || DEFAULT_MODEL;
        this.activeStreams = new Set();
        this.childProcess = null;
        this.initialized = false;
    }

    async selectOllamaModel() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise(async (resolve) => {
            console.log(chalk.cyan('\nSelect an Ollama model (30 seconds to choose):'));
            console.log(chalk.yellow(`Default model is ${DEFAULT_MODEL}`));

            // Print available models with numbers
            AVAILABLE_MODELS.forEach((model, index) => {
                console.log(chalk.white(`${index + 1}. ${model}`));
            });

            // Set timeout
            const timeout = setTimeout(() => {
                logger.info(chalk.yellow(`\nSelection timed out. Using default model: ${DEFAULT_MODEL}`));
                rl.close();
                resolve(DEFAULT_MODEL);
            }, SELECTION_TIMEOUT);

            // Handle user input
            rl.question(chalk.cyan('\nEnter model number (or press Enter for default): '), (answer) => {
                clearTimeout(timeout);
                rl.close();

                if (!answer.trim()) {
                    logger.info(chalk.green(`\nUsing default model: ${DEFAULT_MODEL}`));
                    resolve(DEFAULT_MODEL);
                    return;
                }

                const selection = parseInt(answer) - 1;
                if (selection >= 0 && selection < AVAILABLE_MODELS.length) {
                    const selectedModel = AVAILABLE_MODELS[selection];
                    logger.info(chalk.green(`\nSelected model: ${selectedModel}`));
                    resolve(selectedModel);
                } else {
                    logger.info(chalk.yellow(`\nInvalid selection. Using default model: ${DEFAULT_MODEL}`));
                    resolve(DEFAULT_MODEL);
                }
            });
        });
    }


    async initialize() {
        if (!this.initialized) {
            try {
                const installed = await installer.checkInstallation();
                if (!installed) await installer.install();
    
                const serviceRunning = await installer.checkService();
                if (!serviceRunning) await this.startService();
    
                // Set the model from user config or default
                const defaultModel = userConfigManager.getConfig()?.preferences?.defaultModel || DEFAULT_MODEL;
                this.model = defaultModel; // Ensure the model is set here
    
                // Pull the model if not already installed
                const installedModels = await this.listModels();
                if (!installedModels.includes(this.model)) {
                    await this.pullModel();
                }
    
                this.initialized = true;
                return true;
            } catch (error) {
                logger.error("Ollama initialization error:", error);
                throw error;
            }
        }
        return true;
    }
    


    async checkDiskSpace(modelName) {
        try {
            const modelSize = MODEL_SIZES[modelName];
            if (!modelSize) {
                logger.info(chalk.yellow(`\nWarning: Unknown size for model ${modelName}, using default estimate of 5GB`));
                return true;
            }
            
            const sizeInGB = modelSize;
            logger.info(chalk.blue(`\nChecking disk space for ${modelName} (${sizeInGB.toFixed(2)} GB required)`));
            
            // Calculate required space with 20% buffer
            const requiredSpace = sizeInGB * 1024 * 1024 * 1024 * 1.2;
            const requiredGB = requiredSpace / (1024 * 1024 * 1024);
            
            // Check available space
            try {
                const spaceInfo = await checkDiskSpace(process.env.HOME || process.cwd());
                const availableGB = Number(spaceInfo.free) / (1024 * 1024 * 1024);
                
                if (isNaN(availableGB)) {
                    throw new Error('Could not determine available space');
                }
                
                logger.info(chalk.blue(`Available space: ${availableGB.toFixed(2)} GB`));
                logger.info(chalk.blue(`Required space with buffer: ${requiredGB.toFixed(2)} GB`));
    
                if (spaceInfo.free < requiredSpace) {
                    logger.info(chalk.red('\nWarning: Insufficient disk space!'));
                    logger.info(chalk.yellow(`Required space: ${requiredGB.toFixed(2)} GB (including buffer)`));
                    logger.info(chalk.yellow(`Available space: ${availableGB.toFixed(2)} GB`));
                    
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
    
                    return new Promise((resolve) => {
                        rl.question(chalk.cyan('\nContinue anyway? (y/N): '), (answer) => {
                            rl.close();
                            if (answer.toLowerCase() === 'y') {
                                logger.info(chalk.yellow('\nProceeding with limited space...'));
                                resolve(true);
                            } else {
                                logger.info(chalk.red('\nDownload cancelled due to insufficient space.'));
                                resolve(false);
                            }
                        });
                    });
                }
    
                logger.info(chalk.green('Sufficient disk space available.'));
                return true;
                
            } catch (error) {
                throw new Error(`Failed to check disk space: ${error.message}`);
            }
        } catch (error) {
            logger.error('Error checking disk space:', error);
            logger.info(chalk.yellow('\nWarning: Could not verify available disk space.'));
            return true; // Allow download to proceed if we can't verify space
        }
    }

    async initializeClient() {
        try {
            const installed = await installer.checkInstallation();
            if (!installed) {
                await installer.install();
            }
    
            const serviceRunning = await installer.checkService();
            if (!serviceRunning) {
                await this.startService();
            }
    
            // Check user config for default model
            const defaultModel = userConfigManager.getConfig()?.preferences?.defaultModel;
            if (!this.model && !defaultModel) {
                this.model = await this.selectOllamaModel();
            } else if (defaultModel) {
                this.model = defaultModel;
            }
    
            const installedModels = await this.listModels();
            if (!installedModels.includes(this.model)) {
                await this.pullModel();
            }
    
            this.initialized = true;
            return true;
        } catch (error) {
            logger.error("Ollama initialization error:", error);
            throw error; 
        }
    }

    async checkService() {
        try {
            const response = await fetch('http://127.0.0.1:11434/api/version');
            return response.ok;
        } catch {
            return false;
        }
    }

    async getCurrentModel() {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.model; // Return the current model
    }

    async startService() {
        logger.info("Starting Ollama service...");
        try {
            logger.info(chalk.cyan('Initializing Ollama service...'));
            
            this.childProcess = exec('ollama serve', {
                detached: true,
                stdio: 'pipe'
            });

            // Wait for service to be ready
            let attempts = 0;
            const maxAttempts = 10;
            
            while (attempts < maxAttempts) {
                try {
                    const response = await fetch('http://localhost:11434/api/version');
                    if (response.ok) {
                        logger.info('\n' + chalk.green('Ollama service started successfully'));
                    return;
                    }
                } catch (error) {
                    attempts++;
                    if (attempts === maxAttempts) {
                        throw new Error('Service failed to start');
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    process.stdout.write('\r' + chalk.cyan(`Waiting for service to start${'.'.repeat(attempts)}`));
                }
            }
        } catch (error) {
            logger.error('Failed to start Ollama service:', error);
            throw error;
        }
    }

    async stopService() {
        if (this.childProcess) {
            logger.info("Stopping Ollama service...");
            this.childProcess.kill('SIGTERM'); // Gracefully terminate the service
            this.childProcess = null; // Clear the child process reference
            logger.success("Ollama service stopped successfully");
        }
    }


    async pullModel() {
        try {
            // Check disk space before pulling
            const hasSpace = await this.checkDiskSpace(this.model);
            if (!hasSpace) {
                throw new Error('Insufficient disk space');
            }
    
            logger.info(chalk.cyan(`\nPulling model ${this.model}...`));
            logger.info(chalk.dim('Initializing download (this might take a few moments)...'));
                
            return new Promise((resolve, reject) => {
                const pullProcess = spawn('ollama', ['pull', this.model], {
                    shell: true,
                    env: { ...process.env }
                });
                
                let errorOutput = '';
                let lastProgressLine = '';
                let downloadStarted = false;
    
                // Handle stderr (progress updates)
                pullProcess.stderr.on('data', (data) => {
                    const output = data.toString().trim();
                    
                    // Extract just the progress information
                    if ((output.includes('MB/') || output.includes('GB/')) && output.includes('%') && output.includes('▕')) {
                        downloadStarted = true;
                        const match = output.match(/(\d+% ▕.*▏.*(?:MB|GB)\/.*(?:MB|GB).*MB\/s.*s)/);
                        if (match) {
                            const progressOnly = match[1];
                            lastProgressLine = progressOnly;
                            process.stdout.write('\r' + chalk.cyan(progressOnly.padEnd(process.stdout.columns)));
                        }
                    } else if (!downloadStarted && output.includes('Error')) {
                        errorOutput += output + '\n';
                    }
                });
    
                // Add timeout to show feedback if nothing happens
                const initTimeout = setTimeout(() => {
                    if (!downloadStarted) {
                        logger.info(chalk.yellow('\nStill waiting for download to begin...'));
                    }
                }, 5000);
    
                pullProcess.on('close', (code) => {
                    clearTimeout(initTimeout);
                    if (lastProgressLine) logger.info();
                    
                    if (code === 0) {
                        logger.info(chalk.green('Model pulled successfully!'));
                        resolve(true);
                    } else {
                        const error = errorOutput || 'Download failed or was interrupted';
                        logger.info(chalk.red(`\nError: ${error}`));
                        reject(new Error(error));
                    }
                });
    
                pullProcess.on('error', (error) => {
                    clearTimeout(initTimeout);
                    reject(new Error(`Failed to start pull process: ${error.message}`));
                });
            });
    
        } catch (error) {
            logger.error(`Failed to pull model ${this.model}:`, error);
            throw error;
        }
    }


    async sendMessage(message) {
        if (!this.initialized) await this.initialize();
        
        const requestBody = {
            model: this.model,
            messages: [
                { role: "user", content: message }
            ],
            temperature: this.config.temperature,
            stream: false
        };

        try {
            const response = await fetch(`${this.host}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.message?.content || "No response from Ollama.";
        } catch (error) {
            logger.error("Error sending message to Ollama:", error);
            throw error;
        }
    }

    async streamMessage(message) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const response = await fetch(`${this.host}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: "user", content: message }
                    ],
                    stream: true
                }),
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const stream = response.body;
            this.activeStreams.add(stream);

            return {
                stream,
                cleanup: () => {
                    this.activeStreams.delete(stream);
                    stream.cancel();
                }
            };
        } catch (error) {
            logger.error("Error streaming message:", error);
            throw error;
        }
    }

    async sendToOllama(message, systemMessage = '', stream = false) {
        try {
            const response = await fetch(`${this.host}/api/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        ...(systemMessage ? [{ role: "system", content: systemMessage }] : []),
                        { role: "user", content: message }
                    ],
                    stream
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            if (stream) {
                return response.body;
            } else {
                const data = await response.json();
                const content = data.message?.content;
                return content || "No response from Ollama.";
            }
        } catch (error) {
            logger.error("Error sending to Ollama:", error);
            throw error;
        }
    }
    
    async sendRawMessage(message) {
        try {
            const requestBody = {
                model: this.model,
                messages: [
                    { role: "user", content: message }
                ],
                temperature: this.config.temperature,
                stream: false
            };
    
            const response = await fetch(`${this.host}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            const data = await response.json();
            return data.message?.content || "No response from Ollama.";
        } catch (error) {
            logger.error("Error sending message to Ollama:", error);
            throw error;
        }
    }


    async generateEmbedding(input) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const response = await fetch(`${this.host}/api/embeddings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: this.model,
                    input: input,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.embedding;
        } catch (error) {
            logger.error("Error generating embedding:", error);
            throw error;
        }
    }

    async listModels() {
        try {
            const { stdout } = await execAsync('ollama list');
            const models = stdout.split('\n')
                .filter(line => line.trim())
                .map(line => line.split(/\s+/)[0]);
            return models;
        } catch (error) {
            logger.error('Error listing models:', error);
            return [];
        }
    }
    
    async verifyOllamaInstallation() {
        try {
            // Check if Ollama is installed via Homebrew
            const { stdout: brewPath } = await execAsync('brew list ollama').catch(() => ({ stdout: '' }));
            
            if (!brewPath) {
                logger.info("Ollama not found in Homebrew, checking Applications...");
                // Check if Ollama.app exists in Applications
                const macApps = await fs.readdir('/Applications').catch(() => []);
                if (!macApps.includes('Ollama.app')) {
                    logger.error("Ollama not found in Applications");
                    logger.info(chalk.red("\nError: Ollama not found. Please install Ollama first:"));
                    logger.info(chalk.cyan("\n1. Visit https://ollama.ai"));
                    logger.info(chalk.cyan("2. Download and install Ollama for Mac"));
                    logger.info(chalk.cyan("3. Launch Ollama from Applications"));
                    throw new Error("Ollama not installed");
                }
            }
    
            // Check if Ollama service is running
            try {
                const response = await fetch('http://127.0.0.1:11434/api/version');
                if (!response.ok) {
                    throw new Error("Service not responding");
                }
            } catch (error) {
                logger.error("Ollama service not running");
                logger.info(chalk.yellow("\nOllama service is not running. Please:"));
                logger.info(chalk.cyan("1. Open Ollama from your Applications folder"));
                logger.info(chalk.cyan("2. Look for the Ollama icon in your menu bar"));
                logger.info(chalk.cyan("3. Wait a few seconds for the service to start"));
                throw new Error("Ollama service not running");
            }
    
            return true;
        } catch (error) {
            throw error;
        }
    }

    async cleanup() {
        try {
            logger.info("Cleaning up Ollama client...");
            
            // Cancel all active streams
            for (const stream of this.activeStreams) {
                stream.cancel();
            }
            this.activeStreams.clear();

            // Abort any ongoing requests
            await fetch(`${this.host}/api/abort`, {
                method: "POST"
            }).catch(error => {
                logger.warn("Error during abort request:", error);
            });

            // Stop the Ollama service gracefully
            await this.stopService();

            this.initialized = false;
            logger.success("Ollama client cleanup completed");
        } catch (error) {
            logger.error("Error during Ollama cleanup:", error);
            throw error;
        }
    }
}

// Create default instance  
const ollama = new OllamaClient();

export default ollama;

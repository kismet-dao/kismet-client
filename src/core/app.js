import { AIManager } from './engine.js';
import MemorySystem from './memory.js';
import chalk from 'chalk';
import ora from 'ora';
import { createPromptInterface } from '../utils/readline/prompt.js';
import userConfigManager from './user.js';
import ollamaClient from '../clients/ai/index.js';
import readline from 'readline';

export class Application {
    constructor() {
        this.aiManager = new AIManager();
        this.memorySystem = null;
        this.isRunning = false;
        this.config = null;
        this.rl = null;
    }

    async start() {
        try {
            // Initialize user config first
            await userConfigManager.initialize();
            this.config = userConfigManager.getConfig();

            // Initialize Memory System
            this.memorySystem = MemorySystem.getInstance({
                engine: this.aiManager, 
                serviceManager: null // Add service manager if needed
            });
            await this.memorySystem.initialize();

            // Set default model from config
            if (this.config.preferences.defaultModel) {
                await ollamaClient.setModel(this.config.preferences.defaultModel);
            }

            // Initialize AI client
            await this.aiManager.initClient();

            this.isRunning = true;
            this.startPrompt();
        } catch (error) {
            console.error(chalk.red('Startup failed:', error.message));
            await this.cleanup();
        }
    }   


    startPrompt() {
        const userName = this.config.profile.name || 'User';
        const userPrefix = chalk.blue(`${userName}: `);
        const aiPrefix = chalk.magenta('AI: ');
        const maxWidth = 75;
        const divider = chalk.gray('─'.repeat(maxWidth));
    
        const formatOutput = (text) => {
            const lines = [];
            let line = '';
            const words = text.split(' ');
    
            for (const word of words) {
                if ((line + word).length > maxWidth) {
                    lines.push(line);
                    line = word;
                } else {
                    line = line ? `${line} ${word}` : word;
                }
            }
            if (line) lines.push(line);
            return lines;
        };
    
        const formatThoughtProcess = (text) => {
            const thoughtPrefix = chalk.gray('│ ');
            const thoughtSuffix = chalk.gray(' │');
            const thoughtTop = chalk.gray('┌' + '─'.repeat(maxWidth - 2) + '┐');
            const thoughtBottom = chalk.gray('└' + '─'.repeat(maxWidth - 2) + '┘');
    
            const formattedLines = formatOutput(text);
            const thoughtLines = formattedLines.map(line => `${thoughtPrefix}${chalk.gray(line.padEnd(maxWidth - 4, ' '))}${thoughtSuffix}`);
    
            return [
                thoughtTop,
                ...thoughtLines,
                thoughtBottom
            ].join('\n');
        };
    
        this.rl = createPromptInterface({
            prompt: userPrefix,
            onLine: async (input, rl) => {
                if (!input.trim()) {
                    rl.prompt();
                    return;
                }
            
                if (input.toLowerCase() === 'exit') {
                    await this.cleanup();
                    process.exit(0);
                }
            
                // Clear the current line and manually write the input
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                const userName = this.config.profile.name || 'User';
                const userPrefix = chalk.blue(`${userName}: `);
                process.stdout.write(userPrefix + input + '\n');
            
                console.log(divider);
            
                const spinner = ora({ text: chalk.yellow('Thinking...'), spinner: 'dots' }).start();
            
                try {
                    const response = await this.aiManager.sendMessage(input);
                    spinner.stop();
    
                    // Extract thought process from response (if any)
                    const thoughtStart = response.indexOf('<think>');
                    const thoughtEnd = response.indexOf('</think>');
                    let thoughtProcess = '';
                    let aiResponse = response;
    
                    if (thoughtStart !== -1 && thoughtEnd !== -1) {
                        thoughtProcess = response.slice(thoughtStart + 7, thoughtEnd).trim();
                        aiResponse = response.slice(0, thoughtStart) + response.slice(thoughtEnd + 8);
                    }
    
                    // Display thought process (if any)
                    if (thoughtProcess) {
                        console.log(formatThoughtProcess(thoughtProcess));
                        console.log(divider);
                    }
    
                    // Display AI response
                    const formattedLines = formatOutput(aiResponse.trim());
                    console.log(`${aiPrefix}${chalk.white(formattedLines[0])}`);
                    for (let i = 1; i < formattedLines.length; i++) {
                        console.log(`${chalk.white(formattedLines[i])}`);
                    }
                    console.log(divider);
                } catch (error) {
                    spinner.fail(chalk.red('Error: ' + error.message));
                } finally {
                    rl.prompt();
                }
            },
            onClose: async () => { // Arrow function
                await this.cleanup();
                process.exit(0);
            }
        });

        this.rl.prompt();
    }
    
    async cleanup() {
        console.log('Cleaning up application...'); 
        if (this.rl) {
            this.rl.close();
        }
        await this.aiManager.cleanup();
        
        // Clean up memory system
        if (this.memorySystem) {
            await this.memorySystem.cleanup();
        }
        
        this.isRunning = false;
        console.log('Application cleanup completed'); 
    }
}
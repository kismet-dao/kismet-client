import readline from 'readline';
import chalk from 'chalk';

export function createPromptInterface({ prompt, onLine, onClose }) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        crlfDelay: Infinity,
        escapeCodeTimeout: 500
    });

    rl.setMaxListeners(0);
    rl.setPrompt(prompt);

    rl.on('line', async (input) => {
        const trimmedInput = input.trim();
        
        if (!trimmedInput) {
            rl.prompt();
            return;
        }
    
        try {
            await onLine(trimmedInput, rl);
        } catch (error) {
            console.error(chalk.red('Unexpected error:', error.message));
        } finally {
            if (process.stdin.isPaused()) {
                process.stdin.resume();
            }
        }
    });

    rl.on('close', () => {
        console.log(chalk.yellow('\nReadline interface closed. Attempting to reopen...'));
        onClose();
        process.stdin.resume();
        rl.prompt();
    });

    rl.on('SIGINT', () => {
        console.log(chalk.yellow('\nSIGINT received, preventing exit...'));
        console.log(chalk.yellow('Use "exit" to quit.'));
        rl.prompt();
    });

    rl.prompt();
    return rl;
}
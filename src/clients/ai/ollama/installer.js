    // src/clients/ai/ollama/installer.js
    import { platform, homedir } from 'os';  // Add homedir import
    import { exec } from 'child_process';
    import { promisify } from 'util';
    import fs from 'fs/promises';
    import { createWriteStream, existsSync } from 'fs';
    import path from 'path';
    import { fileURLToPath } from 'url';
    import https from 'https';
    import chalk from 'chalk';

    const execAsync = promisify(exec);
    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    class OllamaInstaller {
        constructor() {
            this.platform = platform();
            this.installUrls = {
                darwin: 'https://ollama.ai/download/Ollama-darwin.zip',
                win32: 'https://ollama.ai/download/OllamaSetup.exe',
                linux: 'https://ollama.ai/install.sh'
            };
        }


        async downloadWithCurl(url, destPath) {
            try {
                console.log(chalk.cyan(`Downloading with curl from ${url}...`));
                // -L to follow redirects, -o for output file
                await execAsync(`curl -L "${url}" -o "${destPath}"`);
                
                // Verify file exists and has content
                const stats = await fs.stat(destPath);
                if (stats.size === 0) {
                    throw new Error('Downloaded file is empty');
                }
                
                return true;
            } catch (error) {
                console.log('Curl download failed:', error.message);
                return false;
            }
        }
        
        
        async downloadWithWget(url, destPath) {
            try {
                console.log(chalk.cyan(`Downloading with wget from ${url}...`));
                await execAsync(`wget "${url}" -O "${destPath}"`);
                return true;
            } catch (error) {
                console.log('Wget download failed:', error.message);
                return false;
            }
        }
        
        async downloadFile(url, destPath) {
            // Try curl first
            const curlSuccess = await this.downloadWithCurl(url, destPath);
            if (curlSuccess) return;
        
            // Try wget if curl fails
            const wgetSuccess = await this.downloadWithWget(url, destPath);
            if (wgetSuccess) return;
        
            // If both fail, try native https download
            return new Promise((resolve, reject) => {
                console.log(chalk.cyan(`Falling back to native download from ${url}...`));
                const file = createWriteStream(destPath);
                
                const request = https.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                    },
                    followRedirect: true
                }, response => {
                    if (response.statusCode === 302 || response.statusCode === 301 || response.statusCode === 307) {
                        file.close();
                        this.downloadFile(response.headers.location, destPath)
                            .then(resolve)
                            .catch(reject);
                        return;
                    }
        
                    if (response.statusCode !== 200) {
                        reject(new Error(`Failed to download: ${response.statusCode}`));
                        return;
                    }
        
                    response.pipe(file);
        
                    file.on('finish', () => {
                        file.close();
                        console.log(chalk.green('Download completed'));
                        resolve();
                    });
                });
        
                request.on('error', error => {
                    fs.unlink(destPath).catch(() => {});
                    reject(error);
                });
        
                file.on('error', error => {
                    fs.unlink(destPath).catch(() => {});
                    reject(error);
                });
            });
        }

    async checkHomebrew() {
        try {
            await execAsync('which brew');
            return true;
        } catch {
            return false;
        }
    }

    async checkMacOSVersion(minVersion) {
        try {
            const { stdout } = await execAsync('sw_vers -productVersion');
            const currentVersion = stdout.trim().split('.');
            const requiredVersion = minVersion.split('.');

            for (let i = 0; i < requiredVersion.length; i++) {
                if (parseInt(currentVersion[i] || '0', 10) < parseInt(requiredVersion[i], 10)) {
                    return false;
                }
            }
            return true;
        } catch (error) {
            console.error('Failed to determine macOS version:', error.message);
            return false;
        }
    }

    async install() {
        try {
            console.log(chalk.cyan('Starting Ollama installation...'));
            const tempDir = await fs.mkdtemp(path.join(path.resolve(), 'ollama-'));
            console.log(`Using temporary directory: ${tempDir}`);

            switch (this.platform) {
                case 'darwin': {
                    console.log(chalk.cyan('Installing Ollama for macOS...'));

                    const minVersion = "11.0"; // Minimum macOS version for Homebrew
                    const isSupportedVersion = await this.checkMacOSVersion(minVersion);

                    if (!isSupportedVersion) {
                        console.log(chalk.yellow(`macOS version below ${minVersion}. Falling back to manual installation.`));
                        await this.manualInstall(tempDir);
                        break;
                    }

                    const hasHomebrew = await this.checkHomebrew();
                    if (hasHomebrew) {
                        try {
                            console.log('Homebrew found, attempting installation via brew...');
                            await execAsync('brew install ollama');
                            console.log(chalk.green('Ollama installed successfully via Homebrew.'));
                        } catch (brewError) {
                            console.log('Homebrew installation failed, falling back to manual installation...');
                            await this.manualInstall(tempDir);
                        }
                    } else {
                        console.log('Homebrew not found, proceeding with manual installation...');
                        await this.manualInstall(tempDir);
                    }

                    break;
                }

                // Other platforms remain unchanged
                case 'win32': {
                    console.log(chalk.cyan('Installing Ollama for Windows...'));
                    const exePath = path.join(tempDir, 'OllamaSetup.exe');
                    await this.downloadFile(this.installUrls.win32, exePath);
                    await execAsync(`"${exePath}"`);
                    console.log(chalk.green('Ollama installation started.'));
                    break;
                }
                case 'linux': {
                    console.log(chalk.cyan('Installing Ollama for Linux...'));
                    const scriptPath = path.join(tempDir, 'install.sh');
                    await this.downloadFile(this.installUrls.linux, scriptPath);
                    await execAsync(`chmod +x "${scriptPath}"`);
                    await execAsync(`sh "${scriptPath}"`);
                    console.log(chalk.green('Ollama installed successfully.'));
                    break;
                }

                default:
                    throw new Error(`Unsupported platform: ${this.platform}`);
            }

            await fs.rm(tempDir, { recursive: true, force: true });
            console.log(chalk.green('Installation completed successfully.'));
            return true;
        } catch (error) {
            console.error(chalk.red('Installation failed:', error.message));
            throw error;
        }
    }

        
    async manualInstall(tempDir) {
        const zipPath = path.join(tempDir, 'Ollama.zip');
        console.log('Downloading Ollama...');
        await this.downloadFile(this.installUrls.darwin, zipPath);
        
        console.log('Extracting Ollama.app...');
        const extractPath = path.join(tempDir, 'Ollama.app');
        await execAsync(`unzip -o "${zipPath}" -d "${tempDir}"`);
        
        console.log('Placing Ollama.app in Applications...');
        const destination = '/Applications/Ollama.app';
        await execAsync(`mv -f "${extractPath}" "${destination}"`);
        console.log(chalk.green('Ollama.app moved successfully.'));
        
        console.log('Launching Ollama to initialize...');
        await execAsync(`open "${destination}"`);
    }


        async checkInstallation() {
            try {
                switch (this.platform) {
                    case 'darwin':
                        const macApps = await fs.readdir('/Applications').catch(() => []);
                        if (macApps.includes('Ollama.app')) return true;
                        await execAsync('brew list ollama');
                        return true;
                    case 'win32':
                        await execAsync('where ollama');
                        return true;
                    case 'linux':
                        await execAsync('which ollama');
                        return true;
                    default:
                        return false;
                }
            } catch {
                return false;
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

        printServiceInstructions() {
            console.log(chalk.yellow('\nOllama service is not running. To start it:'));
            
            switch (this.platform) {
                case 'darwin':
                    console.log(chalk.cyan('\nFor macOS:'));
                    console.log('1. Open Ollama from Applications folder');
                    console.log('2. Look for the Ollama icon in your menu bar');
                    break;
                case 'win32':
                    console.log(chalk.cyan('\nFor Windows:'));
                    console.log(chalk.white('ollama serve'));
                    break;
                case 'linux':
                    console.log(chalk.cyan('\nFor Linux:'));
                    console.log(chalk.white('ollama serve'));
                    break;
            }
        }
    }

    export const installer = new OllamaInstaller();
    export default installer;
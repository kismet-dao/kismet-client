import express from 'express';
import bodyParser from 'body-parser';
import { AIManager } from './src/core/engine.js'; // Import your AI logic
import userConfigManager from './src/core/user.js';
import ollama, { AVAILABLE_MODELS,  } from './src/clients/ai/ollama/ollama.js';
import { PostgresStorageManager } from './src/utils/storage/postgres.js'; // Import the storage manager
import cors from 'cors'; // Import the cors middleware
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import addonManager from './src/core/addon.js'; 
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';
import os from 'os';
import WalletService from './src/services/wallet.service.js';


const execAsync = promisify(exec);

const app = express();
const port = 3000;

// Get current file path and directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define config paths
const PROJECT_ROOT = path.resolve(__dirname);
const DEFAULT_CONFIG_PATH = path.join(PROJECT_ROOT, 'resources', 'config', 'user', 'settings.json');

// Enable CORS for all routes
app.use(cors({
    origin: ['http://127.0.0.1:1430', 'tauri://localhost'], // Allow Tauri and localhost
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
}));

// Middleware
app.use(bodyParser.json());

// Initialize AI Manager
const aiManager = new AIManager();

// Initialize PostgreSQL Storage Manager
const storageManager = new PostgresStorageManager();

// Initialize the wallet service
const walletService = new WalletService();

// Add this after your other middleware setup
app.use('/api/wallet', walletService.getRouter());

// Initialize AI Manager, Storage Manager, and User Config Manager
Promise.all([
    aiManager.initClient(),
    storageManager.initialize(),
    userConfigManager.initializeGUI(), // Initialize user configuration
])
    .then(() => {
        console.log('✅ AI client, PostgreSQL storage manager, and user config manager initialized successfully');
    })
    .catch((error) => {
        console.error('❌ Initialization failed:', error);
        process.exit(1); // Exit the server if initialization fails
    });

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.originalUrl;

    // Log the request details
    console.log(`[${timestamp}] ${method} ${url}`);

    // Attach a listener to log the response status code
    res.on('finish', () => {
        const statusCode = res.statusCode;
        console.log(`[${timestamp}] ${method} ${url} - ${statusCode}`);
    });

    next(); // Pass control to the next middleware/route handler
});


// Chat endpoints
app.post('/api/chat', async (req, res) => {
    const { message, chatId: providedChatId } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        // Use provided chatId or create a new one
        const chatId = providedChatId || await storageManager.createChatSession();

        // Save user message
        await storageManager.saveChatMessage(chatId, 'user', message);

        // Get AI response
        const response = await aiManager.sendMessage(message);

        // Save AI response
        await storageManager.saveChatMessage(chatId, 'ai', response);

        res.json({ response, chatId });
    } catch (error) {
        console.error('Error processing message:', error);
        res.status(500).json({ error: 'Failed to process message' });
    }
});

app.get('/api/chat/history/:chatId', async (req, res) => {
    const { chatId } = req.params;

    try {
        const history = await storageManager.getChatHistory(chatId);
        res.json({ messages: history });
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ error: 'Failed to fetch chat history' });
    }
});

app.post('/api/chat/session', async (req, res) => {
    console.log('🔍 Received request to create new chat session'); // Added explicit console log
    
    try {
        const chatId = await storageManager.createChatSession();
        
        // More detailed logging
        console.log(`✅ Chat session created successfully`);
        console.log(`📝 Session ID: ${chatId}`);
        
        res.status(200).json({ chatId });
    } catch (error) {
        // Enhanced error logging
        console.error('❌ Error creating chat session:', error);
        console.error(`📢 Error details: ${error.message}`);
        console.error(`📢 Error stack: ${error.stack}`);
        
        res.status(500).json({ 
            error: 'Failed to create chat session',
            details: error.message 
        });
    }
});

app.get('/api/chat/sessions', async (req, res) => {
    try {
        const sessions = await storageManager.getAllChatSessions(); // Implement this method in your storage manager
        res.json({ sessions });
    } catch (error) {
        console.error('Error fetching chat sessions:', error);
        res.status(500).json({ error: 'Failed to fetch chat sessions' });
    }
});

// GET settings endpoint - Should return 404 if no settings exist
app.get('/api/settings', async (req, res) => {
    try {
        // Check if settings file exists
        try {
            await fs.access(DEFAULT_CONFIG_PATH);
            const configData = await fs.readFile(DEFAULT_CONFIG_PATH, 'utf8');
            const config = JSON.parse(configData);
            res.json(config);
        } catch (error) {
            // File doesn't exist or can't be read - return 404
            res.status(404).json({ error: 'Settings not found' });
        }
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// Update the stop endpoint implementation
app.post('/api/ollama/stop', async (req, res) => {
    console.log('\n🛑 Attempting to stop Ollama service...');
    try {
        console.log('1. Checking if service is running...');
        const serviceRunning = await ollama.checkService();
        console.log(`   Service running status: ${serviceRunning}`);

        if (!serviceRunning) {
            console.log('   ⚠️ Service is not running, returning early');
            return res.status(400).json({ error: 'Ollama service is not running' });
        }

        console.log('2. Attempting to cleanup Ollama...');
        await ollama.cleanup();
        console.log('   ✅ Cleanup completed');

        // Verify service was actually stopped
        console.log('3. Verifying service has stopped...');
        const serviceStillRunning = await ollama.checkService();
        console.log(`   Service still running: ${serviceStillRunning}`);

        if (serviceStillRunning) {
            console.log('   ⚠️ Service is still running after cleanup!');
            // Try force killing the process
            console.log('4. Attempting to force kill Ollama process...');
            try {
                // Use platform-specific commands
                if (process.platform === 'win32') {
                    await execAsync('taskkill /F /IM ollama.exe');
                } else {
                    await execAsync('pkill -f ollama');
                }
                console.log('   ✅ Force kill command executed');
            } catch (killError) {
                console.log(`   ⚠️ Force kill attempted: ${killError.message}`);
                // Even if the kill command fails with an error, it might have worked
                // So we'll continue and check the status again
            }

            // Final verification
            const finalCheck = await ollama.checkService();
            if (finalCheck) {
                throw new Error('Failed to stop Ollama service after multiple attempts');
            }
        }

        console.log('5. Sending success response');
        res.json({ message: 'Ollama service stopped successfully' });
    } catch (error) {
        console.error('❌ Error stopping Ollama service:', error);
        res.status(500).json({ 
            error: 'Failed to stop Ollama service',
            details: error.message 
        });
    }
});

let pullProgress = {}; // Store progress for each model

app.post('/api/ollama/pull/:model', async (req, res) => {
    const model = req.params.model;

    if (!model) {
        return res.status(400).json({ error: 'Model name is required' });
    }

    try {
        // Start the pull process
        const pullProcess = spawn('ollama', ['pull', model], {
            shell: true,
            env: { ...process.env }
        });

        pullProcess.stderr.on('data', (data) => {
            const output = data.toString().trim();
            if ((output.includes('MB/') || output.includes('GB/')) && output.includes('%')) {
                const match = output.match(/(\d+)%.*?([\d.]+\s*(?:MB|GB)).*?([\d.]+\s*(?:MB|GB)).*?([\d.]+\s*MB\/s)/);
                if (match) {
                    const [, percentage, downloaded, total, speed] = match;
                    pullProgress[model] = {
                        status: 'downloading',
                        progress: parseInt(percentage),
                        downloaded,
                        total,
                        speed
                    };
                }
            }
        });

        pullProcess.on('close', (code) => {
            if (code === 0) {
                pullProgress[model] = { status: 'complete', message: 'Model pulled successfully' };
            } else {
                pullProgress[model] = { status: 'error', message: `Pull process exited with code ${code}` };
            }
        });

        pullProcess.on('error', (error) => {
            pullProgress[model] = { status: 'error', message: error.message };
        });

        res.json({ message: 'Pull process started' });
    } catch (error) {
        console.error('Error initiating pull process:', error);
        res.status(500).json({ error: 'Failed to pull model', details: error.message });
    }
});

// New endpoint to check progress
app.get('/api/ollama/pull/progress/:model', (req, res) => {
    const model = req.params.model;
    const progress = pullProgress[model] || { status: 'unknown', message: 'No progress data available' };
    res.json(progress);
});

// Start Ollama service
app.post('/api/ollama/start', async (req, res) => {
    console.log('\n▶️ Attempting to start Ollama service...');
    try {
        console.log('1. Checking if service is already running...');
        const serviceRunning = await ollama.checkService();
        console.log(`   Service running status: ${serviceRunning}`);

        if (serviceRunning) {
            console.log('   ⚠️ Service is already running, returning early');
            return res.status(400).json({ error: 'Ollama service is already running' });
        }

        console.log('2. Starting Ollama service...');
        await ollama.startService();
        
        // Verify service started successfully
        console.log('3. Verifying service has started...');
        const serviceStarted = await ollama.checkService();
        console.log(`   Service started successfully: ${serviceStarted}`);

        console.log('4. Sending success response');
        res.json({ message: 'Ollama service started successfully' });
    } catch (error) {
        console.error('❌ Error starting Ollama service:', error);
        res.status(500).json({ 
            error: 'Failed to start Ollama service',
            details: error.message 
        });
    }
});

// Get Ollama service status
app.get('/api/ollama/status', async (req, res) => {
    console.log('\n📊 Checking Ollama service status...');
    try {
        console.log('1. Verifying Ollama installation...');
        const installed = await ollama.verifyOllamaInstallation();
        console.log(`   Installation verified: ${installed}`);

        console.log('2. Checking if service is running...');
        const serviceRunning = await ollama.checkService();
        console.log(`   Service running status: ${serviceRunning}`);

        console.log('3. Sending status response');
        res.json({
            installed,
            running: serviceRunning
        });
    } catch (error) {
        console.error('❌ Error checking Ollama status:', error);
        res.status(500).json({ 
            error: 'Failed to check Ollama status',
            details: error.message 
        });
    }
});

// POST settings endpoint - Create or update settings
app.post('/api/settings', async (req, res) => {
    try {
        const {
            // Settings from wizard
            theme,
            notifications,
            logLevel,
            profile,
            preferences
        } = req.body;

        // Create base config structure with null defaults
        const config = {
            settings: {
                theme: theme || null,
                notifications: notifications !== undefined ? notifications : null,
                logLevel: logLevel || null
            },
            profile: {
                name: profile?.name || null,
                timezone: profile?.timezone || null,
                preferredLanguage: profile?.preferredLanguage || null,
                useVoiceOutput: profile?.useVoiceOutput !== undefined ? profile.useVoiceOutput : null
            },
            preferences: {
                defaultModel: preferences?.defaultModel || null,
                defaultCharacter: preferences?.defaultCharacter || null
            }
        };

        // Ensure directory exists using fs.promises
        const configDir = path.dirname(DEFAULT_CONFIG_PATH);
        await fs.mkdir(configDir, { recursive: true });

        // Write config file using fs.promises
        await fs.writeFile(
            DEFAULT_CONFIG_PATH,
            JSON.stringify(config, null, 2),
            'utf8'
        );

        res.json({
            message: 'Settings saved successfully',
            config
        });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});


app.post('/api/logout', async (req, res) => {
    try {
        console.log('Initiating logout process...');

        // Delete empty chat sessions
        await storageManager.deleteEmptyChatSessions();

        // Send success response with a delay signal
        res.json({ 
            message: 'Logout successful',
            shouldClose: true // Signal to client that it should close
        });

        // Delay server shutdown to ensure response is sent
        setTimeout(() => {
            console.log('Shutting down server...');
            server.close(() => {
                console.log('Server has been shut down.');
                process.exit(0);
            });
        }, 1000); // 1-second delay before shutting down the server

    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ 
            error: 'Failed to logout',
            details: error.message 
        });
    }
});

// Fetch current model
app.get('/api/current-model', async (req, res) => {
    try {
        const currentModel = await aiManager.getCurrentModel(); // Use AIManager to fetch the current model
        res.json({ model: currentModel });
    } catch (error) {
        console.error('Error fetching current model:', error);
        res.status(500).json({ error: 'Failed to fetch current model' });
    }
});

// Fetch available models
app.get('/api/ollama/models', async (req, res) => {
    try {
        const models = AVAILABLE_MODELS; // Use the list of available models
        res.json({ models });
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});

// Add this to your existing server.js file
app.get('/api/models', async (req, res) => {
    try {
        // Get API keys from environment
        const hasOpenAI = process.env.OPENAI_API_KEY;
        const hasAnthropic = process.env.CLAUDE_API_KEY;
        const hasGoogle = process.env.GOOGLE_AI_API_KEY;
        const hasCohere = process.env.COHERE_API_KEY;

        // Filter models based on available API keys
        let availableModels = [];

        if (hasOpenAI) {
            availableModels = availableModels.concat(API_MODELS.openai.map(model => `openai/${model}`));
        }
        if (hasAnthropic) {
            availableModels = availableModels.concat(API_MODELS.anthropic.map(model => `anthropic/${model}`));
        }
        if (hasGoogle) {
            availableModels = availableModels.concat(API_MODELS.google.map(model => `google/${model}`));
        }
        if (hasCohere) {
            availableModels = availableModels.concat(API_MODELS.cohere.map(model => `cohere/${model}`));
        }

        res.json({
            models: availableModels,
            providers: {
                openai: !!hasOpenAI,
                anthropic: !!hasAnthropic,
                google: !!hasGoogle,
                cohere: !!hasCohere
            }
        });
    } catch (error) {
        console.error('Error fetching API models:', error);
        res.status(500).json({ 
            error: 'Failed to fetch API models',
            details: error.message 
        });
    }
});

// Switch model
app.post('/api/switch-model', async (req, res) => {
    const { model } = req.body;

    if (!model) {
        return res.status(400).json({ error: 'Model name is required' });
    }

    try {
        // Set the new model using AIManager
        await aiManager.setModel(model);
        res.json({ message: `Model switched to ${model}` });
    } catch (error) {
        console.error('Error switching model:', error);
        res.status(500).json({ error: 'Failed to switch model' });
    }
});

app.post('/api/upload', async (req, res) => {
    if (!req.files || !req.files.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.files.file;
    const filePath = `./uploads/${file.name}`;

    try {
        await file.mv(filePath); // Save the file
        res.json({ message: 'File uploaded successfully', filePath });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});


// Endpoint to update API keys
app.post('/api/update-keys', async (req, res) => {
    const {
        openaiApiKey,
        googleAiApiKey,
        huggingfaceApiKey,
        stabilityApiKey,
        claudeApiKey,
        replicateApiToken,
        pineconeApiKey,
        serpapiApiKey,
        elevenLabsApiKey,
        xaiApiKey,
        cohereApiKey
    } = req.body;

    // Validate that at least one key is provided
    if (!openaiApiKey && !googleAiApiKey && !huggingfaceApiKey && !stabilityApiKey && !claudeApiKey &&
        !replicateApiToken && !pineconeApiKey && !serpapiApiKey && !elevenLabsApiKey && !xaiApiKey && !cohereApiKey) {
        return res.status(400).json({ error: 'At least one API key is required' });
    }

    try {
        // Path to the .env file
        const envFilePath = path.join(__dirname, '.env');

        // Read the existing .env file
        let envFileContent = fs.readFileSync(envFilePath, 'utf8');

        // Update the API keys in the .env file content
        if (openaiApiKey) envFileContent = updateEnvVariable(envFileContent, 'OPENAI_API_KEY', openaiApiKey);
        if (googleAiApiKey) envFileContent = updateEnvVariable(envFileContent, 'GOOGLE_AI_API_KEY', googleAiApiKey);
        if (huggingfaceApiKey) envFileContent = updateEnvVariable(envFileContent, 'HUGGINGFACE_API_KEY', huggingfaceApiKey);
        if (stabilityApiKey) envFileContent = updateEnvVariable(envFileContent, 'STABILITY_API_KEY', stabilityApiKey);
        if (claudeApiKey) envFileContent = updateEnvVariable(envFileContent, 'CLAUDE_API_KEY', claudeApiKey);
        if (replicateApiToken) envFileContent = updateEnvVariable(envFileContent, 'REPLICATE_API_TOKEN', replicateApiToken);
        if (pineconeApiKey) envFileContent = updateEnvVariable(envFileContent, 'PINECONE_API_KEY', pineconeApiKey);
        if (serpapiApiKey) envFileContent = updateEnvVariable(envFileContent, 'SERPAPI_API_KEY', serpapiApiKey);
        if (elevenLabsApiKey) envFileContent = updateEnvVariable(envFileContent, 'ELEVEN_LABS_API_KEY', elevenLabsApiKey);
        if (xaiApiKey) envFileContent = updateEnvVariable(envFileContent, 'XAI_API_KEY', xaiApiKey);
        if (cohereApiKey) envFileContent = updateEnvVariable(envFileContent, 'COHERE_API_KEY', cohereApiKey);

        // Write the updated content back to the .env file
        fs.writeFileSync(envFilePath, envFileContent);

        res.json({ message: 'API keys updated successfully' });
    } catch (error) {
        console.error('Error updating API keys:', error);
        res.status(500).json({ error: 'Failed to update API keys' });
    }
});

// Endpoint to retrieve current API keys
app.get('/api/get-keys', async (req, res) => {
    try {
        // Path to the .env file
        const envFilePath = path.join(__dirname, '.env');

        // Read the .env file
        const envFileContent = fs.readFileSync(envFilePath, 'utf8');

        // Parse the .env file content into key-value pairs
        const envVariables = envFileContent
            .split('\n')
            .filter(line => line.trim() !== '' && !line.startsWith('#')) // Ignore empty lines and comments
            .reduce((acc, line) => {
                const [key, value] = line.split('=').map(part => part.trim());
                acc[key] = value;
                return acc;
            }, {});

        // Extract only the API keys we care about
        const apiKeys = {
            openaiApiKey: envVariables.OPENAI_API_KEY || null,
            googleAiApiKey: envVariables.GOOGLE_AI_API_KEY || null,
            huggingfaceApiKey: envVariables.HUGGINGFACE_API_KEY || null,
            stabilityApiKey: envVariables.STABILITY_API_KEY || null,
            claudeApiKey: envVariables.CLAUDE_API_KEY || null,
            replicateApiToken: envVariables.REPLICATE_API_TOKEN || null,
            pineconeApiKey: envVariables.PINECONE_API_KEY || null,
            serpapiApiKey: envVariables.SERPAPI_API_KEY || null,
            elevenLabsApiKey: envVariables.ELEVEN_LABS_API_KEY || null,
            xaiApiKey: envVariables.XAI_API_KEY || null,
            cohereApiKey: envVariables.COHERE_API_KEY || null
        };

        // Return the API keys
        res.json({ apiKeys });
    } catch (error) {
        console.error('Error retrieving API keys:', error);
        res.status(500).json({ error: 'Failed to retrieve API keys' });
    }
});

// Helper function to update or add an environment variable in the .env file content
function updateEnvVariable(envContent, key, value) {
    const keyRegex = new RegExp(`^${key}=.*`, 'm');
    const newEnvLine = `${key}=${value}`;

    if (envContent.match(keyRegex)) {
        // If the key already exists, replace its value
        return envContent.replace(keyRegex, newEnvLine);
    } else {
        // If the key does not exist, append it to the end of the file
        return `${envContent}\n${newEnvLine}`;
    }
}

app.get('/api/addons/:packageName*/status', async (req, res) => {
    // Get the full package name from the URL, including scoped packages
    const packageName = req.params.packageName + (req.params[0] || '');
    
    console.log(`Checking status for addon: ${packageName}`); // Debug log

    try {
        // Decode the package name in case it contains URL-encoded characters
        const decodedPackageName = decodeURIComponent(packageName);
        
        // Check if addon is installed
        const isInstalled = await addonManager.isInstalled(decodedPackageName);
        
        console.log(`Addon ${decodedPackageName} installed status:`, isInstalled); // Debug log
        
        res.json({ 
            installed: isInstalled,
            packageName: decodedPackageName 
        });
    } catch (error) {
        console.error(`Error checking addon status for package: ${packageName}:`, error);
        // Send a more specific error response rather than 404
        res.status(500).json({ 
            error: `Failed to check addon status for package: ${packageName}`,
            details: error.message
        });
    }
});

// Add this to server.js
app.get('/api/addons/:packageName/schema', async (req, res) => {
    const packageName = req.params.packageName;
    
    try {
        // Get the addon's directory path
        const addonPath = path.join(__dirname, 'node_modules', packageName, 'dist');
        const schemaPath = path.join(addonPath, 'schema.sql');
        
        try {
            const schema = await fs.readFile(schemaPath, 'utf8');
            res.json({ schema });
        } catch (fileError) {
            if (fileError.code === 'ENOENT') {
                // No schema file found - this is normal for some addons
                res.json({ schema: '' });
            } else {
                throw fileError;
            }
        }
    } catch (error) {
        console.error('Error reading schema:', error);
        res.status(500).json({ 
            error: 'Failed to read addon schema',
            details: error.message 
        });
    }
});

app.post('/api/addons/install', async (req, res) => {
    const { addonId } = req.body;

    if (!addonId) {
        return res.status(400).json({ 
            error: 'Addon ID is required' 
        });
    }

    try {
        console.log(`📦 Starting installation of ${addonId}...`);

        // Step 1: Install the addon using the addon manager
        await addonManager.install(addonId);
        console.log(`✅ Successfully installed ${addonId}`);

        // Step 2: Locate the schema.sql file in the addon's directory
        const addonPath = path.join(__dirname, 'node_modules', addonId, 'dist');
        const schemaFilePath = path.join(addonPath, 'schema.sql');

        try {
            // Try to read the schema file - if it doesn't exist, this will throw
            const schemaSQL = await fs.readFile(schemaFilePath, 'utf8');
            console.log(`📄 Found and read schema.sql for addon: ${addonId}`);

            // Execute the SQL commands in the database
            await storageManager.executeSQL(schemaSQL);
            console.log(`✅ Schema for ${addonId} successfully applied to database`);
        } catch (fileError) {
            // If the error is that the file doesn't exist, that's okay
            if (fileError.code === 'ENOENT') {
                console.log(`ℹ️ No schema.sql found for addon: ${addonId} (this is normal)`);
            } else {
                // If it's any other error, we should report it
                console.error('Error processing schema file:', fileError);
                throw new Error(`Schema file processing failed: ${fileError.message}`);
            }
        }

        // Step 3: Respond with success
        res.json({ 
            success: true, 
            message: `Addon ${addonId} installed successfully` 
        });

    } catch (error) {
        console.error('❌ Addon installation error:', error);
        res.status(500).json({ 
            error: 'Failed to install addon', 
            details: error.message 
        });
    }
});

// Server-side endpoint (Express)
app.delete('/api/addons/uninstall/:packageName*', async (req, res) => {
    // Get the full package name from the URL, including scoped packages
    const packageName = req.params.packageName + (req.params[0] || '');
    
    if (!packageName) {
        return res.status(400).json({ error: 'Package name is required' });
    }

    try {
        console.log(`Uninstalling addon: ${packageName}`);
        await addonManager.uninstall(packageName);
        res.json({ success: true, message: `Addon ${packageName} uninstalled successfully` });
    } catch (error) {
        console.error('Addon uninstallation error:', error);
        res.status(500).json({ error: 'Failed to uninstall addon', details: error.message });
    }
});

// Add this endpoint to your existing server.js
app.get('/api/diagnostics', async (req, res) => {
    try {
        const cpus = os.cpus();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;

        const diagnostics = {
            system: {
                platform: process.platform,
                architecture: process.arch,
                hostname: os.hostname(),
                release: os.release(),
                uptime: os.uptime()
            },
            cpu: {
                model: cpus[0].model,
                cores: cpus.length,
                speed: cpus[0].speed,
                loadAverage: os.loadavg()
            },
            memory: {
                total: (totalMemory / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                free: (freeMemory / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                used: (usedMemory / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                usedPercentage: ((usedMemory / totalMemory) * 100).toFixed(2) + '%'
            },
            process: {
                pid: process.pid,
                uptime: process.uptime(),
                nodeVersion: process.version,
                memoryUsage: process.memoryUsage()
            }
        };

        res.json(diagnostics);
    } catch (error) {
        console.error('Error getting system diagnostics:', error);
        res.status(500).json({ 
            error: 'Failed to get system diagnostics',
            details: error.message 
        });
    }
});

// Update the restart endpoint
app.post('/api/server/restart', async (req, res) => {
    let hasResponded = false;
    
    try {
        // Send response immediately
        res.json({ 
            message: 'Server restart initiated',
            status: 'shutting_down'
        });
        hasResponded = true;

        // Wait a moment to ensure response is sent
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Clean up resources
        console.log('🔄 Cleaning up resources...');
        await Promise.all([
            storageManager.cleanup().catch(e => console.error('Storage manager close error:', e)),
            aiManager.cleanup().catch(e => console.error('AI manager close error:', e))
        ]);

        // Close server
        server.close(async () => {
            console.log('✅ Server closed successfully');
            
            try {
                // Use node's child_process to spawn a new server instance
                const { spawn } = await import('child_process');
                
                const newProcess = spawn('node', ['server.js'], {
                    detached: true,
                    stdio: 'inherit'
                });

                // Unref the child to allow the parent to exit
                newProcess.unref();

                // Exit the current process
                process.exit(0);
            } catch (error) {
                console.error('Failed to spawn new server process:', error);
                process.exit(1);
            }
        });

    } catch (error) {
        console.error('❌ Error during server restart:', error);
        if (!hasResponded) {
            res.status(500).json({ 
                error: 'Failed to restart server',
                details: error.message 
            });
        }
        process.exit(1);
    }
});
    
// Start the server
const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
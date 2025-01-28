import express from 'express';
import bodyParser from 'body-parser';
import { AIManager } from './src/core/engine.js'; // Import your AI logic
import userConfigManager from './src/core/user.js';
import { AVAILABLE_MODELS } from './src/clients/ai/ollama/ollama.js';
import { PostgresStorageManager } from './src/utils/storage/postgres.js'; // Import the storage manager
import cors from 'cors'; // Import the cors middleware
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const app = express();
const port = 3000;

// Get current file path and directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

app.get('/api/settings', async (req, res) => {
    try {
        const config = userConfigManager.getConfig();

        // Check if settings are empty or missing
        if (!config || !config.settings || Object.keys(config.settings).length === 0) {
            return res.status(404).json({ error: 'Settings not found' });
        }

        res.json({
            settings: config.settings,
            profile: config.profile,
            preferences: config.preferences
        });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

app.post('/api/settings', async (req, res) => {
    const { theme, notifications, logLevel } = req.body;

    try {
        await userConfigManager.setSetting('theme', theme);
        await userConfigManager.setSetting('notifications', notifications);
        await userConfigManager.setSetting('logLevel', logLevel);
        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
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
app.get('/api/models', async (req, res) => {
    try {
        const models = AVAILABLE_MODELS; // Use the list of available models
        res.json({ models });
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({ error: 'Failed to fetch models' });
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

// Add to your existing Express server
app.post('/api/addons/install', async (req, res) => {
    const { addonId } = req.body;
    try {
      await addonManager.install(addonId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to install add-on' });
    }
  });
  
  app.delete('/api/addons/uninstall/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await addonManager.uninstall(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to uninstall add-on' });
    }
  });
  
// Start the server
const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
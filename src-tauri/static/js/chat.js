window.addEventListener('load', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get('chatId');

    if (chatId) {
        try {
            // Fetch chat history for this specific chat ID
            const response = await fetch(`http://localhost:3000/api/chat/history/${chatId}`);
            const { messages } = await response.json();

            // Populate chat container with historical messages
            messages.forEach(message => {
                appendMessage(message.sender, message.message); // Use `message.message` instead of `message.content`
            });
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }
});

// Fetch current model
async function fetchCurrentModel() {
    try {
        const response = await fetch('http://localhost:3000/api/current-model');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const model = data.model;
        document.getElementById('current-model-name').textContent = model || 'Unknown';
    } catch (error) {
        console.error('Error fetching current model:', error);
        document.getElementById('current-model-name').textContent = 'Unknown';
    }
}
fetchCurrentModel();

// JavaScript to handle chat functionality
const chatInput = document.getElementById('chat-input-field');
const chatSendButton = document.getElementById('chat-send-button');
const chatContainer = document.getElementById('chat');
const fileUpload = document.getElementById('file-upload');

chatSendButton.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Handle file upload
fileUpload.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        uploadFile(file);
    }
});

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to upload file');
        }

        const data = await response.json();
        appendMessage('user', `Uploaded file: ${file.name}`);
        console.log('File uploaded:', data);
    } catch (error) {
        console.error('Error uploading file:', error);
        appendMessage('ai', 'Failed to upload file.');
    }
}

async function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        appendMessage('user', message);
        chatInput.value = '';

        // Show typing indicator
        const typingIndicator = createTypingIndicator();
        chatContainer.appendChild(typingIndicator);

        try {
            // Get the current chatId from the URL
            const urlParams = new URLSearchParams(window.location.search);
            const chatId = urlParams.get('chatId');

            // Send the message to the API
            const response = await fetch('http://localhost:3000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message, chatId }), // Include chatId in the request body
            });

            if (!response.ok) {
                throw new Error('Failed to fetch response from the server');
            }

            const data = await response.json();
            const aiResponse = data.response;

            // Remove typing indicator
            chatContainer.removeChild(typingIndicator);

            // Extract thought process from response (if any)
            const thoughtStart = aiResponse.indexOf('<think>');
            const thoughtEnd = aiResponse.indexOf('</think>');
            let thoughtProcess = '';
            let finalResponse = aiResponse;

            if (thoughtStart !== -1 && thoughtEnd !== -1) {
                thoughtProcess = aiResponse.slice(thoughtStart + 7, thoughtEnd).trim();
                finalResponse = aiResponse.slice(0, thoughtStart) + aiResponse.slice(thoughtEnd + 8);
            }

            // Display thought process (if any)
            if (thoughtProcess) {
                appendMessage('think', thoughtProcess);
            }

            // Display AI response with typing effect
            await appendMessageWithTypingEffect('ai', finalResponse);
        } catch (error) {
            console.error('Error:', error);
            appendMessage('ai', 'Failed to get a response from the server.');
        }
    }
}

function createTypingIndicator() {
    const typingIndicator = document.createElement('div');
    typingIndicator.classList.add('message', 'ai');
    typingIndicator.innerHTML = `
        <div class="content">
            <span class="typing"></span>
            <span class="typing"></span>
            <span class="typing"></span>
        </div>
    `;
    return typingIndicator;
}

function appendMessage(sender, message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    // Check if the message contains a thought process
    const thoughtStart = message.indexOf('<think>');
    const thoughtEnd = message.indexOf('</think>');

    if (thoughtStart !== -1 && thoughtEnd !== -1) {
        // Extract thought process
        const thoughtProcess = message.slice(thoughtStart + 7, thoughtEnd).trim();
        const finalResponse = message.slice(0, thoughtStart) + message.slice(thoughtEnd + 8);

        // Append thought process only if it's not empty
        if (thoughtProcess) {
            const thoughtElement = document.createElement('div');
            thoughtElement.classList.add('message', 'think');
            thoughtElement.textContent = thoughtProcess;
            chatContainer.appendChild(thoughtElement);
        }

        // Append the main message
        messageElement.classList.add(sender);
        messageElement.textContent = finalResponse.trim();
    } else {
        // Regular message
        messageElement.classList.add(sender);
        messageElement.textContent = message;
    }

    // Add timestamp
    const timestampElement = document.createElement('div');
    timestampElement.classList.add('timestamp');
    timestampElement.textContent = new Date().toLocaleTimeString();

    messageElement.appendChild(timestampElement);
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function appendMessageWithTypingEffect(sender, message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);

    const contentElement = document.createElement('div');
    contentElement.classList.add('content');

    const timestampElement = document.createElement('div');
    timestampElement.classList.add('timestamp');
    timestampElement.textContent = new Date().toLocaleTimeString();

    messageElement.appendChild(contentElement);
    messageElement.appendChild(timestampElement);
    chatContainer.appendChild(messageElement);

    // Simulate typing effect
    let index = 0;
    const typingSpeed = 1; // Adjust typing speed (in milliseconds)
    while (index < message.length) {
        contentElement.textContent += message[index];
        chatContainer.scrollTop = chatContainer.scrollHeight;
        index++;
        await new Promise((resolve) => setTimeout(resolve, typingSpeed));
    }
}



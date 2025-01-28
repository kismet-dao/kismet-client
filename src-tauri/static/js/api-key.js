// api-keys.js

// Event listener for form submission
document.getElementById('api-key-form').addEventListener('submit', async function (event) {
    event.preventDefault();

    // Get all API key values
    const apiKeys = {
        openaiApiKey: document.getElementById('openai-api-key').value,
        googleAiApiKey: document.getElementById('google-ai-api-key').value,
        huggingfaceApiKey: document.getElementById('huggingface-api-key').value,
        stabilityApiKey: document.getElementById('stability-api-key').value,
        claudeApiKey: document.getElementById('claude-api-key').value,
        replicateApiToken: document.getElementById('replicate-api-token').value,
        pineconeApiKey: document.getElementById('pinecone-api-key').value,
        serpapiApiKey: document.getElementById('serpapi-api-key').value,
        elevenLabsApiKey: document.getElementById('eleven-labs-api-key').value,
        xaiApiKey: document.getElementById('xai-api-key').value,
        cohereApiKey: document.getElementById('cohere-api-key').value
    };

    try {
        // Send the API keys to the server
        const response = await fetch('http://localhost:3000/api/update-keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(apiKeys)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to update API keys: ${errorText}`);
        }

        // Show success message
        alert('API keys updated successfully!');
    } catch (error) {
        console.error('Error updating API keys:', error);
        alert('Failed to update API keys. Please try again.');
    }
});

// Password Visibility Toggle
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling;
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}
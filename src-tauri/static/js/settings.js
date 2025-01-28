// settings.js

// Load settings when the page loads
document.addEventListener('DOMContentLoaded', loadSettings);

// Fetch settings from the server
async function loadSettings() {
    try {
        const response = await fetch('http://localhost:3000/api/settings');
        if (!response.ok) throw new Error('Failed to fetch settings');
        const settings = await response.json();

        // Populate form fields
        document.getElementById('theme').value = settings.settings.theme;
        document.getElementById('notifications').checked = settings.settings.notifications;
        document.getElementById('logLevel').value = settings.settings.logLevel;

        // Populate profile and preferences
        document.getElementById('profile-name').textContent = settings.profile.name || 'Not set';
        document.getElementById('profile-timezone').textContent = settings.profile.timezone || 'Not set';
        document.getElementById('profile-language').textContent = settings.profile.preferredLanguage || 'Not set';
        document.getElementById('profile-voice-output').textContent = settings.profile.useVoiceOutput ? 'Enabled' : 'Disabled';
        document.getElementById('preferences-model').textContent = settings.preferences.defaultModel || 'Not set';
    } catch (error) {
        showMessage('Error loading settings: ' + error.message, 'error');
    }
}

// Save settings
document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const settings = {
        theme: document.getElementById('theme').value,
        notifications: document.getElementById('notifications').checked,
        logLevel: document.getElementById('logLevel').value,
    };

    try {
        const response = await fetch('http://localhost:3000/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(settings),
        });

        if (!response.ok) throw new Error('Failed to save settings');
        showMessage('Settings saved successfully!', 'success');
    } catch (error) {
        showMessage('Error saving settings: ' + error.message, 'error');
    }
});

// Display messages to the user
function showMessage(text, type) {
    const messageElement = document.getElementById('message');
    messageElement.textContent = text;
    messageElement.className = `message ${type}`;
    setTimeout(() => {
        messageElement.textContent = '';
        messageElement.className = 'message';
    }, 3000);
}
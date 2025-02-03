async function loadSidebar() {
    const settingsExist = await checkSettings();
    if (!settingsExist) {
        return;
    }

    try {
        const response = await fetch('sidebar.html');
        const sidebarHTML = await response.text();
        document.getElementById('sidebar-container').innerHTML = sidebarHTML;

        // Add event listeners after sidebar is loaded
        setupPlayPauseControls();
        
        await fetchAndDisplayChatHistory();
        
        const newChatButton = document.getElementById('start-new-chat');
        if (newChatButton) {
            newChatButton.addEventListener('click', async (event) => {
            });
        }
    } catch (error) {
        console.error('Error loading sidebar:', error);
    }
}

function setupPlayPauseControls() {
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');
    const pauseBtn = document.getElementById('pause-btn');

    if (!playBtn || !stopBtn || !pauseBtn) {
        console.error('Play/Pause controls not found:', { playBtn, stopBtn, pauseBtn });
        return;
    }

    console.log('Setting up play/pause controls');

    // Play button click handler
    playBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Play clicked');
        playBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        stopBtn.classList.add('active-stop');
        pauseBtn.classList.remove('hidden');
    });

    // Stop button click handler
    stopBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Stop clicked');
        stopBtn.classList.add('hidden');
        pauseBtn.classList.add('hidden');
        playBtn.classList.remove('hidden');
        pauseBtn.classList.remove('active-pause');
    });

    // Pause button click handler
    pauseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Pause clicked');
        
        // Toggle pause state
        const isPaused = pauseBtn.classList.toggle('active-pause');
        
        if (isPaused) {
            // If we're pausing, show play button and hide stop
            stopBtn.classList.add('hidden');
            playBtn.classList.remove('hidden');
        } else {
            // If we're resuming, show stop button and hide play
            stopBtn.classList.remove('hidden');
            playBtn.classList.add('hidden');
        }
    });
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    loadSidebar();
});
// Ensure checkSettings runs when the page loads
document.addEventListener('DOMContentLoaded', () => {
    checkSettings();
});

// Fetch and display chat history
async function fetchAndDisplayChatHistory() {
    try {
        const response = await fetch('http://localhost:3000/api/chat/sessions');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const sessions = data.sessions;

        const historySection = document.getElementById('history-section');
        if (!historySection) {
            console.error('History section not found');
            return;
        }

        const historyList = historySection.querySelector('ul');
        historyList.innerHTML = '';

        if (sessions.length === 0) {
            const noSessionsMessage = document.createElement('li');
            noSessionsMessage.innerHTML = '<p>No chat history available</p>';
            historyList.appendChild(noSessionsMessage);
            return;
        }

        sessions.forEach((chatId, index) => {
            const listItem = document.createElement('li');
            const chatButton = document.createElement('a');

            chatButton.href = `./chat.html?chatId=${chatId}`;
            chatButton.classList.add('chat-history-button');

            const sessionNumber = sessions.length - index;
            chatButton.innerHTML = `
                <i class="fas fa-comment-dots"></i> 
                Session ${sessionNumber} 
                <small style="color: #8b8989; margin-left: 10px;">${chatId.slice(0, 8)}...</small>
            `;

            listItem.appendChild(chatButton);
            historyList.appendChild(listItem);
        });
    } catch (error) {
        console.error('Error fetching or displaying chat history:', error);
        const historySection = document.getElementById('history-section');
        if (historySection) {
            historySection.innerHTML = `
                <div style="color: #ff6b6b; text-align: center;">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Failed to load chat history.
                </div>
            `;
        }
    }
}

async function handleServerRestart() {
    try {
        const response = await fetch('http://localhost:3000/api/server/restart', {
            method: 'POST'
        });

        if (response.ok) {
            console.log('Server restart initiated');
            
            // Wait for server to go down and come back up
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Poll server until it's back up
            let attempts = 0;
            while (attempts < 30) { // Try for 15 seconds
                try {
                    const healthCheck = await fetch('http://localhost:3000/api/settings');
                    if (healthCheck.ok) {
                        console.log('Server is back online');
                        return;
                    }
                } catch (error) {
                    // Server still down, continue polling
                }
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            throw new Error('Server failed to restart within timeout');
        }
    } catch (error) {
        console.error('Error during server restart:', error);
        // Handle the error appropriately in your UI
    }
}

async function checkSettings() {
    try {
        const response = await fetch('http://localhost:3000/api/settings');
        
        if (response.status === 404) {
            // No settings found, redirect to wizard
            console.log('No settings found, redirecting to setup wizard...');
            
            // Don't redirect if we're already on the wizard page
            if (!window.location.pathname.endsWith('wizard.html')) {
                window.location.href = './wizard.html';
                return false;
            }
        } else if (!response.ok) {
            throw new Error(`Settings check failed with status: ${response.status}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error checking settings:', error);
        // Show an error toast if we have the toast component available
        if (typeof showToast === 'function') {
            showToast('Failed to check application settings. Please try again.', true);
        }
        return false;
    }
}






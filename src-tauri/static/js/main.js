// Load sidebar dynamically
async function loadSidebar() {
    try {
        const response = await fetch('sidebar.html');
        const sidebarHTML = await response.text();
        document.getElementById('sidebar-container').innerHTML = sidebarHTML;

        // Now that sidebar is loaded, fetch and display chat history
        await fetchAndDisplayChatHistory();

        // Add event listener for new chat button
        const newChatButton = document.getElementById('start-new-chat');
        if (newChatButton) {
            newChatButton.addEventListener('click', async (event) => {
                event.preventDefault();
                try {
                    const response = await fetch('http://localhost:3000/api/chat/session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
                    }

                    const data = await response.json();
                    window.location.href = `./chat.html?chatId=${data.chatId}`;
                } catch (error) {
                    console.error('Error creating chat session:', error);
                    alert('Failed to create a new chat session.');
                }
            });
        }
    } catch (error) {
        console.error('Error loading sidebar:', error);
    }
}

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

// Load sidebar when page loads
loadSidebar();
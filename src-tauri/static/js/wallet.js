// wallet.js

// State management
let currentNetwork = 'eth';  // Default network
let currentAddress = '';
let connectedNetworks = new Set();
let walletAddresses = {};

// Fetch balance for current network
async function fetchBalance() {
    try {
        if (!currentNetwork) return;

        const response = await fetch(`http://localhost:3000/api/wallet/balance/${currentNetwork}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data.success) {
            updateBalanceDisplay(data.balance);
        } else {
            console.error('Failed to fetch balance:', data.error);
        }
    } catch (error) {
        console.error('Error fetching balance:', error);
        updateBalanceDisplay(null);
    }
}

// Update balance display
function updateBalanceDisplay(balance) {
    const balanceElement = document.querySelector('.balance');
    if (!balanceElement) return;

    if (!balance) {
        balanceElement.textContent = '0.00';
        balanceElement.title = '';
        return;
    }

    // Display formatted balance with hover info for detailed view
    balanceElement.textContent = `${balance.formatted} ${balance.unit}`;
    
    // Add subunit information if available
    if (balance.subunit) {
        balanceElement.title = `${balance.raw} ${balance.subunit}`;
    }
}

// Update the network change handler
function initializeNetworkSelector() {
    const select = document.getElementById('network-select');
    if (select) {
        select.addEventListener('change', async (e) => {
            currentNetwork = e.target.value;
            updateDisplayedAddress();
            await fetchBalance(); // Add this line
            console.log('Selected network:', currentNetwork);
        });
    }
}


// Initialize address display with copy functionality
function initializeAddressDisplay() {
    const copyButton = document.querySelector('.copy-address');
    if (copyButton) {
        copyButton.addEventListener('click', () => {
            const address = walletAddresses[currentNetwork];
            if (address) {
                navigator.clipboard.writeText(address)
                    .then(() => {
                        copyButton.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => {
                            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 2000);
                    })
                    .catch(err => console.error('Failed to copy address:', err));
            }
        });
    }
}

// Show message when no wallet exists
function showNoWalletMessage() {
    const walletContent = document.querySelector('.wallet-content');
    const noWalletMessage = document.createElement('div');
    noWalletMessage.className = 'no-wallet-message';
    noWalletMessage.innerHTML = `
        <h3>Welcome to Your Crypto Wallet</h3>
        <p>You don't have a wallet yet. Create one to get started!</p>
        <button id="create-wallet-btn" class="primary-btn">
            <i class="fas fa-plus"></i> Create Wallet
        </button>
    `;
    walletContent.innerHTML = ''; // Clear existing content
    walletContent.appendChild(noWalletMessage);

    // Add click handler for create wallet button
    document.getElementById('create-wallet-btn').onclick = () => {
        document.getElementById('wallet-modal').style.display = 'block';
    };
}

// Fetch wallet addresses and handle no-wallet case
async function fetchWalletAddresses() {
    try {
        const response = await fetch('http://localhost:3000/api/wallet/addresses');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data.success) {
            walletAddresses = data.addresses;
            updateDisplayedAddress();
            return true;
        } else {
            console.error('Failed to fetch addresses:', data.error);
            return false;
        }
    } catch (error) {
        console.error('Error fetching addresses:', error);
        if (error.message.includes('ENOENT') && error.message.includes('.wallet.public.enc')) {
            showNoWalletMessage();
        } else {
            const addressElement = document.getElementById('wallet-address');
            if (addressElement) {
                addressElement.textContent = 'Failed to load addresses';
            }
        }
        return false;
    }
}

// Fetch networks and update dropdown
async function fetchNetworks() {
    try {
        const response = await fetch('http://localhost:3000/api/wallet/networks');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data.success) {
            updateNetworkDropdown(data.networks);
        } else {
            console.error('Failed to fetch networks:', data.error);
        }
    } catch (error) {
        console.error('Error fetching networks:', error);
        const select = document.getElementById('network-select');
        if (select) {
            select.innerHTML = '<option value="">Failed to load networks</option>';
        }
    }
}

// Update the network dropdown with fetched networks
function updateNetworkDropdown(networks) {
    const select = document.getElementById('network-select');
    if (!select) {
        console.error('Network select element not found');
        return;
    }
    
    // Map network IDs to match the backend
    select.innerHTML = networks.map(network => {
        const networkId = network.id === 'eth-holesky' ? 'eth' : network.id;
        return `
            <option value="${networkId}" ${networkId === currentNetwork ? 'selected' : ''}>
                ${network.name}
            </option>
        `;
    }).join('');
    
    // Update displayed address after network list is updated
    updateDisplayedAddress();
}

// Update the displayed address for the current network
function updateDisplayedAddress() {
    const addressElement = document.getElementById('wallet-address');
    if (!addressElement) return;

    const address = walletAddresses[currentNetwork];
    if (address) {
        addressElement.textContent = address;
        document.querySelector('.copy-address').style.display = 'block';
    } else {
        addressElement.textContent = 'No address available for this network';
        document.querySelector('.copy-address').style.display = 'none';
    }
    currentAddress = address || '';
}

// Display mnemonic phrase in the modal
function displayMnemonic(mnemonic) {
    if (!mnemonic) {
        console.error('No mnemonic provided');
        return;
    }

    const mnemonicContainer = document.getElementById('mnemonic-words');
    if (!mnemonicContainer) {
        console.error('Mnemonic container not found');
        return;
    }

    try {
        const words = mnemonic.split(' ');
        const wordsHtml = words
            .map((word, index) => `
                <div class="mnemonic-word">
                    <span class="word-number">${(index + 1).toString().padStart(2, '0')}</span>
                    <span class="word">${word}</span>
                </div>
            `)
            .join('');

        mnemonicContainer.innerHTML = wordsHtml;
    } catch (error) {
        console.error('Error displaying mnemonic:', error);
        mnemonicContainer.innerHTML = '<div class="error">Error displaying mnemonic phrase</div>';
    }
}

function initializeSendTransaction() {
    const sendBtn = document.querySelector('.send-btn');
    if (!sendBtn) return;

    const sendModal = document.getElementById('send-modal');
    const closeBtn = sendModal.querySelector('.close-btn');
    const previewBtn = document.getElementById('preview-transaction-btn');
    const sendTransactionBtn = document.getElementById('send-transaction-btn');

    // Open modal when send button is clicked
    sendBtn.addEventListener('click', () => {
        // Reset form
        document.getElementById('send-to').value = '';
        document.getElementById('send-amount').value = '';
        document.getElementById('fee-level').value = 'medium';
        document.getElementById('send-wallet-password').value = '';
        document.getElementById('send-error').textContent = '';
        document.getElementById('transaction-preview').style.display = 'none';
        sendTransactionBtn.disabled = true;
        
        // Update network currency display
        const networkCurrency = document.querySelector('.network-currency');
        networkCurrency.textContent = currentNetwork.toUpperCase();
        
        // Show modal
        sendModal.style.display = 'block';
    });

    // Close modal handlers
    closeBtn.addEventListener('click', () => sendModal.style.display = 'none');
    window.addEventListener('click', (event) => {
        if (event.target === sendModal) {
            sendModal.style.display = 'none';
        }
    });

    // Preview transaction
    previewBtn.addEventListener('click', () => {
        const to = document.getElementById('send-to').value;
        const amount = document.getElementById('send-amount').value;
        const fee = document.getElementById('fee-level').value;
        const errorElement = document.getElementById('send-error');

        if (!to || !amount) {
            errorElement.textContent = 'Please fill in all fields';
            return;
        }

        const preview = document.getElementById('transaction-preview');
        preview.style.display = 'block';
        preview.querySelector('.preview-details').innerHTML = `
            <div>
                <span class="label">From:</span>
                <span class="value">${walletAddresses[currentNetwork]}</span>
            </div>
            <div>
                <span class="label">To:</span>
                <span class="value">${to}</span>
            </div>
            <div>
                <span class="label">Amount:</span>
                <span class="value">${amount} ${currentNetwork.toUpperCase()}</span>
            </div>
            <div>
                <span class="label">Fee Level:</span>
                <span class="value">${fee.charAt(0).toUpperCase() + fee.slice(1)}</span>
            </div>
        `;

        sendTransactionBtn.disabled = false;
    });

    // Send transaction
    sendTransactionBtn.addEventListener('click', async () => {
        const to = document.getElementById('send-to').value;
        const amount = document.getElementById('send-amount').value;
        const fee = document.getElementById('fee-level').value;
        const password = document.getElementById('send-wallet-password').value;
        const errorElement = document.getElementById('send-error');

        if (!password) {
            errorElement.textContent = 'Wallet password is required';
            return;
        }

        try {
            sendTransactionBtn.disabled = true;
            sendTransactionBtn.textContent = 'Sending...';
            errorElement.textContent = '';

            const response = await fetch('http://localhost:3000/api/wallet/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    network: currentNetwork,
                    to,
                    amount: parseFloat(amount),
                    fee,
                    password
                }),
            });

            const data = await response.json();
            if (data.success) {
                const successMessage = document.createElement('div');
                successMessage.className = 'success-message';
                successMessage.innerHTML = `
                    Transaction sent successfully!<br>
                    Transaction Hash: ${data.txHash}<br>
                    ${data.explorerUrl ? `<a href="${data.explorerUrl}" target="_blank">View on Explorer</a>` : ''}
                `;
                
                document.getElementById('transaction-preview').after(successMessage);
                
                // Clear sensitive data
                document.getElementById('send-wallet-password').value = '';
                
                // Refresh balance
                await fetchBalance();
                
                // Close modal after 3 seconds
                setTimeout(() => {
                    sendModal.style.display = 'none';
                }, 3000);
            } else {
                throw new Error(data.error || 'Failed to send transaction');
            }
        } catch (error) {
            console.error('Error sending transaction:', error);
            errorElement.textContent = error.message || 'Failed to send transaction';
        } finally {
            sendTransactionBtn.disabled = false;
            sendTransactionBtn.textContent = 'Send Transaction';
        }
    });
}

// Update initWallet to include initial balance fetch
async function initWallet() {
    console.log('Initializing wallet...');
    
    try {
        const hasAddresses = await fetchWalletAddresses();
        if (hasAddresses) {
            initializeNetworkSelector();
            initializeAddressDisplay();
            initializeSendTransaction();
            await fetchNetworks();
            await fetchBalance(); // Add this line
        }
    } catch (error) {
        console.error('Error initializing wallet:', error);
    }
}


// Handle wallet generation
function initializeWalletGeneration() {
    const modal = document.getElementById('wallet-modal');
    const generateBtn = document.getElementById('generate-wallet-btn');
    const completeSetupBtn = document.getElementById('complete-setup-btn');
    const passwordSection = document.getElementById('password-section');
    const mnemonicSection = document.getElementById('mnemonic-section');
    const closeBtn = document.querySelector('.close-btn');

    if (closeBtn) {
        closeBtn.onclick = () => modal.style.display = 'none';
    }

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    if (generateBtn) {
        generateBtn.onclick = async () => {
            const password = document.getElementById('wallet-password').value;
            const confirmPassword = document.getElementById('wallet-password-confirm').value;
            const errorElement = document.getElementById('password-error');

            if (password !== confirmPassword) {
                errorElement.textContent = 'Passwords do not match';
                return;
            }
            if (password.length < 8) {
                errorElement.textContent = 'Password must be at least 8 characters';
                return;
            }

            try {
                errorElement.textContent = '';
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generating...';

                const response = await fetch('http://localhost:3000/api/wallet/generate-wallet', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ password }),
                });

                const data = await response.json();
                if (data.success) {
                    if (data.mnemonic) {
                        displayMnemonic(data.mnemonic);
                        passwordSection.style.display = 'none';
                        mnemonicSection.style.display = 'block';
                        generateBtn.style.display = 'none';
                        completeSetupBtn.style.display = 'block';
                    } else {
                        throw new Error('Mnemonic phrase not received from server');
                    }
                } else {
                    throw new Error(data.error || 'Failed to generate wallet');
                }
            } catch (error) {
                console.error('Error generating wallet:', error);
                errorElement.textContent = error.message;
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Wallet';
            }
        };
    }

    if (completeSetupBtn) {
        completeSetupBtn.onclick = async () => {
            const confirmed = document.getElementById('mnemonic-confirmation').checked;
            if (!confirmed) {
                alert('Please confirm that you have saved your mnemonic phrase');
                return;
            }

            modal.style.display = 'none';
            window.location.reload(); // Refresh the page to show the new wallet
        };
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initWallet();
    initializeWalletGeneration();
});
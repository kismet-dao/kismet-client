// src/services/wallet.service.js
import express from 'express';
import CryptoJS from 'crypto-js';
import { createNetworkInstance, utils, generateWallets } from '@kismet-dao/wallet-plugin';
import fs from 'fs/promises';

class WalletService {
    constructor() {
        this.router = express.Router();
        this.connectedNetworks = new Map();
        this.logger = utils.logger;
        this.initializeRoutes();
    }

    async getOrCreateNetworkInstance(networkType) {
        const existingNetwork = this.connectedNetworks.get(networkType);
        if (existingNetwork) {
            return existingNetwork;
        }

        try {
            const network = createNetworkInstance(networkType);
            await network.initialize();
            this.connectedNetworks.set(networkType, network);
            this.logger.info(`Network instance created and initialized for ${networkType}`);
            return network;
        } catch (error) {
            this.logger.error(`Failed to create/initialize network instance for ${networkType}`, error);
            throw error;
        }
    }

    initializeRoutes() {
// Get available networks
this.router.get('/networks', async (req, res) => {
    try {
        const networks = [
            { id: 'eth', name: 'ETH' },
            { id: 'btc', name: 'BTC' },
            { id: 'btctestnet', name: 'BTC Testnet' },
            { id: 'sol', name: 'SOL' },
            { id: 'base', name: 'BASE' },
            { id: 'dag', name: 'DAG' },
            { id: 'xrp', name: 'XRP' }
        ];
        
        res.json({
            success: true,
            networks
        });
    } catch (error) {
        this.logger.error('Error fetching available networks:', error);
        res.status(500).json({ 
            error: 'Failed to fetch available networks',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

this.router.get('/addresses', async (req, res) => {
    try {
        const walletData = await utils.getWalletData(false); // false for public data only
        const addresses = {};
        
        // Get addresses for each network
        const networks = ['eth', 'btc', 'btctestnet', 'sol', 'base', 'dag', 'xrp'];
        
        for (const network of networks) {
            try {
                const walletKeys = utils.getWalletKeysForNetwork(walletData, network);
                addresses[network] = walletKeys.address;
            } catch (error) {
                this.logger.warn(`Failed to get address for network ${network}:`, error);
                addresses[network] = null;
            }
        }
        
        res.json({
            success: true,
            addresses
        });
    } catch (error) {
        this.logger.error('Error fetching wallet addresses:', error);
        res.status(500).json({ 
            error: 'Failed to fetch wallet addresses',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

this.router.get('/balance/:network', async (req, res) => {
    try {
        const { network } = req.params;
        const walletData = await utils.getWalletData(false);
        
        let address;
        switch (network) {
            case 'eth':
            case 'base':
                address = walletData.eth.address;
                break;
            case 'btc':
                address = walletData.btc.address;
                break;
            case 'btctestnet':
                address = walletData.btctestnet.address;
                break;
            case 'sol':
                address = walletData.sol.address;
                break;
            case 'dag':
                address = walletData.dag.address;
                break;
            case 'xrp':
                address = walletData.xrp.address;
                break;
            default:
                throw new Error('Unsupported network');
        }

        const networkInstance = await this.getOrCreateNetworkInstance(network);
        let balance;

        try {
            // Only initialize XRP
            if (network === 'xrp') {
                await networkInstance.initialize();
            }

            balance = await networkInstance.fetchBalance(address);

            // Format balance based on network
            let formattedBalance;
            if (network === 'btc' || network === 'btctestnet') {
                const satoshis = BigInt(balance);
                const btc = Number(satoshis) / 100000000;
                formattedBalance = {
                    raw: satoshis.toString(),
                    formatted: btc.toFixed(8),
                    unit: 'BTC',
                    subunit: 'satoshis'
                };
            } else if (network === 'dag') {
                const dagBalance = Number(balance) / 100000000;
                formattedBalance = {
                    raw: balance.toString(),
                    formatted: dagBalance.toFixed(8),
                    unit: 'DAG',
                    subunit: 'microDAG'
                };
            } else if (network === 'xrp') {
                formattedBalance = {
                    raw: balance.toString(),
                    formatted: Number(balance).toFixed(6),
                    unit: 'XRP'
                };
            } else {
                formattedBalance = {
                    raw: balance.toString(),
                    formatted: balance.toString(),
                    unit: network.toUpperCase()
                };
            }

            res.json({
                success: true,
                address,
                balance: formattedBalance
            });
        } finally {
            // Only disconnect XRP
            if (network === 'xrp') {
                await networkInstance.disconnect();
            }
        }
    } catch (error) {
        console.error('Error fetching balance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch balance',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

this.router.post('/send', async (req, res) => {
    try {
        const { network, to, amount, fee = 'medium', password } = req.body;

        if (!network || !to || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Network, recipient address, and amount are required'
            });
        }

        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'Wallet password is required'
            });
        }

        // Get wallet data with private keys using password
        const walletData = await utils.getWalletData(true, password);
        const networkWallet = utils.getWalletKeysForNetwork(walletData, network);

        let txHash;
        switch (network) {
            case 'btc':
            case 'btctestnet':
                const transactionDetails = {
                    network,
                    address: networkWallet.address,
                    recipient: to,
                    amount: parseFloat(amount),
                    utxos: []
                };
                const btcResult = await sendBTCTransaction(
                    transactionDetails,
                    networkWallet.privateKey,
                    networkWallet.publicKey,
                    fee
                );
                txHash = btcResult.txHash;
                break;

            case 'sol':
                const cluster = 'devnet';
                const solConnection = new Connection(clusterApiUrl(cluster), 'confirmed');
                txHash = await sendSOLTransaction({
                    address: networkWallet.address,
                    recipient: to,
                    amount: parseFloat(amount)
                }, networkWallet.privateKey, solConnection);
                break;

            case 'dag':
                txHash = await sendDAGTransaction({
                    address: networkWallet.address,
                    recipient: to,
                    amount: parseFloat(amount)
                }, networkWallet.privateKey, fee);
                break;

            case 'xrp':
                txHash = await sendXRPTransaction({
                    address: networkWallet.address,
                    recipient: to,
                    amount: parseFloat(amount)
                }, networkWallet.privateKey, fee);
                break;

            case 'eth':
            case 'base':
                txHash = await sendETHTransaction({
                    address: networkWallet.address,
                    recipient: to,
                    amount: parseFloat(amount)
                }, networkWallet.privateKey, network);
                break;

            default:
                throw new Error(`Unsupported network: ${network}`);
        }

        // Get explorer URL
        const explorerUrl = getExplorerUrl(network, txHash);

        res.json({
            success: true,
            txHash,
            explorerUrl,
            message: 'Transaction sent successfully'
        });
    } catch (error) {
        this.logger.error('Error sending transaction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send transaction',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

        // Connect wallet
        this.router.post('/connect', async (req, res) => {
            try {
                const { network, address } = req.body;
                
                if (!network || !address) {
                    return res.status(400).json({ 
                        error: 'Network and address are required' 
                    });
                }

                const response = await this.connectWallet(address, network);
                res.json(response);
            } catch (error) {
                this.logger.error('Error connecting wallet:', error);
                res.status(500).json({ 
                    error: 'Failed to connect wallet',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Disconnect wallet
        this.router.post('/disconnect', async (req, res) => {
            try {
                const { network, address } = req.body;
                
                if (!network || !address) {
                    return res.status(400).json({ 
                        error: 'Network and address are required' 
                    });
                }

                const response = await this.disconnectWallet(address, network);
                res.json(response);
            } catch (error) {
                this.logger.error('Error disconnecting wallet:', error);
                res.status(500).json({ 
                    error: 'Failed to disconnect wallet',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

// Generate wallet endpoint
this.router.post('/generate-wallet', async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters'
            });
        }

        console.log("🔄 Generating wallets...");
        const walletData = await generateWallets();
        console.log("✅ Wallets generated successfully");

        // Create wallet data object
        const walletDataObj = {
            eth: {
                address: walletData.ethereum.address,
                privateKey: walletData.ethereum.privateKey,
                publicKey: walletData.ethereum.publicKey,
            },
            btc: {
                address: walletData.bitcoin.btcMainNetAddress,
                privateKey: walletData.bitcoin.btcMainNetPrivateKey,
                publicKey: walletData.bitcoin.publicKey,
            },
            btctestnet: {
                address: walletData.bitcoin.btcTestNetAddress,
                privateKey: walletData.bitcoin.btcTestNetPrivateKey,
                publicKey: walletData.bitcoin.publicKey,
            },
            base: {
                address: walletData.ethereum.address,
                privateKey: walletData.ethereum.privateKey,
                publicKey: walletData.ethereum.publicKey,
            },
            sol: {
                address: walletData.solana.solAddress,
                privateKey: walletData.solana.solPrivateKey,
                publicKey: walletData.solana.solPublicKey,
            },
            dag: {
                address: walletData.dag.address,
                privateKey: walletData.dag.privateKey,
                publicKey: walletData.dag.publicKey,
            },
            xrp: {
                mainnet: {
                    address: walletData.xrp.mainnet.address,
                    privateKey: walletData.xrp.mainnet.privateKey,
                    publicKey: walletData.xrp.mainnet.publicKey,
                },
                testnet: {
                    address: walletData.xrp.testnet.address,
                    privateKey: walletData.xrp.testnet.privateKey,
                    publicKey: walletData.xrp.testnet.publicKey,
                },
                address: walletData.xrp.mainnet.address,
                privateKey: walletData.xrp.mainnet.privateKey,
                publicKey: walletData.xrp.mainnet.publicKey
            },
            mnemonic: walletData.mnemonic,
            createdAt: new Date().toISOString(),
        };

        // Store private data
        const walletDataString = JSON.stringify(walletDataObj);
        const encryptedWalletData = CryptoJS.AES.encrypt(walletDataString, password).toString();
        await fs.writeFile('.wallet.enc', encryptedWalletData);

        // Store public data
        const publicData = {
            eth: { address: walletDataObj.eth.address, publicKey: walletDataObj.eth.publicKey },
            btc: { address: walletDataObj.btc.address, publicKey: walletDataObj.btc.publicKey },
            btctestnet: { address: walletDataObj.btctestnet.address, publicKey: walletDataObj.btctestnet.publicKey },
            base: { address: walletDataObj.base.address, publicKey: walletDataObj.base.publicKey },
            sol: { address: walletDataObj.sol.address, publicKey: walletDataObj.sol.publicKey },
            dag: { address: walletDataObj.dag.address, publicKey: walletDataObj.dag.publicKey },
            xrp: {
                address: walletDataObj.xrp.mainnet.address,
                mainnet: {
                    address: walletDataObj.xrp.mainnet.address,
                    publicKey: walletDataObj.xrp.mainnet.publicKey,
                },
                testnet: {
                    address: walletDataObj.xrp.testnet.address,
                    publicKey: walletDataObj.xrp.testnet.publicKey,
                }
            },
            createdAt: walletDataObj.createdAt
        };

        const publicDataString = JSON.stringify(publicData);
        const encryptedPublicData = CryptoJS.AES.encrypt(publicDataString, 'public-data-key').toString();
        await fs.writeFile('.wallet.public.enc', encryptedPublicData);

        res.json({
            success: true,
            message: 'Wallet generated and encrypted successfully',
            mnemonic: walletData.mnemonic, // Make sure this is included
            publicData: publicData
        });
    } catch (error) {
        console.error("❌ Error generating wallets:", error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate wallet',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

    }

    async getBalance(address, networkType) {
        try {
            const network = await this.getOrCreateNetworkInstance(networkType);
            const balance = await network.fetchBalance(address);
            
            let response = {
                address,
                network: networkType,
                balance: balance.toString(),
                timestamp: new Date().toISOString()
            };

            // If UTXO-based network, include UTXOs
            if (network.isUtxoBased && typeof network.getUtxos === 'function') {
                const utxos = network.getUtxos();
                response = { ...response, utxos };
            }

            return response;
        } catch (error) {
            this.logger.error(`Error fetching balance for ${address} on ${networkType}:`, error);
            throw error;
        }
    }

    async connectWallet(address, networkType) {
        try {
            const network = await this.getOrCreateNetworkInstance(networkType);
            await network.initialize();
            
            // Test connection by fetching balance
            await network.fetchBalance(address);
            
            return {
                status: 'connected',
                address,
                network: networkType,
                isUtxoBased: network.isUtxoBased,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error(`Error connecting wallet ${address} to ${networkType}:`, error);
            throw error;
        }
    }

    async disconnectWallet(address, networkType) {
        try {
            const network = this.connectedNetworks.get(networkType);
            if (network) {
                await network.disconnect();
                this.connectedNetworks.delete(networkType);
            }
            
            return {
                status: 'disconnected',
                address,
                network: networkType,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error(`Error disconnecting wallet ${address} from ${networkType}:`, error);
            throw error;
        }
    }

    getRouter() {
        return this.router;
    }

    async cleanup() {
        this.logger.info('Starting wallet service cleanup...');
        const disconnectPromises = Array.from(this.connectedNetworks.entries()).map(
            async ([networkType, network]) => {
                try {
                    await network.disconnect();
                    this.logger.info(`Successfully disconnected from ${networkType}`);
                } catch (error) {
                    this.logger.error(`Error disconnecting from ${networkType}:`, error);
                }
            }
        );

        await Promise.all(disconnectPromises);
        this.connectedNetworks.clear();
        this.logger.info('Wallet service cleanup completed');
    }
}

export default WalletService;
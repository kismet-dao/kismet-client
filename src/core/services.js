// services.js
import chalk from 'chalk';

export class ServiceManager {
    static instance = null;
    
    constructor() {
        if (ServiceManager.instance) return ServiceManager.instance;
        this.registry = new ServiceRegistry();
        this._initialized = false;
        ServiceManager.instance = this;
    }

    static getInstance() {
        return ServiceManager.instance || new ServiceManager();
    }

    async initialize() {
        if (this._initialized) return;
        console.log(chalk.cyan('Initializing services...'));
        this._initialized = true;
    }

    async cleanup() {
        const services = this.registry.getAll();
        for (const service of Object.values(services)) {
            if (service?.cleanup) {
                await service.cleanup();
            }
        }
        this._initialized = false;
    }

    register(name, service) {
        return this.registry.register(name, service);
    }

    getService(name) {
        return this.registry.get(name);
    }

    getServices() {
        return this.registry.getAll();
    }
}

export class ServiceRegistry {
    constructor() {
        this.services = new Map();
    }

    register(name, service) {
        if (!this.services.has(name)) this.services.set(name, service);
        return service;
    }

    get(name) {
        return this.services.get(name);
    }

    getAll() {
        return Object.fromEntries(this.services);
    }
}

export class ServiceConsumer {
    constructor() {
        this.serviceManager = ServiceManager.getInstance();
    }

    getService(name) {
        return this.serviceManager.getService(name);
    }

    getServices() {
        return this.serviceManager.getServices();
    }
}
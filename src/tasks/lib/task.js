import { EventEmitter } from 'events';

export class Task extends EventEmitter {
    constructor(config = {}) {
        super(); // Initialize EventEmitter
        
        this.id = config.id || this.generateUniqueId();
        this.name = config.name || 'Unnamed Task';
        this.type = config.type || 'generic';
        this.execute = config.execute || this.defaultExecute;
        this.retryCount = 0;
        this.createdAt = new Date();
        this.options = config.options || {};
    }

    generateUniqueId() {
        return Math.random().toString(36).substr(2, 9);
    }

    defaultExecute() {
        console.warn('Default task execute method called. Override this method in your specific task.');
        return Promise.resolve({ success: true });
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            retryCount: this.retryCount,
            createdAt: this.createdAt,
            options: this.options
        };
    }
}

export default Task;
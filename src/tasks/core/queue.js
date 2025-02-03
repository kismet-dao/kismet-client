// tasks/core/queue.js
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';

export class TaskQueue extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.priorities = {
            'critical': 0,
            'high': 1,
            'normal': 2,
            'low': 3
        };
    }

    add(task, priority = false) {
        logger.debug('Adding task to queue', {
            taskId: task.id,
            taskName: task.name,
            priority: task.options?.priority || 'normal'
        });

        const taskPriority = task.options?.priority || 'normal';
        
        // Find the correct position based on priority
        const insertIndex = this.queue.findIndex(queuedTask => 
            this.priorities[queuedTask.options?.priority || 'normal'] > 
            this.priorities[taskPriority]
        );

        if (insertIndex === -1) {
            this.queue.push(task);
            logger.debug('Task added to end of queue', {
                position: this.queue.length - 1,
                queueSize: this.queue.length
            });
        } else {
            this.queue.splice(insertIndex, 0, task);
            logger.debug('Task inserted into queue', {
                position: insertIndex,
                queueSize: this.queue.length
            });
        }

        logger.info('Task added successfully', {
            taskId: task.id,
            priority: taskPriority,
            queueSize: this.queue.length
        });

        this.emit('taskAdded', task);
    }

    addPriority(task) {
        logger.debug('Adding high-priority task', {
            taskId: task.id,
            taskName: task.name
        });

        task.options = task.options || {};
        task.options.priority = 'high';
        this.add(task);
    }

    remove(taskId) {
        logger.debug('Attempting to remove task', { taskId });

        const index = this.queue.findIndex(task => task.id === taskId);
        if (index !== -1) {
            const removedTask = this.queue.splice(index, 1)[0];
            logger.info('Task removed from queue', {
                taskId,
                position: index,
                newQueueSize: this.queue.length
            });
            return removedTask;
        }

        logger.warn('Task not found in queue', { taskId });
        return null;
    }

    peek() {
        const nextTask = this.queue[0];
        logger.debug('Peeking at next task', {
            taskId: nextTask?.id,
            taskName: nextTask?.name,
            queueSize: this.queue.length
        });
        return nextTask;
    }

    clear() {
        const previousSize = this.queue.length;
        this.queue = [];
        logger.info('Queue cleared', {
            previousSize,
            currentSize: 0
        });
    }

    isEmpty() {
        const empty = this.queue.length === 0;
        logger.debug('Checking if queue is empty', {
            empty,
            queueSize: this.queue.length
        });
        return empty;
    }

    getAll() {
        logger.debug('Getting all tasks', {
            queueSize: this.queue.length
        });
        return [...this.queue]; 
    }

    size() {
        logger.debug('Getting queue size', {
            size: this.queue.length
        });
        return this.queue.length;
    }

    
    logQueueState() {
        logger.info('Current queue state', {
            size: this.queue.length,
            tasks: this.queue.map(task => ({
                id: task.id,
                name: task.name,
                priority: task.options?.priority || 'normal',
                createdAt: task.createdAt
            })),
            priorityDistribution: this.getPriorityDistribution()
        });
    }

    getPriorityDistribution() {
        return this.queue.reduce((acc, task) => {
            const priority = task.options?.priority || 'normal';
            acc[priority] = (acc[priority] || 0) + 1;
            return acc;
        }, {});
    }
    
}
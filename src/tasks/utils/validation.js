import { logger } from '../../utils/logger.js';

// Keep existing TaskValidationError class and use it for tip validation too
export class TaskValidationError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'TaskValidationError';
        this.details = details;
        Error.captureStackTrace(this, TaskValidationError);
    }
}

// Keep existing constants
export const TaskPriorities = {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    CRITICAL: 'critical'
};

export const TaskStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRYING: 'retrying',
    CANCELLED: 'cancelled'
};

// Add new tip-related constants
export const TipStatus = {
    PENDING: 'pending',
    CLAIMED: 'claimed',
    EXPIRED: 'expired',
    CANCELLED: 'cancelled'
};

// Keep all existing validation functions unchanged
export function validateTask(task) {
    logger.debug('Validating task', task);
    const errors = [];

    if (!task.name) {
        errors.push('Task name is required');
    }

    if (typeof task.execute !== 'function') {
        errors.push('Task must have an execute function');
    }

    if (task.options) {
        if (task.options.priority && !Object.values(TaskPriorities).includes(task.options.priority)) {
            errors.push(`Invalid priority. Must be one of: ${Object.values(TaskPriorities).join(', ')}`);
        }

        if (task.options.timeout !== undefined) {
            if (typeof task.options.timeout !== 'number' || task.options.timeout < 0) {
                errors.push('Timeout must be a positive number');
            }
        }

        if (task.options.maxRetries !== undefined) {
            if (!Number.isInteger(task.options.maxRetries) || task.options.maxRetries < 0) {
                errors.push('maxRetries must be a non-negative integer');
            }
        }
    }

    if (errors.length > 0) {
        throw new TaskValidationError('Task validation failed', { errors });
    }

    logger.debug('Task validation succeeded');
    return true;
}

export function validateTaskManager(config) {
    logger.debug('Validating task manager config', config);
    const errors = [];

    if (config.concurrency !== undefined) {
        if (!Number.isInteger(config.concurrency) || config.concurrency < 1) {
            errors.push('Concurrency must be a positive integer');
        }
    }

    if (config.maxRetries !== undefined) {
        if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0) {
            errors.push('maxRetries must be a non-negative integer');
        }
    }

    if (config.retryDelay !== undefined) {
        if (typeof config.retryDelay !== 'number' || config.retryDelay < 0) {
            errors.push('retryDelay must be a positive number');
        }
    }

    if (config.timeout !== undefined) {
        if (typeof config.timeout !== 'number' || config.timeout < 0) {
            errors.push('timeout must be a positive number');
        }
    }

    if (errors.length > 0) {
        throw new TaskValidationError('Task manager configuration validation failed', { errors });
    }

    logger.debug('Task manager configuration validation succeeded');
    return true;
}

export function validateTaskState(task) {
    if (!task.status || !Object.values(TaskStatus).includes(task.status)) {
        throw new TaskValidationError('Invalid task status', {
            status: task.status,
            validStatuses: Object.values(TaskStatus)
        });
    }

    if (task.retryCount !== undefined && (!Number.isInteger(task.retryCount) || task.retryCount < 0)) {
        throw new TaskValidationError('Invalid retry count', {
            retryCount: task.retryCount
        });
    }

    return true;
}

export function isTaskExpired(task, currentTime = new Date()) {
    if (!task.createdAt) return false;
    if (!task.options?.timeout) return false;

    const expirationTime = new Date(task.createdAt.getTime() + task.options.timeout);
    return currentTime > expirationTime;
}

export function canTaskRetry(task, maxRetries) {
    const taskMaxRetries = task.options?.maxRetries ?? maxRetries;
    return task.retryCount < taskMaxRetries;
}


// Add new tip validation functions
export function validateTipClaim(claim, tipContext) {
    logger.debug('Validating tip claim', { claim, tipContext });
    const errors = [];

    // Basic claim validation
    if (!claim.username) {
        errors.push('Claimer username is required');
    }

    if (!claim.walletAddress) {
        errors.push('Wallet address is required');
    }

    if (!claim.currency) {
        errors.push('Currency is required');
    }

    if (!claim.inReplyToId) {
        errors.push('Original tip reference is required');
    }

    // Throw early if basic validation fails
    if (errors.length > 0) {
        throw new TaskValidationError('Invalid tip claim format', { errors });
    }

    // Context validation
    if (!tipContext) {
        throw new TaskValidationError('No matching tip found');
    }

    // Expiration check
    if (isTipExpired(tipContext)) {
        throw new TaskValidationError('Tip has expired', {
            expiresAt: tipContext.expiresAt
        });
    }

    // Recipient validation
    if (claim.username.toLowerCase() !== tipContext.recipient.toLowerCase()) {
        throw new TaskValidationError('Only the intended recipient can claim this tip', {
            expected: tipContext.recipient,
            received: claim.username
        });
    }

    // Currency validation
    if (claim.currency.toLowerCase() !== tipContext.currency.toLowerCase()) {
        throw new TaskValidationError('Currency mismatch with original tip', {
            expected: tipContext.currency,
            received: claim.currency
        });
    }

    // Status validation
    if (tipContext.status === TipStatus.CLAIMED) {
        throw new TaskValidationError('Tip has already been claimed', {
            claimedAt: tipContext.claimedAt
        });
    }

    logger.debug('Tip claim validation succeeded');
    return true;
}

export function validateTipRegistration(tip) {
    logger.debug('Validating tip registration', tip);
    const errors = [];

    if (!tip.amount || isNaN(parseFloat(tip.amount))) {
        errors.push('Valid tip amount is required');
    }

    if (!tip.currency) {
        errors.push('Currency is required');
    }

    if (!tip.sender) {
        errors.push('Sender username is required');
    }

    if (!tip.recipient) {
        errors.push('Recipient username is required');
    }

    if (!tip.mentionId) {
        errors.push('Original mention ID is required');
    }

    if (errors.length > 0) {
        throw new TaskValidationError('Tip registration validation failed', { errors });
    }

    logger.debug('Tip registration validation succeeded');
    return true;
}

export function isTipExpired(tipContext, currentTime = new Date()) {
    if (!tipContext.expiresAt) return false;
    return currentTime > new Date(tipContext.expiresAt);
}
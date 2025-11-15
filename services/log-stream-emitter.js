/**
 * Log Stream Emitter
 *
 * In-memory pub/sub for real-time log streaming.
 * Bypasses database polling by pushing logs directly to SSE connections.
 *
 * Architecture:
 * Agent onProgress → saveExecutionLog → emit → res.write to all connected clients
 * Database is a side effect, not the hot path for real-time updates.
 */

const EventEmitter = require('events');

class LogStreamEmitter extends EventEmitter {
    constructor() {
        super();
        // Map: executionId -> Set of response objects (execution-specific subscriptions)
        this.listeners = new Map();
        // Map: userId -> Set of response objects (company-wide subscriptions)
        this.userListeners = new Map();
    }

    /**
     * Subscribe an SSE connection to receive logs for a specific execution
     * @param {string|number} executionId - The execution ID to listen to
     * @param {object} res - Express response object for SSE
     */
    subscribe(executionId, res) {
        const key = String(executionId);

        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }

        this.listeners.get(key).add(res);
        console.log(`[LogStreamEmitter] Client subscribed to execution ${key} (${this.listeners.get(key).size} total)`);
    }

    /**
     * Unsubscribe an SSE connection from an execution
     * @param {string|number} executionId - The execution ID
     * @param {object} res - Express response object to remove
     */
    unsubscribe(executionId, res) {
        const key = String(executionId);

        if (this.listeners.has(key)) {
            this.listeners.get(key).delete(res);
            console.log(`[LogStreamEmitter] Client unsubscribed from execution ${key} (${this.listeners.get(key).size} remaining)`);

            // Clean up empty sets
            if (this.listeners.get(key).size === 0) {
                this.listeners.delete(key);
                console.log(`[LogStreamEmitter] No more listeners for execution ${key}, cleaned up`);
            }
        }
    }

    /**
     * Emit a log entry to all subscribers of an execution
     * @param {string|number} executionId - The execution ID
     * @param {object} log - Log data to send
     */
    emit(executionId, log) {
        const key = String(executionId);

        if (!this.listeners.has(key)) {
            // No active listeners, skip
            return;
        }

        const listeners = this.listeners.get(key);
        const deadConnections = [];

        // Push to all connected SSE clients
        for (const res of listeners) {
            try {
                // SSE format: data: {json}\n\n
                res.write(`data: ${JSON.stringify(log)}\n\n`);
            } catch (error) {
                console.error(`[LogStreamEmitter] Failed to write to SSE connection:`, error.message);
                // Mark for cleanup
                deadConnections.push(res);
            }
        }

        // Clean up dead connections
        deadConnections.forEach(res => this.unsubscribe(executionId, res));
    }

    /**
     * Emit a completion event to all subscribers
     * @param {string|number} executionId - The execution ID
     * @param {string} status - Final status ('completed' or 'failed')
     */
    emitCompletion(executionId, status) {
        const key = String(executionId);

        this.emit(executionId, {
            type: 'completion',
            status: status
        });

        console.log(`[LogStreamEmitter] Emitted completion event for execution ${key} with status: ${status}`);
    }

    /**
     * Get current subscriber count for an execution (for debugging)
     * @param {string|number} executionId - The execution ID
     * @returns {number} Number of active subscribers
     */
    getSubscriberCount(executionId) {
        const key = String(executionId);
        return this.listeners.has(key) ? this.listeners.get(key).size : 0;
    }

    /**
     * Subscribe an SSE connection to receive ALL logs for a user (company-wide stream)
     * @param {string|number} userId - The user ID to listen to
     * @param {object} res - Express response object for SSE
     */
    subscribeToUser(userId, res) {
        const key = String(userId);

        if (!this.userListeners.has(key)) {
            this.userListeners.set(key, new Set());
        }

        this.userListeners.get(key).add(res);
        console.log(`[LogStreamEmitter] Client subscribed to user ${key} (${this.userListeners.get(key).size} total)`);
    }

    /**
     * Unsubscribe an SSE connection from a user's company-wide stream
     * @param {string|number} userId - The user ID
     * @param {object} res - Express response object to remove
     */
    unsubscribeFromUser(userId, res) {
        const key = String(userId);

        if (this.userListeners.has(key)) {
            this.userListeners.get(key).delete(res);
            console.log(`[LogStreamEmitter] Client unsubscribed from user ${key} (${this.userListeners.get(key).size} remaining)`);

            // Clean up empty sets
            if (this.userListeners.get(key).size === 0) {
                this.userListeners.delete(key);
                console.log(`[LogStreamEmitter] No more listeners for user ${key}, cleaned up`);
            }
        }
    }

    /**
     * Emit a log entry to all company-wide subscribers for a user
     * @param {string|number} userId - The user ID
     * @param {string|number} executionId - The execution ID (included in log data)
     * @param {object} log - Log data to send
     */
    emitToUser(userId, executionId, log) {
        const key = String(userId);

        if (!this.userListeners.has(key)) {
            // No active user-level listeners, skip
            return;
        }

        const listeners = this.userListeners.get(key);
        const deadConnections = [];

        // Add execution context to the log for company-wide viewers
        const logWithContext = {
            ...log,
            execution_id: executionId
        };

        // Push to all connected SSE clients for this user
        for (const res of listeners) {
            try {
                // SSE format: data: {json}\n\n
                res.write(`data: ${JSON.stringify(logWithContext)}\n\n`);
            } catch (error) {
                console.error(`[LogStreamEmitter] Failed to write to user SSE connection:`, error.message);
                // Mark for cleanup
                deadConnections.push(res);
            }
        }

        // Clean up dead connections
        deadConnections.forEach(res => this.unsubscribeFromUser(userId, res));
    }

    /**
     * Emit a completion event to all company-wide subscribers
     * @param {string|number} userId - The user ID
     * @param {string|number} executionId - The execution ID
     * @param {string} status - Final status ('completed' or 'failed')
     */
    emitCompletionToUser(userId, executionId, status) {
        this.emitToUser(userId, executionId, {
            type: 'completion',
            status: status,
            execution_id: executionId
        });

        console.log(`[LogStreamEmitter] Emitted completion to user ${userId} for execution ${executionId} with status: ${status}`);
    }

    /**
     * Get current subscriber count for a user (for debugging)
     * @param {string|number} userId - The user ID
     * @returns {number} Number of active company-wide subscribers
     */
    getUserSubscriberCount(userId) {
        const key = String(userId);
        return this.userListeners.has(key) ? this.userListeners.get(key).size : 0;
    }
}

// Singleton instance
const logStreamEmitter = new LogStreamEmitter();

module.exports = logStreamEmitter;

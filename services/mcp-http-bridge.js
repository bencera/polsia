/**
 * MCP HTTP-to-Stdio Bridge
 *
 * Wraps stdio-based MCP servers and exposes them via HTTP
 * so that Claude Agent SDK can connect to them.
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');

class MCPHttpBridge extends EventEmitter {
    constructor(command, args, env = {}) {
        super();
        this.command = command;
        this.args = args;
        this.env = { ...process.env, ...env };
        this.process = null;
        this.messageId = 0;
        this.pendingRequests = new Map();
        this.buffer = '';
    }

    /**
     * Start the stdio MCP server process
     */
    async start() {
        return new Promise((resolve, reject) => {
            console.log(`[MCP Bridge] Starting: ${this.command} ${this.args.join(' ')}`);

            this.process = spawn(this.command, this.args, {
                env: this.env,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.process.on('error', (error) => {
                console.error('[MCP Bridge] Process error:', error);
                reject(error);
            });

            this.process.on('exit', (code) => {
                console.log(`[MCP Bridge] Process exited with code ${code}`);
                this.process = null;
            });

            // Handle stdout (responses from MCP server)
            this.process.stdout.on('data', (data) => {
                this.buffer += data.toString();
                this.processBuffer();
            });

            // Handle stderr (logs from MCP server)
            this.process.stderr.on('data', (data) => {
                console.log('[MCP Bridge] Server log:', data.toString());
            });

            // Send initialize request
            setTimeout(() => {
                this.sendJsonRpc('initialize', {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: {
                        name: 'polsia-mcp-bridge',
                        version: '1.0.0'
                    }
                }).then(result => {
                    console.log('[MCP Bridge] Initialized:', result);
                    resolve();
                }).catch(reject);
            }, 1000);
        });
    }

    /**
     * Process buffered JSON-RPC messages
     */
    processBuffer() {
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const message = JSON.parse(line);
                this.handleMessage(message);
            } catch (error) {
                console.error('[MCP Bridge] Failed to parse message:', line, error);
            }
        }
    }

    /**
     * Handle incoming JSON-RPC message from MCP server
     */
    handleMessage(message) {
        if (message.id && this.pendingRequests.has(message.id)) {
            const { resolve, reject } = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);

            if (message.error) {
                reject(new Error(message.error.message || 'MCP Error'));
            } else {
                resolve(message.result);
            }
        } else {
            // Notification or unsolicited message
            this.emit('notification', message);
        }
    }

    /**
     * Send JSON-RPC request to MCP server
     */
    async sendJsonRpc(method, params) {
        if (!this.process) {
            throw new Error('MCP server not started');
        }

        const id = ++this.messageId;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });

            const message = JSON.stringify(request) + '\n';
            this.process.stdin.write(message);

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }

    /**
     * List available tools from MCP server
     */
    async listTools() {
        return await this.sendJsonRpc('tools/list', {});
    }

    /**
     * Call a tool on the MCP server
     */
    async callTool(name, args) {
        return await this.sendJsonRpc('tools/call', {
            name,
            arguments: args
        });
    }

    /**
     * Stop the MCP server
     */
    stop() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}

module.exports = { MCPHttpBridge };

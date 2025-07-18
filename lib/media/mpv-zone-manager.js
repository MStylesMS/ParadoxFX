/**
 * MPV Zone Manager
 * 
 * Manages a single MPV instance per zone with IPC control for seamless media transitions.
 * Handles images, videos, and audio through one persistent MPV process.
 */

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const Logger = require('../utils/logger');

class MpvZoneManager {
    constructor(config) {
        this.config = config;
        this.logger = new Logger(`MpvZoneManager:${config.name}`);

        // MPV process and IPC
        this.mpvProcess = null;
        this.ipcSocket = null;
        this.ipcSocketPath = path.join(os.tmpdir(), `mpv-${config.name}-${Date.now()}.sock`);

        // State tracking
        this.isInitialized = false;
        this.isPlaying = false;
        this.currentMedia = null;
        this.mediaQueue = [];
        this.commandId = 1;

        // IPC response tracking
        this.pendingCommands = new Map();

        // Configuration
        this.maxQueueSize = config.videoQueueMax || 5;
        this.audioDevice = config.audioDevice;
        this.display = config.display || ':0';
        this.xineramaScreen = config.xineramaScreen || 0;
    }

    /**
     * Initialize the MPV instance with IPC control
     */
    async initialize() {
        if (this.isInitialized) {
            this.logger.warn('MPV Zone Manager already initialized');
            return;
        }

        this.logger.info('Initializing MPV Zone Manager...');

        try {
            // Start MPV with IPC socket
            await this._startMpvProcess();

            // Wait for IPC socket to be ready
            await this._waitForIpcSocket();

            // Connect to IPC socket
            await this._connectIpcSocket();

            this.isInitialized = true;
            this.logger.info('MPV Zone Manager initialized successfully');

        } catch (error) {
            this.logger.error('Failed to initialize MPV Zone Manager:', error);
            await this.shutdown();
            throw error;
        }
    }

    /**
     * Start the MPV process with optimal settings
     */
    async _startMpvProcess() {
        const mpvArgs = [
            // IPC settings
            `--input-ipc-server=${this.ipcSocketPath}`,
            '--idle=yes',                    // Keep running when no media
            '--keep-open=yes',              // Pause on last frame instead of quitting

            // Display settings
            '--fullscreen',
            '--no-border',
            '--ontop',
            '--no-terminal',
            '--really-quiet',

            // Video settings
            '--hwdec=auto',                 // Hardware acceleration
            '--vo=gpu',                     // GPU video output
            '--profile=gpu-hq',             // High quality GPU profile

            // Audio settings
            `--audio-device=${this.audioDevice}`,
            '--volume=70',                  // Default volume

            // Performance settings
            '--cache=yes',
            '--cache-secs=5',

            // Display targeting
            `--screen=${this.xineramaScreen}`,
        ];

        // Add platform-specific optimizations
        if (this.config.mpvVideoOptions) {
            mpvArgs.push(...this.config.mpvVideoOptions.split(' '));
        }

        this.logger.debug('Starting MPV with args:', mpvArgs);

        this.mpvProcess = spawn('mpv', mpvArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                DISPLAY: this.display
            }
        });

        // Handle process events
        this.mpvProcess.on('error', (error) => {
            this.logger.error('MPV process error:', error);
        });

        this.mpvProcess.on('exit', (code, signal) => {
            this.logger.warn(`MPV process exited with code ${code}, signal ${signal}`);
            this.isInitialized = false;
            this.mpvProcess = null;
        });

        // Log MPV output for debugging
        this.mpvProcess.stdout.on('data', (data) => {
            this.logger.debug('MPV stdout:', data.toString().trim());
        });

        this.mpvProcess.stderr.on('data', (data) => {
            this.logger.debug('MPV stderr:', data.toString().trim());
        });
    }

    /**
     * Wait for the IPC socket to be created by MPV
     */
    async _waitForIpcSocket(maxRetries = 50, retryDelay = 100) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                await fs.access(this.ipcSocketPath);
                this.logger.debug('IPC socket is ready');
                return;
            } catch (error) {
                // Socket not ready yet, wait and retry
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
        throw new Error('MPV IPC socket creation timeout');
    }

    /**
     * Connect to the MPV IPC socket
     */
    async _connectIpcSocket() {
        return new Promise((resolve, reject) => {
            this.ipcSocket = net.createConnection(this.ipcSocketPath);

            this.ipcSocket.on('connect', () => {
                this.logger.debug('Connected to MPV IPC socket');
                resolve();
            });

            this.ipcSocket.on('error', (error) => {
                this.logger.error('IPC socket error:', error);
                reject(error);
            });

            this.ipcSocket.on('data', (data) => {
                this._handleIpcResponse(data);
            });

            this.ipcSocket.on('close', () => {
                this.logger.warn('IPC socket closed');
                this.ipcSocket = null;
            });
        });
    }

    /**
     * Handle responses from MPV IPC
     */
    _handleIpcResponse(data) {
        const lines = data.toString().split('\n').filter(line => line.trim());

        for (const line of lines) {
            try {
                const response = JSON.parse(line);
                this.logger.debug('MPV IPC response:', response);

                // Handle command responses
                if (response.request_id && this.pendingCommands.has(response.request_id)) {
                    const { resolve, reject } = this.pendingCommands.get(response.request_id);
                    this.pendingCommands.delete(response.request_id);

                    if (response.error !== 'success') {
                        reject(new Error(`MPV command failed: ${response.error}`));
                    } else {
                        resolve(response.data);
                    }
                }

                // Handle events
                if (response.event) {
                    this._handleMpvEvent(response);
                }

            } catch (error) {
                this.logger.debug('Failed to parse IPC response:', line);
            }
        }
    }

    /**
     * Handle MPV events
     */
    _handleMpvEvent(event) {
        switch (event.event) {
            case 'playback-restart':
                this.isPlaying = true;
                this.logger.debug('Playback started');
                break;

            case 'end-file':
                this._handleEndFile(event);
                break;

            case 'file-loaded':
                this.logger.debug('Media file loaded:', event);
                break;
        }
    }

    /**
     * Handle end of file events
     */
    async _handleEndFile(event) {
        this.logger.debug('End of file event:', event);

        // If there's media in the queue, play the next item
        if (this.mediaQueue.length > 0) {
            const nextMedia = this.mediaQueue.shift();
            await this.loadMedia(nextMedia.path, nextMedia.options);
        } else {
            this.isPlaying = false;
        }
    }

    /**
     * Send command to MPV via IPC
     */
    async _sendIpcCommand(command, args = []) {
        if (!this.ipcSocket) {
            throw new Error('MPV IPC socket not connected');
        }

        const requestId = this.commandId++;
        const commandObj = {
            command: [command, ...args],
            request_id: requestId
        };

        return new Promise((resolve, reject) => {
            // Store the promise resolvers
            this.pendingCommands.set(requestId, { resolve, reject });

            // Send the command
            const commandStr = JSON.stringify(commandObj) + '\n';
            this.ipcSocket.write(commandStr);

            // Set timeout for command response
            setTimeout(() => {
                if (this.pendingCommands.has(requestId)) {
                    this.pendingCommands.delete(requestId);
                    reject(new Error('MPV command timeout'));
                }
            }, 5000);
        });
    }

    /**
     * Load media (image, video, or audio) into MPV
     */
    async loadMedia(mediaPath, options = {}) {
        if (!this.isInitialized) {
            throw new Error('MPV Zone Manager not initialized');
        }

        const fullPath = this._getMediaPath(mediaPath);

        // Check if file exists
        try {
            await fs.access(fullPath);
        } catch (error) {
            throw new Error(`Media file not found: ${fullPath}`);
        }

        this.logger.info(`Loading media: ${fullPath}`);
        this.currentMedia = mediaPath;

        try {
            // Load the file
            await this._sendIpcCommand('loadfile', [fullPath, 'replace']);

            // Apply any options
            if (options.volume !== undefined) {
                await this.setVolume(options.volume);
            }

            if (options.pause) {
                await this.pause();
            }

            return true;

        } catch (error) {
            this.logger.error('Failed to load media:', error);
            throw error;
        }
    }

    /**
     * Queue media for playback after current media ends
     */
    async queueMedia(mediaPath, options = {}) {
        if (this.mediaQueue.length >= this.maxQueueSize) {
            // Remove oldest item
            this.mediaQueue.shift();
            this.logger.debug('Queue full, removed oldest item');
        }

        this.mediaQueue.push({ path: mediaPath, options });
        this.logger.debug(`Media queued: ${mediaPath} (queue length: ${this.mediaQueue.length})`);
    }

    /**
     * Play/resume current media
     */
    async play() {
        return await this._sendIpcCommand('set_property', ['pause', false]);
    }

    /**
     * Pause current media
     */
    async pause() {
        return await this._sendIpcCommand('set_property', ['pause', true]);
    }

    /**
     * Stop playback and clear queue
     */
    async stop() {
        this.mediaQueue = [];
        this.isPlaying = false;
        this.currentMedia = null;
        return await this._sendIpcCommand('stop');
    }

    /**
     * Set volume (0-150)
     */
    async setVolume(volume) {
        const clampedVolume = Math.max(0, Math.min(150, volume));
        return await this._sendIpcCommand('set_property', ['volume', clampedVolume]);
    }

    /**
     * Get current playback position
     */
    async getPosition() {
        return await this._sendIpcCommand('get_property', ['time-pos']);
    }

    /**
     * Get current media duration
     */
    async getDuration() {
        return await this._sendIpcCommand('get_property', ['duration']);
    }

    /**
     * Get queue status
     */
    getQueueStatus() {
        return {
            current: this.currentMedia,
            queue: this.mediaQueue.map(item => item.path),
            queueLength: this.mediaQueue.length,
            isPlaying: this.isPlaying
        };
    }

    /**
     * Resolve media path (absolute or relative to media directory)
     */
    _getMediaPath(mediaPath) {
        if (path.isAbsolute(mediaPath)) {
            return mediaPath;
        }
        return path.join(this.config.mediaDir || '/opt/paradox/media', mediaPath);
    }

    /**
     * Shutdown the MPV instance and cleanup
     */
    async shutdown() {
        this.logger.info('Shutting down MPV Zone Manager...');

        // Clear pending commands
        for (const [id, { reject }] of this.pendingCommands) {
            reject(new Error('MPV shutdown'));
        }
        this.pendingCommands.clear();

        // Close IPC socket
        if (this.ipcSocket) {
            this.ipcSocket.destroy();
            this.ipcSocket = null;
        }

        // Terminate MPV process
        if (this.mpvProcess) {
            this.mpvProcess.kill('SIGTERM');

            // Wait for graceful exit, then force kill if needed
            setTimeout(() => {
                if (this.mpvProcess && !this.mpvProcess.killed) {
                    this.mpvProcess.kill('SIGKILL');
                }
            }, 5000);
        }

        // Cleanup socket file
        try {
            await fs.unlink(this.ipcSocketPath);
        } catch (error) {
            // Socket file might not exist, ignore error
        }

        this.isInitialized = false;
        this.logger.info('MPV Zone Manager shutdown complete');
    }
}

module.exports = MpvZoneManager;

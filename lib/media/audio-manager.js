/**
 * @fileoverview Audio Manager for ParadoxFX System
 * @description Comprehensive audio management system implementing the validated MPV-based architecture
 * 
 * This module provides centralized audio management for the ParadoxFX system, supporting:
 * - Background music with seamless looping and ducking
 * - Low-latency sound effects with overlapping capability
 * - Speech/narration with automatic background music ducking
 * - Multi-device audio routing for multiple outputs
 * 
 * ARCHITECTURE:
 * =============
 * Three distinct audio subsystems with different management strategies:
 * 1. Background Music: Persistent IPC instance with volume control
 * 2. Sound Effects: Fire-and-forget spawn for low latency and parallelism
 * 3. Speech: Queue-based system with background music coordination
 * 
 * Based on validation testing from test/manual/test-audio.js
 * 
 * @author ParadoxFX Team
 * @version 1.0.0
 * @since 2025-01-16
 */

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const Logger = require('../utils/logger');

class AudioManager {
    constructor(config) {
        this.config = config || {};
        this.logger = new Logger('AudioManager');

        // Audio subsystem instances
        this.backgroundMusic = null;
        this.speechQueue = [];
        this.isProcessingSpeech = false;

        // Socket paths for IPC communication
        this.backgroundMusicSocket = '/tmp/pfx-background-music.sock';
        this.speechSocket = '/tmp/pfx-speech.sock';

        // Audio device configuration
        this.audioDevice = this.config.audioDevice || 'auto';
        this.dualOutputMode = this.config.dualOutputMode || false;
        this.primaryDevice = this.config.primaryDevice || null;
        this.secondaryDevice = this.config.secondaryDevice || null;

        this.logger.info(`AudioManager initialized with device: ${this.audioDevice}`);
        if (this.dualOutputMode) {
            this.logger.info(`Dual output mode enabled: ${this.primaryDevice} + ${this.secondaryDevice}`);
        }

        // Volume settings
        this.backgroundMusicVolume = this.config.backgroundMusicVolume || 70;
        this.effectsVolume = this.config.effectsVolume || 100;
        this.speechVolume = this.config.speechVolume || 90;
        this.duckingVolume = this.config.duckingVolume || 40;

        // State tracking
        this.isInitialized = false;
        this.isShuttingDown = false;

        this.logger.info('AudioManager initialized with device:', this.audioDevice);
        if (this.dualOutputMode) {
            this.logger.info('Dual output mode enabled - devices:', this.primaryDevice, 'and', this.secondaryDevice);
        }
    }

    /**
     * Initialize the audio system
     */
    async initialize() {
        if (this.isInitialized) {
            this.logger.warn('AudioManager already initialized');
            return;
        }

        this.logger.info('Initializing audio system...');

        try {
            // Clean up any existing socket files
            this._cleanupSockets();

            // Initialize background music system
            await this._initializeBackgroundMusic();

            // Initialize speech system
            await this._initializeSpeech();

            this.isInitialized = true;
            this.logger.info('Audio system initialized successfully');

        } catch (error) {
            this.logger.error('Failed to initialize audio system:', error);
            throw error;
        }
    }

    /**
     * Play background music with looping
     * @param {string} filePath - Path to music file
     * @param {number} volume - Volume level (0-100), optional
     */
    async playBackgroundMusic(filePath, volume = null) {
        if (!this.isInitialized) {
            throw new Error('AudioManager not initialized');
        }

        if (!fs.existsSync(filePath)) {
            throw new Error(`Background music file not found: ${filePath}`);
        }

        const targetVolume = volume || this.backgroundMusicVolume;

        this.logger.info(`Playing background music: ${filePath} at volume ${targetVolume}`);

        try {
            // Load and play the music file
            await this._sendMpvCommand(this.backgroundMusicSocket, {
                command: ['loadfile', filePath, 'replace']
            });

            // Set volume
            await this._sendMpvCommand(this.backgroundMusicSocket, {
                command: ['set_property', 'volume', targetVolume]
            });

            this.logger.info('Background music started successfully');

        } catch (error) {
            this.logger.error('Failed to play background music:', error);
            throw error;
        }
    }

    /**
     * Stop background music
     */
    async stopBackgroundMusic() {
        if (!this.isInitialized) {
            return;
        }

        this.logger.info('Stopping background music');

        try {
            await this._sendMpvCommand(this.backgroundMusicSocket, {
                command: ['stop']
            });
        } catch (error) {
            this.logger.error('Failed to stop background music:', error);
        }
    }

    /**
     * Set background music volume
     * @param {number} volume - Volume level (0-100)
     */
    async setBackgroundMusicVolume(volume) {
        if (!this.isInitialized) {
            return;
        }

        try {
            const response = await this._sendMpvCommand(this.backgroundMusicSocket, {
                command: ['set_property', 'volume', volume]
            });

            if (response.error && response.error !== 'success') {
                throw new Error(`MPV error: ${response.error}`);
            }

            this.logger.debug(`Background music volume set to ${volume}`);
        } catch (error) {
            this.logger.error('Failed to set background music volume:', error.message || error);
            throw error;
        }
    }

    /**
     * Play sound effect with low latency
     * @param {string} filePath - Path to sound effect file
     * @param {number} volume - Volume level (0-100), optional
     */
    async playSoundEffect(filePath, volume = null) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Sound effect file not found: ${filePath}`);
        }

        const targetVolume = volume || this.effectsVolume;

        this.logger.debug(`Playing sound effect: ${filePath} at volume ${targetVolume}`);

        try {
            // Use fire-and-forget spawn method for low latency and parallelism
            const args = [
                '--no-terminal',
                '--no-video',
                `--volume=${targetVolume}`,
                '--audio-buffer=0.02',  // Minimize buffer for low latency
                '--cache=no',           // Disable cache for immediate playback
                filePath
            ];

            // Add audio device if specified
            if (this.audioDevice !== 'auto') {
                args.splice(-1, 0, `--audio-device=${this.audioDevice}`);
            }

            const effectProcess = spawn('mpv', args, { detached: false });

            // Log any errors but don't wait for completion
            effectProcess.on('error', (error) => {
                this.logger.error('Sound effect playback error:', error);
            });

            // Optional: Log completion for debugging
            effectProcess.on('exit', (code) => {
                if (code !== 0) {
                    this.logger.warn(`Sound effect process exited with code ${code}`);
                }
            });

            return true;

        } catch (error) {
            this.logger.error('Failed to play sound effect:', error);
            return false;
        }
    }

    /**
     * Play speech with automatic background music ducking
     * @param {string} filePath - Path to speech file
     * @param {number} volume - Volume level (0-100), optional
     */
    async playSpeech(filePath, volume = null) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Speech file not found: ${filePath}`);
        }

        const targetVolume = volume || this.speechVolume;

        // Add to speech queue
        this.speechQueue.push({
            filePath,
            volume: targetVolume
        });

        // Process queue if not already processing
        if (!this.isProcessingSpeech) {
            this._processSpeechQueue();
        }
    }

    /**
     * Clear speech queue and stop current speech
     */
    async clearSpeechQueue() {
        this.logger.info('Clearing speech queue');
        this.speechQueue = [];

        if (this.isProcessingSpeech) {
            try {
                const response = await this._sendMpvCommand(this.speechSocket, {
                    command: ['stop']
                });

                if (response.error && response.error !== 'success') {
                    this.logger.warn(`MPV stop warning: ${response.error}`);
                }

                this.isProcessingSpeech = false;
            } catch (error) {
                this.logger.error('Failed to stop current speech:', error.message || error);
                // Don't throw here, just log and continue
                this.isProcessingSpeech = false;
            }
        }
    }    /**
     * Shutdown the audio system
     */
    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        this.logger.info('Shutting down audio system...');

        try {
            // Clear speech queue
            await this.clearSpeechQueue();

            // Stop background music
            await this.stopBackgroundMusic();

            // Quit MPV instances
            await Promise.all([
                this._sendMpvCommand(this.backgroundMusicSocket, { command: ['quit'] }).catch(() => { }),
                this._sendMpvCommand(this.speechSocket, { command: ['quit'] }).catch(() => { })
            ]);

            // Kill processes if they exist
            if (this.backgroundMusic) {
                this.backgroundMusic.kill('SIGTERM');
            }

            // Clean up socket files
            this._cleanupSockets();

            this.logger.info('Audio system shutdown complete');

        } catch (error) {
            this.logger.error('Error during audio system shutdown:', error);
        }
    }

    // ========================================================================
    // PRIVATE METHODS
    // ========================================================================

    /**
     * Initialize background music system
     * @private
     */
    async _initializeBackgroundMusic() {
        this.logger.info('Initializing background music system...');

        // For dual output mode, create a combined sink first
        if (this.dualOutputMode) {
            await this._createCombinedSink();
        }

        await this._initializeSingleBackgroundMusic();
        this.logger.info('Background music system ready');
    }

    async _createCombinedSink() {
        const { spawn } = require('child_process');
        
        this.logger.info('Setting up PulseAudio combined sink for dual output...');
        
        // Create a combined sink that outputs to both HDMI devices
        const combinedSinkName = 'paradox_dual_output';
        
        // First check if the sink already exists
        try {
            const checkSinkExists = await new Promise((resolve, reject) => {
                const process = spawn('pactl', ['list', 'short', 'sinks'], { stdio: 'pipe' });
                let output = '';
                
                process.stdout.on('data', (data) => {
                    output += data.toString();
                });
                
                process.on('exit', (code) => {
                    if (code === 0) {
                        const sinkExists = output.includes(combinedSinkName);
                        resolve(sinkExists);
                    } else {
                        reject(new Error(`Failed to check existing sinks, exit code: ${code}`));
                    }
                });
                
                process.on('error', reject);
            });
            
            if (checkSinkExists) {
                this.logger.info('Combined sink already exists, using it');
                this.audioDevice = `pulse/${combinedSinkName}`;
                return;
            }
        } catch (error) {
            this.logger.warn('Failed to check existing sinks:', error.message);
        }
        
        // Create the combined sink if it doesn't exist
        const sinkCmd = `pactl load-module module-combine-sink sink_name=${combinedSinkName} slaves="${this.primaryDevice},${this.secondaryDevice}"`;
        
        try {
            await new Promise((resolve, reject) => {
                const process = spawn('sh', ['-c', sinkCmd], { stdio: 'pipe' });
                
                process.on('exit', (code) => {
                    if (code === 0) {
                        this.logger.info('Combined sink created successfully');
                        // Update audio device to use the combined sink
                        this.audioDevice = `pulse/${combinedSinkName}`;
                        resolve();
                    } else {
                        reject(new Error(`Failed to create combined sink, exit code: ${code}`));
                    }
                });
                
                process.on('error', reject);
            });
        } catch (error) {
            this.logger.warn('Failed to create combined sink, falling back to primary device:', error.message);
            this.audioDevice = this.primaryDevice;
        }
    }

    async _initializeSingleBackgroundMusic() {
        const args = [
            '--idle=yes',
            `--input-ipc-server=${this.backgroundMusicSocket}`,
            '--no-terminal',
            '--no-video',
            `--volume=${this.backgroundMusicVolume}`,
            '--loop-file=inf',  // Loop background music
            '--cache=yes',
            '--msg-level=all=info'
        ];

        // Add audio device if specified
        if (this.audioDevice !== 'auto') {
            args.push(`--audio-device=${this.audioDevice}`);
        }

        this.backgroundMusic = spawn('mpv', args, { detached: false });

        this.backgroundMusic.on('error', (error) => {
            this.logger.error('Background music process error:', error);
        });

        this.backgroundMusic.on('exit', (code, signal) => {
            this.logger.warn(`Background music process exited with code ${code}, signal ${signal}`);
            this.backgroundMusic = null;
        });

        // Wait for socket to be ready
        await this._waitForSocket(this.backgroundMusicSocket);
    }

    /**
     * Initialize speech system
     * @private
     */
    async _initializeSpeech() {
        this.logger.info('Initializing speech system...');

        const args = [
            '--idle=yes',
            `--input-ipc-server=${this.speechSocket}`,
            '--no-terminal',
            '--no-video',
            `--volume=${this.speechVolume}`,
            '--keep-open=yes',
            '--cache=yes',
            '--msg-level=all=info'
        ];

        // Add audio device if specified
        if (this.audioDevice !== 'auto') {
            args.push(`--audio-device=${this.audioDevice}`);
        }

        const speechProcess = spawn('mpv', args, { detached: false });

        speechProcess.on('error', (error) => {
            this.logger.error('Speech process error:', error);
        });

        speechProcess.on('exit', (code, signal) => {
            this.logger.warn(`Speech process exited with code ${code}, signal ${signal}`);
        });

        // Wait for socket to be ready
        await this._waitForSocket(this.speechSocket);
        this.logger.info('Speech system ready');
    }

    /**
     * Process speech queue with background music ducking
     * @private
     */
    async _processSpeechQueue() {
        if (this.isProcessingSpeech || this.speechQueue.length === 0) {
            return;
        }

        this.isProcessingSpeech = true;

        while (this.speechQueue.length > 0) {
            const speechItem = this.speechQueue.shift();

            try {
                this.logger.info(`Playing speech: ${speechItem.filePath}`);

                // Duck background music
                await this.setBackgroundMusicVolume(this.duckingVolume);

                // Load and play speech
                await this._sendMpvCommand(this.speechSocket, {
                    command: ['loadfile', speechItem.filePath, 'replace']
                });

                // Set volume
                await this._sendMpvCommand(this.speechSocket, {
                    command: ['set_property', 'volume', speechItem.volume]
                });

                // Wait for speech to complete
                await this._monitorProperty(this.speechSocket, 'eof-reached', true);

                // Restore background music volume
                await this.setBackgroundMusicVolume(this.backgroundMusicVolume);

                this.logger.info('Speech playback completed');

            } catch (error) {
                this.logger.error('Error playing speech:', error.message || error);

                // Restore background music volume on error
                try {
                    await this.setBackgroundMusicVolume(this.backgroundMusicVolume);
                } catch (restoreError) {
                    this.logger.error('Failed to restore background music volume:', restoreError.message || restoreError);
                }
            }            // Small delay between speech items
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        this.isProcessingSpeech = false;
    }

    /**
     * Send IPC command to MPV instance
     * @private
     */
    _sendMpvCommand(socketPath, cmdObj) {
        return new Promise((resolve, reject) => {
            const client = net.createConnection(socketPath, () => {
                const cmdString = JSON.stringify(cmdObj) + '\n';
                client.write(cmdString);
            });

            let buffer = '';
            const timeout = setTimeout(() => {
                client.destroy();
                reject(new Error(`Command timed out: ${JSON.stringify(cmdObj)}`));
            }, 5000);

            client.on('data', (chunk) => {
                buffer += chunk.toString();

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex);
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.trim() === '') continue;

                    try {
                        const responseJson = JSON.parse(line);
                        if (responseJson.error !== undefined) {
                            clearTimeout(timeout);
                            client.end();
                            resolve(responseJson);
                            return;
                        }
                    } catch (parseError) {
                        // Ignore parsing errors for events, but log them for debugging
                        this.logger.debug('IPC parse error:', parseError.message, 'Line:', line);
                    }
                }
            });

            client.on('end', () => clearTimeout(timeout));
            client.on('close', () => clearTimeout(timeout));
            client.on('error', (err) => {
                clearTimeout(timeout);
                reject(new Error(`IPC connection error: ${err.message}`));
            });
        });
    }

    /**
     * Monitor MPV property for changes
     * @private
     */
    _monitorProperty(socketPath, property, targetValue) {
        return new Promise((resolve, reject) => {
            const client = net.createConnection(socketPath, () => {
                const observeCmd = JSON.stringify({ command: ['observe_property', 1, property] }) + '\n';
                client.write(observeCmd);
            });

            let buffer = '';
            const timeout = setTimeout(() => {
                client.destroy();
                reject(new Error(`Property monitoring timed out for ${property}`));
            }, 30000);

            client.on('data', (chunk) => {
                buffer += chunk.toString();

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex);
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.trim() === '') continue;

                    try {
                        const responseJson = JSON.parse(line);

                        if (responseJson.event === 'property-change' &&
                            responseJson.name === property &&
                            responseJson.data === targetValue) {

                            clearTimeout(timeout);
                            client.end();
                            resolve();
                            return;
                        }
                    } catch (parseError) {
                        // Ignore parsing errors for events
                        this.logger.debug('Property monitor parse error:', parseError.message);
                    }
                }
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                reject(new Error(`Property monitoring error: ${err.message}`));
            });

            client.on('close', () => {
                clearTimeout(timeout);
            });
        });
    }

    /**
     * Wait for MPV socket to be ready
     * @private
     */
    async _waitForSocket(socketPath, maxRetries = 20) {
        for (let i = 0; i < maxRetries; i++) {
            if (fs.existsSync(socketPath)) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        throw new Error(`Socket not ready after ${maxRetries} attempts: ${socketPath}`);
    }

    /**
     * Clean up socket files
     * @private
     */
    _cleanupSockets() {
        const sockets = [this.backgroundMusicSocket, this.speechSocket];
        sockets.forEach(socket => {
            try {
                if (fs.existsSync(socket)) {
                    fs.unlinkSync(socket);
                }
            } catch (error) {
                // Ignore errors during cleanup
            }
        });
    }
}

module.exports = AudioManager;

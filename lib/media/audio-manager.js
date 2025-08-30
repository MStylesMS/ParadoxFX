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
const Utils = require('../utils/utils');

class AudioManager {
    constructor(config) {
        this.config = config || {};
        
        // Socket paths for IPC communication - Zone-specific to prevent conflicts
        const zoneId = this.config.zoneId || 'default';
        const safeZoneId = Utils.sanitizeFilename(zoneId);
        this.zoneId = zoneId;
        this.logger = new Logger(`AudioManager:${zoneId}`);

        // Audio subsystem instances
        this.backgroundMusic = null;
        this.speechProcess = null;
        this.currentSpeechFile = null; // Track currently playing speech file
        this.speechQueue = [];
        this.isProcessingSpeech = false;

        this.backgroundMusicSocket = `/tmp/pfx-background-music-${safeZoneId}.sock`;
        this.speechSocket = `/tmp/pfx-speech-${safeZoneId}.sock`;

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
        this.duckingVolume = this.config.duckingVolume || 30;

        // State tracking
        this.isInitialized = false;
        this.isShuttingDown = false;
    // Track active IPC clients and timeouts so we can force-close them on shutdown
    this._activeMpvClients = new Set();
    this._activeMpvTimeouts = new Set();

        // Fade tracking
        this._activeBackgroundFade = null;
        this._activeSpeechFade = null;

        this.logger.info('AudioManager initialized with device:', this.audioDevice);
        if (this.dualOutputMode) {
            this.logger.info('Dual output mode enabled - devices:', this.primaryDevice, 'and', this.secondaryDevice);
        }
    }

    /**
     * Resolve media path
     * @param {string} mediaPath - Relative or absolute media path
     * @returns {string} Fully resolved media path
     */
    resolveMediaPath(mediaPath) {
        if (path.isAbsolute(mediaPath)) {
            return mediaPath;
        }
        return path.join(this.config.baseMediaPath, mediaPath);
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
            this.isInitialized = false;
            throw error;
        }
    }

    /**
     * Check if audio systems are healthy and restart if needed
     * @returns {boolean} True if systems are healthy or successfully restarted
     */
    async checkAndRestartProcesses() {
        if (!this.isInitialized) {
            this.logger.debug('AudioManager not initialized, skipping health check');
            return false;
        }

        let systemsHealthy = true;

        // Check background music system
        if (this.backgroundMusic && this.backgroundMusic.killed) {
            this.logger.warn('Background music process crashed, attempting restart...');
            try {
                await this._initializeBackgroundMusic();
                this.logger.info('Background music system restarted successfully');
            } catch (error) {
                this.logger.error('Failed to restart background music system:', error);
                systemsHealthy = false;
            }
        }

        // but we can ensure the socket is available when needed
        if (this.speechProcess && this.speechProcess.killed) {
            this.logger.warn('Speech process crashed, attempting restart...');
            try {
                await this._initializeSpeech();
                this.logger.info('Speech system restarted successfully');
            } catch (error) {
                this.logger.error('Failed to restart speech system:', error);
                systemsHealthy = false;
            }
        }

        return systemsHealthy;
    }

    /**
     * Play background music with optional looping
     * @param {string} filePath - Path to music file
     * @param {number} volume - Volume level (0-150), optional
     * @param {boolean} loop - Whether to loop the file (default: false for single play)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async playBackgroundMusic(filePath, volume = null, loop = false) {
        if (!this.isInitialized) {
            return { success: false, error: 'AudioManager not initialized' };
        }

        if (!fs.existsSync(filePath)) {
            this.logger.warn(`Background music file not found: ${filePath}`);
            return { success: false, error: `Background music file not found: ${filePath}` };
        }

        const targetVolume = volume || this.backgroundMusicVolume;

        this.logger.info(`Playing background music: ${filePath} at volume ${targetVolume} (loop: ${loop})`);

        try {
            // Load the music file
            await this._sendMpvCommand(this.backgroundMusicSocket, {
                command: ['loadfile', filePath, 'replace']
            });

            // Set loop mode based on parameter
            const loopValue = loop ? 'inf' : 'no';
            await this._sendMpvCommand(this.backgroundMusicSocket, {
                command: ['set_property', 'loop-file', loopValue]
            });

            // Set volume
            await this._sendMpvCommand(this.backgroundMusicSocket, {
                command: ['set_property', 'volume', targetVolume]
            });

            this.logger.info(`Background music started successfully (loop: ${loop})`);
            return { success: true };

        } catch (error) {
            this.logger.error('Failed to play background music:', error);
            return { success: false, error: error.message };
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
     * @param {number} volume - Volume level (0-150)
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
     * Fade background music volume over time
     * @param {number} targetVolume - Target volume level (0-150)
     * @param {number} durationMs - Fade duration in milliseconds
     * @param {function} callback - Optional callback when fade completes
     * @returns {Promise<{success: boolean, fadeId?: string, error?: string}>}
     */
    async fadeBackgroundMusic(targetVolume, durationMs, callback = null) {
        if (!this.isInitialized) {
            return { success: false, error: 'AudioManager not initialized' };
        }

        // Cancel any existing background music fade
        if (this._activeBackgroundFade) {
            clearInterval(this._activeBackgroundFade.interval);
            this._activeBackgroundFade = null;
        }

        try {
            // Get current volume
            const currentResponse = await this._sendMpvCommand(this.backgroundMusicSocket, {
                command: ['get_property', 'volume']
            });
            const startVolume = currentResponse.data || this.backgroundMusicVolume;

            // Calculate fade parameters
            const steps = Math.max(10, Math.floor(durationMs / 100)); // Min 10 steps, 100ms intervals
            const volumeStep = (targetVolume - startVolume) / steps;
            const intervalMs = durationMs / steps;

            const fadeId = `bgm-fade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            this.logger.info(`Starting background music fade: ${startVolume} -> ${targetVolume} over ${durationMs}ms (${steps} steps)`);

            let currentStep = 0;
            const fadeInterval = setInterval(async () => {
                try {
                    currentStep++;
                    const newVolume = Math.max(0, Math.min(150,
                        startVolume + (volumeStep * currentStep)));

                    await this.setBackgroundMusicVolume(newVolume);

                    if (currentStep >= steps) {
                        clearInterval(fadeInterval);
                        this._activeBackgroundFade = null;

                        // Ensure final volume is exact
                        await this.setBackgroundMusicVolume(targetVolume);

                        this.logger.info(`Background music fade completed: ${fadeId}`);
                        if (callback) {
                            try {
                                await callback();
                            } catch (callbackError) {
                                this.logger.error('Background music fade callback error:', callbackError);
                            }
                        }
                    }
                } catch (error) {
                    this.logger.error('Error during background music fade step:', error);
                    clearInterval(fadeInterval);
                    this._activeBackgroundFade = null;
                }
            }, intervalMs);

            // Track active fade
            this._activeBackgroundFade = {
                id: fadeId,
                interval: fadeInterval,
                startTime: Date.now(),
                duration: durationMs,
                targetVolume: targetVolume
            };

            return { success: true, fadeId };

        } catch (error) {
            this.logger.error('Failed to start background music fade:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fade speech volume over time
     * @param {number} targetVolume - Target volume level (0-150)
     * @param {number} durationMs - Fade duration in milliseconds
     * @param {function} callback - Optional callback when fade completes
     * @returns {Promise<{success: boolean, fadeId?: string, error?: string}>}
     */
    async fadeSpeech(targetVolume, durationMs, callback = null) {
        if (!this.isInitialized) {
            return { success: false, error: 'AudioManager not initialized' };
        }

        // Cancel any existing speech fade
        if (this._activeSpeechFade) {
            clearInterval(this._activeSpeechFade.interval);
            this._activeSpeechFade = null;
        }

        try {
            // Get current volume
            const currentResponse = await this._sendMpvCommand(this.speechSocket, {
                command: ['get_property', 'volume']
            });
            const startVolume = currentResponse.data || this.speechVolume;

            // Calculate fade parameters
            const steps = Math.max(10, Math.floor(durationMs / 100)); // Min 10 steps, 100ms intervals
            const volumeStep = (targetVolume - startVolume) / steps;
            const intervalMs = durationMs / steps;

            const fadeId = `speech-fade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            this.logger.info(`Starting speech fade: ${startVolume} -> ${targetVolume} over ${durationMs}ms (${steps} steps)`);

            let currentStep = 0;
            const fadeInterval = setInterval(async () => {
                try {
                    currentStep++;
                    const newVolume = Math.max(0, Math.min(150,
                        startVolume + (volumeStep * currentStep)));

                    await this._sendMpvCommand(this.speechSocket, {
                        command: ['set_property', 'volume', newVolume]
                    });

                    if (currentStep >= steps) {
                        clearInterval(fadeInterval);
                        this._activeSpeechFade = null;

                        // Ensure final volume is exact
                        await this._sendMpvCommand(this.speechSocket, {
                            command: ['set_property', 'volume', targetVolume]
                        });

                        this.logger.info(`Speech fade completed: ${fadeId}`);
                        if (callback) {
                            try {
                                await callback();
                            } catch (callbackError) {
                                this.logger.error('Speech fade callback error:', callbackError);
                            }
                        }
                    }
                } catch (error) {
                    this.logger.error('Error during speech fade step:', error);
                    clearInterval(fadeInterval);
                    this._activeSpeechFade = null;
                }
            }, intervalMs);

            // Track active fade
            this._activeSpeechFade = {
                id: fadeId,
                interval: fadeInterval,
                startTime: Date.now(),
                duration: durationMs,
                targetVolume: targetVolume
            };

            return { success: true, fadeId };

        } catch (error) {
            this.logger.error('Failed to start speech fade:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cancel active background music fade
     */
    cancelBackgroundMusicFade() {
        if (this._activeBackgroundFade) {
            clearInterval(this._activeBackgroundFade.interval);
            this.logger.info(`Cancelled background music fade: ${this._activeBackgroundFade.id}`);
            this._activeBackgroundFade = null;
        }
    }

    /**
     * Cancel active speech fade
     */
    cancelSpeechFade() {
        if (this._activeSpeechFade) {
            clearInterval(this._activeSpeechFade.interval);
            this.logger.info(`Cancelled speech fade: ${this._activeSpeechFade.id}`);
            this._activeSpeechFade = null;
        }
    }

    /**
     * Pause background music
     */
    async pauseBackgroundMusic() {
        if (!this.isInitialized) {
            return;
        }

        this.logger.info('Pausing background music');

        try {
            await this._sendMpvCommand(this.backgroundMusicSocket, {
                command: ['set_property', 'pause', true]
            });
        } catch (error) {
            this.logger.error('Failed to pause background music:', error);
        }
    }

    /**
     * Resume background music
     */
    async resumeBackgroundMusic() {
        if (!this.isInitialized) {
            return;
        }

        this.logger.info('Resuming background music');

        try {
            await this._sendMpvCommand(this.backgroundMusicSocket, {
                command: ['set_property', 'pause', false]
            });
        } catch (error) {
            this.logger.error('Failed to resume background music:', error);
        }
    }

    /**
     * Play sound effect with low latency
     * @param {string} filePath - Path to sound effect file
     * @param {number} volume - Volume level (0-150), optional
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async playSoundEffect(filePath, volume = null) {
        if (!fs.existsSync(filePath)) {
            this.logger.warn(`Sound effect file not found: ${filePath}`);
            return { success: false, error: `Sound effect file not found: ${filePath}` };
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

            return { success: true };

        } catch (error) {
            this.logger.error('Failed to play sound effect:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Play speech with background music ducking
     * @param {string} filePath - Path to speech file
     * @param {number} volume - Volume level (0-150), optional
     * @param {number} duckVolume - Ducking volume (0-150), optional
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async playSpeech(filePath, { volume = null, duckVolume = 30 } = {}) {
        if (!this.isInitialized) {
            this.logger.error('AudioManager not initialized, cannot play speech.');
            return { success: false, error: 'AudioManager not initialized' };
        }

        const resolvedPath = this.resolveMediaPath(filePath);
        if (!fs.existsSync(resolvedPath)) {
            this.logger.error(`Speech file not found: ${resolvedPath}`);
            return { success: false, error: `Speech file not found: ${resolvedPath}` };
        }

        // De-duplication: Prevent adding the same speech file if it's currently playing or is the last in queue.
        const lastInQueue = this.speechQueue.length > 0 ? this.speechQueue[this.speechQueue.length - 1].filePath : null;
        if (this.currentSpeechFile === resolvedPath || lastInQueue === resolvedPath) {
            this.logger.debug(`Ignoring duplicate speech request for: ${resolvedPath}`);
            return { success: true, info: 'Duplicate ignored' };
        }

        const targetVolume = volume || this.speechVolume;
        this.logger.info(`Queueing speech: ${resolvedPath}`);
        // Create a deferred promise so the caller can await completion of this specific speech item
        let resolveFn, rejectFn;
        const completionPromise = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });

        // Add to speech queue with completion resolver
        this.speechQueue.push({
            filePath: resolvedPath,
            volume: targetVolume,
            duckVolume,
            _resolve: resolveFn,
            _reject: rejectFn
        });
        // Process queue if not already processing
        if (!this.isProcessingSpeech) {
            this._processSpeechQueue();
        }
        // Return a promise that resolves when playback completes
        return completionPromise;
    }

    /**
     * Clear speech queue and stop current speech
     */
    async clearSpeechQueue() {
        this.logger.info('Clearing speech queue');
        this.speechQueue = [];
        this.currentSpeechFile = null; // Reset current speech file

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
    }

    /**
     * Pause current speech
     */
    async pauseSpeech() {
        if (!this.isInitialized || !this.isProcessingSpeech) {
            return;
        }

        this.logger.info('Pausing speech');

        try {
            await this._sendMpvCommand(this.speechSocket, {
                command: ['set_property', 'pause', true]
            });
        } catch (error) {
            this.logger.error('Failed to pause speech:', error);
        }
    }

    /**
     * Resume current speech
     */
    async resumeSpeech() {
        if (!this.isInitialized) {
            return;
        }

        this.logger.info('Resuming speech');

        try {
            await this._sendMpvCommand(this.speechSocket, {
                command: ['set_property', 'pause', false]
            });
        } catch (error) {
            this.logger.error('Failed to resume speech:', error);
        }
    }

    /**
     * Stop current speech (but continue processing queue)
     */
    async stopSpeech() {
        if (!this.isInitialized || !this.isProcessingSpeech) {
            return;
        }

        this.logger.info('Stopping current speech');

        try {
            await this._sendMpvCommand(this.speechSocket, {
                command: ['stop']
            });
            // Processing will continue with next item in queue automatically
        } catch (error) {
            this.logger.error('Failed to stop current speech:', error);
        }
    }

    /**
     * Skip current speech and move to next in queue
     */
    async skipSpeech() {
        if (!this.isInitialized || !this.isProcessingSpeech) {
            return;
        }

        this.logger.info('Skipping current speech');

        try {
            await this._sendMpvCommand(this.speechSocket, {
                command: ['playlist-next']
            });
        } catch (error) {
            this.logger.error('Failed to skip speech:', error);
            // Fallback to stop if playlist-next fails
            await this.stopSpeech();
        }
    }

    /**
     * Pause all audio (background music and speech)
     */
    async pauseAll() {
        await Promise.all([
            this.pauseBackgroundMusic(),
            this.pauseSpeech()
        ]);
    }

    /**
     * Resume all audio (background music and speech)
     */
    async resumeAll() {
        await Promise.all([
            this.resumeBackgroundMusic(),
            this.resumeSpeech()
        ]);
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
            // Cancel any active fades
            this.cancelBackgroundMusicFade();
            this.cancelSpeechFade();

            // Clear speech queue
            await this.clearSpeechQueue();

            // Stop background music
            await this.stopBackgroundMusic();

            // Quit MPV instances
            // Try to ask MPV to quit, but don't rely on this completing if processes are stuck
            await Promise.all([
                this._sendMpvCommand(this.backgroundMusicSocket, { command: ['quit'] }).catch(() => { }),
                this._sendMpvCommand(this.speechSocket, { command: ['quit'] }).catch(() => { })
            ]).catch(() => { /* ignore */ });

            // Kill processes if they exist
            if (this.backgroundMusic) {
                this.backgroundMusic.kill('SIGTERM');
            }
            if (this.speechProcess) {
                this.speechProcess.kill('SIGTERM');
            }

            // Clean up socket files
            this._cleanupSockets();

            // Force-close any lingering MPV IPC clients/timeouts to avoid open handles in tests
            try {
                for (const client of Array.from(this._activeMpvClients)) {
                    try { client.destroy(); } catch (e) { /* ignore */ }
                }
                this._activeMpvClients.clear();
                for (const t of Array.from(this._activeMpvTimeouts)) {
                    try { clearTimeout(t); } catch (e) { /* ignore */ }
                }
                this._activeMpvTimeouts.clear();
            } catch (e) {
                this.logger.debug('Error while force-closing MPV clients:', e.message || e);
            }

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
        // Remove 'pulse/' prefix from device names for the pactl command
        const primaryDeviceClean = this.primaryDevice.replace('pulse/', '');
        const secondaryDeviceClean = this.secondaryDevice.replace('pulse/', '');
        const sinkCmd = `pactl load-module module-combine-sink sink_name=${combinedSinkName} slaves="${primaryDeviceClean},${secondaryDeviceClean}"`;
        
        this.logger.info(`Creating combined sink with command: ${sinkCmd}`);
        
        try {
            await new Promise((resolve, reject) => {
                const process = spawn('sh', ['-c', sinkCmd], { stdio: 'pipe' });
                
                let stderr = '';
                process.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
                
                process.on('exit', (code) => {
                    if (code === 0) {
                        this.logger.info('Combined sink created successfully');
                        // Update audio device to use the combined sink
                        this.audioDevice = `pulse/${combinedSinkName}`;
                        resolve();
                    } else {
                        this.logger.error(`Failed to create combined sink, exit code: ${code}, stderr: ${stderr}`);
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

        this.speechProcess = spawn('mpv', args, { detached: false });

        this.speechProcess.on('error', (error) => {
            this.logger.error('Speech process error:', error);
        });

        this.speechProcess.on('exit', (code, signal) => {
            this.logger.warn(`Speech process exited with code ${code}, signal ${signal}`);
            this.speechProcess = null;
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
            if (this.isProcessingSpeech) this.logger.debug('Speech queue processor busy.');
            return;
        }

        this.isProcessingSpeech = true;
        this.logger.debug('Speech queue processor started.');

        while (this.speechQueue.length > 0) {
            const speechItem = this.speechQueue.shift();
            this.currentSpeechFile = speechItem.filePath;

            try {
                this.logger.info(`Processing speech: ${speechItem.filePath}`);

                // Background ducking is managed by the Zone layer; AudioManager only plays speech.

                this.logger.debug('Sending loadfile command to speech player.');
                await this._sendMpvCommand(this.speechSocket, {
                    command: ['loadfile', speechItem.filePath, 'replace']
                });

                this.logger.debug(`Setting speech volume to ${speechItem.volume}.`);
                await this._sendMpvCommand(this.speechSocket, {
                    command: ['set_property', 'volume', speechItem.volume]
                });

                // Un-pause the player to ensure it starts playing
                this.logger.debug('Ensuring speech player is not paused.');
                await this._sendMpvCommand(this.speechSocket, {
                    command: ['set_property', 'pause', false]
                });

                this.logger.debug('Waiting for speech to complete...');
                // Wait for speech to complete by monitoring for the end-of-file event
                await this._monitorProperty(this.speechSocket, 'eof-reached', true);
                this.logger.info(`Finished speech: ${speechItem.filePath}`);
                // Resolve per-item completion promise if present
                if (typeof speechItem._resolve === 'function') {
                    try { speechItem._resolve({ success: true }); } catch (e) { this.logger.debug('Speech resolve error', e); }
                }

            } catch (error) {
                this.logger.error(`Error playing speech file ${speechItem.filePath}:`, error.message || error);
                // Reject per-item completion promise if present
                if (typeof speechItem._reject === 'function') {
                    try { speechItem._reject({ success: false, error: error.message || error }); } catch (e) { this.logger.debug('Speech reject error', e); }
                }
                // We still want to continue to the finally block to restore volume and continue the queue
            } finally {
                this.currentSpeechFile = null; // Clear current file
                this.logger.debug('Speech item processing finished.');
            }
            // Small delay between speech items
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        this.isProcessingSpeech = false;
        this.logger.debug('Speech queue is empty. Processor is stopping.');
    }

    /**
     * Send IPC command to MPV instance
     * @private
     */
    _sendMpvCommand(socketPath, cmdObj) {
        return new Promise((resolve, reject) => {
            if (this.isShuttingDown) return reject(new Error('Shutting down'));

            const client = net.createConnection(socketPath, () => {
                const cmdString = JSON.stringify(cmdObj) + '\n';
                this.logger.debug(`Sending MPV command to ${socketPath}: ${cmdString.trim()}`);
                client.write(cmdString);
            });

            let buffer = '';
            const timeout = setTimeout(() => {
                try { client.destroy(); } catch (e) { /* ignore */ }
                this._activeMpvTimeouts.delete(timeout);
                reject(new Error(`Command timed out: ${JSON.stringify(cmdObj)}`));
            }, 5000);
            // track active client/timeout so shutdown can force-close them
            this._activeMpvClients.add(client);
            this._activeMpvTimeouts.add(timeout);

            client.on('data', (chunk) => {
                buffer += chunk.toString();

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex);
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.trim() === '') continue;

                    try {
                        const responseJson = JSON.parse(line);
                        this.logger.debug('MPV response JSON:', responseJson);
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

            client.on('end', () => {
                this.logger.debug(`MPV client socket ${socketPath} ended.`);
                try { clearTimeout(timeout); } catch (e) { /* ignore */ }
                this._activeMpvClients.delete(client);
                this._activeMpvTimeouts.delete(timeout);
            });
            client.on('close', () => {
                this.logger.debug(`MPV client socket ${socketPath} closed.`);
                try { clearTimeout(timeout); } catch (e) { /* ignore */ }
                this._activeMpvClients.delete(client);
                this._activeMpvTimeouts.delete(timeout);
            });
            client.on('error', (err) => {
                try { clearTimeout(timeout); } catch (e) { /* ignore */ }
                this._activeMpvClients.delete(client);
                this._activeMpvTimeouts.delete(timeout);
                reject(new Error(`IPC connection error: ${err.message}`));
            });
        });
    }

    /**
     * Monitor MPV property for changes
     * @private
     */
    async _monitorProperty(socketPath, property, targetValue) {
        this.logger.debug(`Monitoring property '${property}' for target value '${targetValue}' on socket ${socketPath}`);
        // First, try to get the current value. If it already matches, we're done.
        try {
            const response = await this._sendMpvCommand(socketPath, {
                command: ['get_property', property]
            });
            this.logger.debug(`Initial value of property '${property}' is '${response.data}'`);
            if (response.data === targetValue) {
                this.logger.debug(`Property '${property}' already has target value '${targetValue}'.`);
                return;
            }
        } catch (e) {
            this.logger.warn(`Could not get initial value for property '${property}', proceeding to observe. Error: ${e.message}`);
        }
    
        // If the value doesn't match, we start observing for the change.
        return new Promise((resolve, reject) => {
            if (this.isShuttingDown) return reject(new Error('Shutting down'));

            const client = net.createConnection(socketPath, () => {
                const observeCmd = JSON.stringify({ command: ['observe_property', 1, property] }) + '\n';
                this.logger.debug(`Observing property '${property}'...`);
                client.write(observeCmd);
            });

            let buffer = '';
            const timeout = setTimeout(() => {
                try { client.destroy(); } catch (e) { /* ignore */ }
                this._activeMpvTimeouts.delete(timeout);
                this.logger.error(`Property monitoring timed out for ${property}`);
                reject(new Error(`Property monitoring timed out for ${property}`));
            }, 30000); // 30 second timeout

            // track active client/timeout so shutdown can force-close them
            this._activeMpvClients.add(client);
            this._activeMpvTimeouts.add(timeout);

            client.on('data', (chunk) => {
                buffer += chunk.toString();
                this.logger.debug(`Property monitor received data: ${buffer}`);

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex);
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.trim() === '') continue;

                    try {
                        const responseJson = JSON.parse(line);
                        this.logger.debug(`Parsed property data:`, responseJson);

                        if (responseJson.event === 'property-change' &&
                            responseJson.name === property &&
                            responseJson.data === targetValue) {

                            this.logger.debug(`Property '${property}' changed to target value '${targetValue}'.`);
                            // Unobserve the property before closing
                            const unobserveCmd = JSON.stringify({ command: ['unobserve_property', 1] }) + '\n';
                            client.write(unobserveCmd);

                            try { clearTimeout(timeout); } catch (e) { /* ignore */ }
                            client.end();
                            this._activeMpvClients.delete(client);
                            this._activeMpvTimeouts.delete(timeout);
                            resolve();
                            return;
                        }
                    } catch (parseError) {
                        this.logger.debug(`Property monitor parse error: ${parseError.message}`);
                    }
                }
            });

            client.on('error', (err) => {
                try { clearTimeout(timeout); } catch (e) { /* ignore */ }
                this._activeMpvClients.delete(client);
                this._activeMpvTimeouts.delete(timeout);
                this.logger.error(`Property monitoring socket error: ${err.message}`);
                reject(new Error(`Property monitoring error: ${err.message}`));
            });

            client.on('close', () => {
                this.logger.debug(`Property monitor socket closed.`);
                try { clearTimeout(timeout); } catch (e) { /* ignore */ }
                this._activeMpvClients.delete(client);
                this._activeMpvTimeouts.delete(timeout);
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
                this.logger.debug(`Socket ready at ${socketPath}`);
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

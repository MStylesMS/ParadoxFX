/**
 * @fileoverview Multi-Zone Audio Manager - Orchestrates audio playback across multiple zones
 * @description Manages background music, speech, and sound effects across multiple audio zones
 * with proper device targeting and no auto-fallback behavior.
 * 
 * Key Features:
 * - Multi-zone audio playback with strict device targeting
 * - Background music management with volume ducking
 * - Speech queue management per zone
 * - Fire-and-forget sound effects with low latency
 * - Resource management and concurrent effect limiting
 * 
 * @author Paradox FX Team
 * @version 1.0.0
 * @since 2025-07-23
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const AudioDeviceManager = require('./audio-device-manager');
const { logger } = require('../utils/logger');
const { sendMpvCommand, waitForSocket, monitorProperty } = require('../utils/mpv-utils');

class MultiZoneAudioManager {
    constructor(config) {
        this.config = config;
        this.deviceManager = new AudioDeviceManager();
        this.initialized = false;

        // Audio instance management
        this.backgroundMusicInstances = new Map(); // zone -> MPV instance
        this.speechInstances = new Map();          // zone -> MPV instance
        this.soundEffectProcesses = new Set();     // Active sound effect processes

        // Socket management
        this.backgroundMusicSockets = new Map();   // zone -> socket path
        this.speechSockets = new Map();            // zone -> socket path

        // Audio state tracking
        this.backgroundMusicStates = new Map();    // zone -> { playing, volume, file }
        this.speechQueues = new Map();             // zone -> speech queue
        this.activeSoundEffects = 0;              // Current count of active sound effects

        // Performance limits
        this.maxConcurrentSoundEffects = this.getMaxSoundEffects();
    }

    /**
     * Initialize the multi-zone audio manager
     */
    async initialize() {
        if (this.initialized) return;

        logger.info('Initializing Multi-Zone Audio Manager...');

        try {
            // Initialize device manager
            await this.deviceManager.initialize();

            // Configure zones from config
            if (this.config.zones) {
                this.deviceManager.configureZones(this.config.zones);
            }

            // Initialize audio instances for each zone
            await this.initializeZoneAudioInstances();

            this.initialized = true;
            logger.info('Multi-Zone Audio Manager initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Multi-Zone Audio Manager:', error);
            throw error;
        }
    }

    /**
     * Initialize MPV instances for each zone based on their audio type support
     */
    async initializeZoneAudioInstances() {
        logger.info('Initializing zone audio instances...');

        // Clean up any existing socket files
        this.cleanupSocketFiles();

        for (const [zoneName, zoneConfig] of this.deviceManager.zoneConfigs) {
            try {
                // Initialize background music instance if zone supports it
                if (zoneConfig.backgroundMusic) {
                    await this.initializeBackgroundMusicForZone(zoneName, zoneConfig);
                }

                // Initialize speech instance if zone supports it
                if (zoneConfig.speech) {
                    await this.initializeSpeechForZone(zoneName, zoneConfig);
                }

                // Initialize speech queue
                this.speechQueues.set(zoneName, []);

                logger.info(`Initialized audio instances for zone: ${zoneName}`);
            } catch (error) {
                logger.error(`Failed to initialize zone ${zoneName}:`, error);
            }
        }
    }

    /**
     * Initialize background music MPV instance for a zone
     */
    async initializeBackgroundMusicForZone(zoneName, zoneConfig) {
        const socketPath = `/tmp/mpv-background-${zoneName}.sock`;
        this.backgroundMusicSockets.set(zoneName, socketPath);

        const args = [
            '--idle=yes',
            `--input-ipc-server=${socketPath}`,
            '--no-terminal',
            '--no-video',
            `--volume=${zoneConfig.volume}`,
            '--loop-file=inf',
            '--cache=yes',
            `--audio-device=${zoneConfig.deviceString}`,
            '--msg-level=all=info'
        ];

        logger.debug(`Starting background music MPV for zone ${zoneName} with device: ${zoneConfig.deviceString}`);

        const mpvProcess = spawn('mpv', args, { detached: false });
        this.backgroundMusicInstances.set(zoneName, mpvProcess);

        // Wait for socket to be ready
        const socketReady = await waitForSocket(socketPath, 20);
        if (!socketReady) {
            throw new Error(`Background music socket not ready for zone: ${zoneName}`);
        }

        // Test IPC connection
        await sendMpvCommand(socketPath, { command: ['get_property', 'mpv-version'] });

        // Initialize background music state
        this.backgroundMusicStates.set(zoneName, {
            playing: false,
            volume: zoneConfig.volume,
            file: null,
            socket: socketPath
        });

        logger.info(`Background music initialized for zone: ${zoneName}`);
    }

    /**
     * Initialize speech MPV instance for a zone
     */
    async initializeSpeechForZone(zoneName, zoneConfig) {
        const socketPath = `/tmp/mpv-speech-${zoneName}.sock`;
        this.speechSockets.set(zoneName, socketPath);

        const args = [
            '--idle=yes',
            `--input-ipc-server=${socketPath}`,
            '--no-terminal',
            '--no-video',
            '--volume=90',
            '--keep-open=yes',
            '--cache=yes',
            `--audio-device=${zoneConfig.deviceString}`,
            '--msg-level=all=info'
        ];

        logger.debug(`Starting speech MPV for zone ${zoneName} with device: ${zoneConfig.deviceString}`);

        const mpvProcess = spawn('mpv', args, { detached: false });
        this.speechInstances.set(zoneName, mpvProcess);

        // Wait for socket to be ready
        const socketReady = await waitForSocket(socketPath, 20);
        if (!socketReady) {
            throw new Error(`Speech socket not ready for zone: ${zoneName}`);
        }

        // Test IPC connection
        await sendMpvCommand(socketPath, { command: ['get_property', 'mpv-version'] });

        logger.info(`Speech initialized for zone: ${zoneName}`);
    }

    /**
     * Play background music in specified zones
     * @param {string|Array} zones - Zone name(s) to play music in
     * @param {string} filePath - Path to audio file
     * @param {Object} options - Playback options
     */
    async playBackgroundMusic(zones, filePath, options = {}) {
        const zoneList = Array.isArray(zones) ? zones : [zones];
        const volume = options.volume || 70;
        const loop = options.loop !== false; // Default to looping

        logger.info(`Playing background music in zones: ${zoneList.join(', ')}`);

        for (const zoneName of zoneList) {
            try {
                const state = this.backgroundMusicStates.get(zoneName);
                if (!state) {
                    logger.warn(`Background music not available for zone: ${zoneName}`);
                    continue;
                }

                // Load the file
                await sendMpvCommand(state.socket, {
                    command: ['loadfile', filePath, 'replace']
                });

                // Set volume
                await sendMpvCommand(state.socket, {
                    command: ['set_property', 'volume', volume]
                });

                // Set looping if requested
                if (loop) {
                    await sendMpvCommand(state.socket, {
                        command: ['set_property', 'loop-file', 'inf']
                    });
                }

                // Update state
                state.playing = true;
                state.volume = volume;
                state.file = filePath;

                logger.info(`Background music started in zone: ${zoneName}`);
            } catch (error) {
                logger.error(`Failed to start background music in zone ${zoneName}:`, error);
            }
        }
    }

    /**
     * Stop background music in specified zones
     * @param {string|Array} zones - Zone name(s) to stop music in
     */
    async stopBackgroundMusic(zones) {
        const zoneList = Array.isArray(zones) ? zones : [zones];

        logger.info(`Stopping background music in zones: ${zoneList.join(', ')}`);

        for (const zoneName of zoneList) {
            try {
                const state = this.backgroundMusicStates.get(zoneName);
                if (!state || !state.playing) {
                    continue;
                }

                await sendMpvCommand(state.socket, {
                    command: ['stop']
                });

                state.playing = false;
                state.file = null;

                logger.info(`Background music stopped in zone: ${zoneName}`);
            } catch (error) {
                logger.error(`Failed to stop background music in zone ${zoneName}:`, error);
            }
        }
    }

    /**
     * Adjust background music volume (for ducking during speech)
     * @param {string|Array} zones - Zone name(s)
     * @param {number} volume - Volume level (0-100)
     */
    async setBackgroundMusicVolume(zones, volume) {
        const zoneList = Array.isArray(zones) ? zones : [zones];

        for (const zoneName of zoneList) {
            try {
                const state = this.backgroundMusicStates.get(zoneName);
                if (!state) continue;

                await sendMpvCommand(state.socket, {
                    command: ['set_property', 'volume', volume]
                });

                state.volume = volume;
            } catch (error) {
                logger.error(`Failed to set background music volume in zone ${zoneName}:`, error);
            }
        }
    }

    /**
     * Play speech audio in specified zones with background music ducking
     * @param {string|Array} zones - Zone name(s) to play speech in
     * @param {string} filePath - Path to speech audio file
     * @param {Object} options - Speech options
     */
    async playSpeech(zones, filePath, options = {}) {
        const zoneList = Array.isArray(zones) ? zones : [zones];
        const volume = options.volume || 90;
        const duckVolume = options.duckVolume || 40;

        logger.info(`Playing speech in zones: ${zoneList.join(', ')}`);

        for (const zoneName of zoneList) {
            try {
                // Add to speech queue for this zone
                const queue = this.speechQueues.get(zoneName) || [];
                queue.push({ filePath, volume, duckVolume, options });
                this.speechQueues.set(zoneName, queue);

                // Process queue if not already processing
                this.processSpeechQueue(zoneName);
            } catch (error) {
                logger.error(`Failed to queue speech in zone ${zoneName}:`, error);
            }
        }
    }

    /**
     * Process speech queue for a zone
     */
    async processSpeechQueue(zoneName) {
        const queue = this.speechQueues.get(zoneName);
        if (!queue || queue.length === 0) return;

        const speechSocket = this.speechSockets.get(zoneName);
        if (!speechSocket) {
            logger.warn(`Speech not available for zone: ${zoneName}`);
            return;
        }

        const speechItem = queue.shift();
        const { filePath, volume, duckVolume } = speechItem;

        try {
            // Duck background music if playing in this zone
            const backgroundState = this.backgroundMusicStates.get(zoneName);
            let originalVolume = null;
            
            if (backgroundState && backgroundState.playing) {
                originalVolume = backgroundState.volume;
                await this.setBackgroundMusicVolume(zoneName, duckVolume);
                logger.debug(`Ducked background music to ${duckVolume}% in zone: ${zoneName}`);
            }

            // Play speech
            await sendMpvCommand(speechSocket, {
                command: ['loadfile', filePath, 'replace']
            });

            await sendMpvCommand(speechSocket, {
                command: ['set_property', 'volume', volume]
            });

            // Monitor for speech completion
            await monitorProperty(speechSocket, 'eof-reached', true, () => {
                logger.debug(`Speech completed in zone: ${zoneName}`);
            });

            // Restore background music volume
            if (originalVolume !== null) {
                await this.setBackgroundMusicVolume(zoneName, originalVolume);
                logger.debug(`Restored background music to ${originalVolume}% in zone: ${zoneName}`);
            }

            logger.info(`Speech completed in zone: ${zoneName}`);

            // Process next item in queue
            setTimeout(() => this.processSpeechQueue(zoneName), 100);

        } catch (error) {
            logger.error(`Failed to play speech in zone ${zoneName}:`, error);
            
            // Try to process next item in queue
            setTimeout(() => this.processSpeechQueue(zoneName), 1000);
        }
    }

    /**
     * Play sound effect in specified zones (fire-and-forget)
     * @param {string|Array} zones - Zone name(s) to play sound effect in
     * @param {string} filePath - Path to sound effect file
     * @param {Object} options - Sound effect options
     */
    async playSoundEffect(zones, filePath, options = {}) {
        const zoneList = Array.isArray(zones) ? zones : [zones];
        const volume = options.volume || 100;

        // Check concurrent sound effect limit
        if (this.activeSoundEffects >= this.maxConcurrentSoundEffects) {
            logger.warn(`Sound effect limit reached (${this.maxConcurrentSoundEffects}), skipping playback`);
            return;
        }

        logger.debug(`Playing sound effect in zones: ${zoneList.join(', ')}`);

        for (const zoneName of zoneList) {
            try {
                const zoneConfig = this.deviceManager.zoneConfigs.get(zoneName);
                if (!zoneConfig || !zoneConfig.soundEffects) {
                    logger.warn(`Sound effects not available for zone: ${zoneName}`);
                    continue;
                }

                // Spawn fire-and-forget MPV instance with low-latency settings
                const args = [
                    '--no-terminal',
                    '--no-video',
                    `--volume=${volume}`,
                    '--audio-buffer=0.02',  // Low latency
                    '--cache=no',           // No caching for immediate playback
                    `--audio-device=${zoneConfig.deviceString}`,
                    filePath
                ];

                const effectProcess = spawn('mpv', args, { detached: false });
                this.soundEffectProcesses.add(effectProcess);
                this.activeSoundEffects++;

                // Clean up when process ends
                effectProcess.on('close', (code) => {
                    this.soundEffectProcesses.delete(effectProcess);
                    this.activeSoundEffects--;
                    logger.debug(`Sound effect process ended in zone ${zoneName}, code: ${code}`);
                });

                effectProcess.on('error', (error) => {
                    this.soundEffectProcesses.delete(effectProcess);
                    this.activeSoundEffects--;
                    logger.error(`Sound effect error in zone ${zoneName}:`, error);
                });

                logger.debug(`Sound effect started in zone: ${zoneName}`);
            } catch (error) {
                logger.error(`Failed to start sound effect in zone ${zoneName}:`, error);
            }
        }
    }

    /**
     * Get maximum concurrent sound effects based on hardware
     */
    getMaxSoundEffects() {
        // Try to detect hardware platform
        try {
            const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
            
            if (cpuInfo.includes('BCM2835')) {
                return 3; // Pi Zero
            } else if (cpuInfo.includes('BCM2711')) {
                return 15; // Pi 4
            } else if (cpuInfo.includes('BCM2712')) {
                return 25; // Pi 5
            }
        } catch (error) {
            // Ignore error, use default
        }

        // Default for unknown hardware
        return 10;
    }

    /**
     * Get zones that support a specific audio type
     * @param {string} audioType - 'backgroundMusic', 'speech', or 'soundEffects'
     * @returns {Array} - Array of zone names
     */
    getZonesForAudioType(audioType) {
        return this.deviceManager.getZonesForAudioType(audioType);
    }

    /**
     * Get device information for debugging
     */
    getDeviceInfo() {
        return {
            aliases: this.deviceManager.getAvailableAliases(),
            devices: this.deviceManager.getDiscoveredDevices(),
            zones: Object.fromEntries(this.deviceManager.zoneConfigs),
            backgroundMusicZones: this.getZonesForAudioType('backgroundMusic'),
            speechZones: this.getZonesForAudioType('speech'),
            soundEffectZones: this.getZonesForAudioType('soundEffects'),
            activeSoundEffects: this.activeSoundEffects,
            maxSoundEffects: this.maxConcurrentSoundEffects
        };
    }

    /**
     * Clean up socket files
     */
    cleanupSocketFiles() {
        const socketPattern = '/tmp/mpv-*';
        try {
            const sockets = fs.readdirSync('/tmp').filter(file => 
                file.startsWith('mpv-') && file.endsWith('.sock')
            );
            
            for (const socket of sockets) {
                try {
                    fs.unlinkSync(path.join('/tmp', socket));
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    /**
     * Shutdown all audio instances
     */
    async shutdown() {
        logger.info('Shutting down Multi-Zone Audio Manager...');

        // Stop all background music instances
        for (const [zoneName, state] of this.backgroundMusicStates) {
            try {
                await sendMpvCommand(state.socket, { command: ['quit'] });
            } catch (error) {
                // Ignore shutdown errors
            }
        }

        // Stop all speech instances
        for (const [zoneName, socket] of this.speechSockets) {
            try {
                await sendMpvCommand(socket, { command: ['quit'] });
            } catch (error) {
                // Ignore shutdown errors
            }
        }

        // Kill all sound effect processes
        for (const process of this.soundEffectProcesses) {
            try {
                process.kill();
            } catch (error) {
                // Ignore shutdown errors
            }
        }

        // Clean up socket files
        this.cleanupSocketFiles();

        logger.info('Multi-Zone Audio Manager shutdown complete');
    }
}

module.exports = MultiZoneAudioManager;

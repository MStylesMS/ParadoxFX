/**
 * Audio Zone        // Audio configuration
        this.audioConfig = {
            baseMediaPath: this._resolveDeviceMediaDir(config),
            audioDevice: config.audioDevice || 'auto',
            dualOutputMode: config.dualOutputMode || false,
            primaryDevice: config.primaryDevice || null,
            secondaryDevice: config.secondaryDevice || null,
            defaultVolume: parseInt(config.volume) || 80
        };andles audio-only zones with audio capabilities:
 * - Background music playback
 * - Speech/narration with queuing
 * - Sound effects
 * - Dual output support for combined audio sinks
 */

const BaseZone = require('./base-zone');
const AudioManager = require('../media/audio-manager');

class AudioZone extends BaseZone {
    constructor(config, mqttClient, zoneManager) {
        super(config, mqttClient);
        this.zoneManager = zoneManager;

        // Audio-specific configuration
        this.audioConfig = {
            baseMediaPath: config.mediaPath || '/opt/paradox/media',
            audioDevice: config.audioDevice || 'auto',
            dualOutputMode: config.dual_output_mode || false,
            primaryDevice: config.primary_device || null,
            secondaryDevice: config.secondary_device || null,
            defaultVolume: parseInt(config.volume) || 80,
            duckingVolume: config.duckingVolume,
            zoneId: config.name || 'unknown'  // Add zone-specific identifier
        };

        // Audio management
        this.audioManager = new AudioManager(this.audioConfig);

        this.originalBackgroundVolume = null;

        // Audio-specific state
        this.currentState = {
            ...this.currentState,
            backgroundMusic: {
                playing: false,
                file: null,
                volume: this.audioConfig.defaultVolume,
                isDucked: false
            },
            speechQueue: {
                length: 0,
                isProcessing: false
            },
            lastSpeech: null,
            lastSoundEffect: null
        };
    }

    async initialize() {
        this.logger.info('Initializing audio zone...');

        try {
            // Initialize audio system
            await this.audioManager.initialize();
            
            // Set up MPV instance tracking
            this.mpvInstances.background = {
                status: 'idle',
                manager: this.audioManager
            };
            this.mpvInstances.speech = {
                status: 'idle',
                manager: this.audioManager
            };

            this.isInitialized = true;
            this.logger.info('Audio zone initialized successfully');

            // Publish initial status
            this.publishStatus();

        } catch (error) {
            this.logger.error('Audio zone initialization failed:', error);
            this.publishError('Zone initialization failed', { error: error.message });
            throw error;
        }
    }

    async handleCommand(command) {
        if (!this.isInitialized) {
            throw new Error('Audio zone not initialized');
        }

        this.currentState.lastCommand = command.command;
        this.logger.debug(`Handling command: ${command.command}`);

        // Check if command is supported
        if (!this._isCommandSupported(command.command)) {
            this._handleUnsupportedCommand(command.command);
            return;
        }

        try {
            switch (command.command) {
                // Background music commands
                case 'playBackgroundMusic':
                case 'playMusic':
                    await this._playBackgroundMusic(command.audio || command.file, command.volume, command.loop);
                    break;
                case 'stopBackgroundMusic':
                case 'stopMusic':
                    await this._stopBackgroundMusic();
                    break;

                // Speech commands
                case 'playSpeech':
                    await this._playSpeech(command.audio || command.file, command.volume, command.duckVolume);
                    break;
                case 'clearSpeechQueue':
                    await this._clearSpeechQueue();
                    break;

                // Sound effect commands
                case 'playSoundEffect':
                case 'playEffect':
                case 'playAudioFx':
                    await this._playSoundEffect(command.audio || command.file, command.volume);
                    break;

                // Volume control
                case 'setVolume':
                    await this._setVolume(command.volume);
                    break;

                // Status commands
                case 'getStatus':
                    this.publishStatus();
                    break;

                // Stop commands
                case 'stopAll':
                    await this._stopAll();
                    break;

                // Unsupported commands (graceful degradation)
                case 'setImage':
                    this._handleUnsupportedCommand(command.command);
                    break;
                case 'playVideo':
                    this._handleUnsupportedCommand(command.command);
                    break;
                case 'sleepScreen':
                case 'wakeScreen':
                    this._handleUnsupportedCommand(command.command);
                    break;

                default:
                    throw new Error(`Unknown command: ${command.command}`);
            }

            // Publish success event
            this.publishEvent({
                command_completed: command.command,
                success: true
            });

        } catch (error) {
            this.logger.error(`Command failed: ${command.command}`, error);
            this.publishError(`Command failed: ${command.command}`, {
                error: error.message,
                command: command.command
            });
            throw error;
        }
    }

    getSupportedCommands() {
        return [
            'playBackgroundMusic', 'playMusic', 'stopBackgroundMusic', 'stopMusic',
            'playSpeech', 'clearSpeechQueue',
            'playSoundEffect', 'playEffect', 'playAudioFx',
            'setVolume', 'getStatus', 'stopAll'
        ];
    }

    _isCommandSupported(command) {
        const unsupportedCommands = [
            'setImage', 'playVideo', 'stopVideo', 'pause', 'resume',
            'sleepScreen', 'wakeScreen'
        ];
        return !unsupportedCommands.includes(command);
    }

    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        this.logger.info('Shutting down audio zone...');

        try {
            // Stop all audio
            await this._stopAll();

            // Shutdown audio manager
            if (this.audioManager) {
                await this.audioManager.shutdown();
            }

            // Stop periodic status updates
            this._stopPeriodicStatus();

            this.isInitialized = false;
            this.logger.info('Audio zone shutdown complete');

        } catch (error) {
            this.logger.error('Error during audio zone shutdown:', error);
            throw error;
        }
    }

    // ========================================================================
    // COMMAND IMPLEMENTATIONS
    // ========================================================================

    async _playBackgroundMusic(audioPath, volume, loop) {
        if (!audioPath) {
            throw new Error('Background music path is required');
        }

        // Validate file exists before proceeding
        const fileValidation = await this._validateMediaFile(audioPath);
        if (!fileValidation.exists) {
            this.publishMessage('warning', {
                message: fileValidation.error,
                command: 'playBackgroundMusic',
                file: audioPath
            });
            this.logger.warn(fileValidation.error);
            return; // Don't update state if file doesn't exist
        }

        // Check if background music MPV process is running
        const processRunning = await this._checkAndRestartMpvProcess('background');
        if (!processRunning) {
            const errorMsg = 'Background music system not available';
            this.publishMessage('warning', {
                message: errorMsg,
                command: 'playBackgroundMusic',
                file: audioPath
            });
            this.logger.error(errorMsg);
            return;
        }

        const fullPath = fileValidation.path;
        const targetVolume = volume !== undefined ? volume : this.currentState.volume;
        const shouldLoop = loop !== undefined ? loop : false; // Default to single play

        this.logger.info(`Playing background music: ${audioPath} at volume ${targetVolume} (loop: ${shouldLoop})`);

        const result = await this.audioManager.playBackgroundMusic(fullPath, targetVolume, shouldLoop);
        
        if (!result.success) {
            // Publish warning message to MQTT
            this.publishMessage('warning', {
                message: result.error,
                command: 'playBackgroundMusic',
                file: audioPath
            });
            return; // Don't update state if playback failed
        }

        // Update state
        this.currentState.backgroundMusic = {
            playing: true,
            file: audioPath,
            volume: targetVolume,
            isDucked: false
        };
        
        this.mpvInstances.background.currentFile = audioPath;
        this.mpvInstances.background.status = 'playing';

        this.publishStatus();
        this.publishEvent({
            background_music_started: audioPath,
            volume: targetVolume
        });
    }

    async _stopBackgroundMusic() {
        this.logger.info('Stopping background music');

        await this.audioManager.stopBackgroundMusic();

        // Update state
        this.currentState.backgroundMusic = {
            playing: false,
            file: null,
            volume: this.currentState.backgroundMusic.volume,
            isDucked: false
        };
        
        this.mpvInstances.background.currentFile = null;
        this.mpvInstances.background.status = 'idle';

        this.publishStatus();
        this.publishEvent({ background_music_stopped: true });
    }

    async _playSpeech(audioPath, volume, duckVolume) {
        if (!audioPath) {
            throw new Error('Speech path is required');
        }

        // Validate file exists before proceeding
        const fileValidation = await this._validateMediaFile(audioPath);
        if (!fileValidation.exists) {
            this.publishMessage('warning', {
                message: fileValidation.error,
                command: 'playSpeech',
                file: audioPath
            });
            this.logger.warn(fileValidation.error);
            return; // Don't update state if file doesn't exist
        }

        // Check if speech MPV process is running
        const processRunning = await this._checkAndRestartMpvProcess('speech');
        if (!processRunning) {
            const errorMsg = 'Speech system not available';
            this.publishMessage('warning', {
                message: errorMsg,
                command: 'playSpeech',
                file: audioPath
            });
            this.logger.error(errorMsg);
            return;
        }

        const fullPath = fileValidation.path;
        const targetVolume = volume !== undefined ? volume : this.currentState.volume;
        const targetDuckingVolume = duckVolume !== undefined ? duckVolume : this.audioConfig.duckingVolume;

        this.logger.info(`Playing speech: ${audioPath} at volume ${targetVolume}`);

        const result = await this.audioManager.playSpeech(fullPath, {
            volume: targetVolume,
            duckVolume: targetDuckingVolume
        });
        
        if (!result.success) {
            // Publish warning message to MQTT
            this.publishMessage('warning', {
                message: result.error,
                command: 'playSpeech',
                file: audioPath
            });
            return; // Don't update state if playback failed
        }

        // Mark as ducked if background music is playing
        if (this.currentState.backgroundMusic.playing) {
            this.currentState.backgroundMusic.isDucked = true;
        }

        // Update state
        this.currentState.lastSpeech = {
            file: audioPath,
            timestamp: new Date().toISOString()
        };
        
        this.mpvInstances.speech.status = 'playing';

        // Background music should auto-unduck after speech completes
        if (this.currentState.backgroundMusic.playing) {
            // Note: In a real implementation, you'd listen for speech completion
            setTimeout(() => {
                this.currentState.backgroundMusic.isDucked = false;
                this.mpvInstances.speech.status = 'idle';
                this.publishStatus();
            }, 1000); // Simplified - should be based on actual speech completion
        }

        this.publishStatus();
        this.publishEvent({
            speech_started: audioPath,
            volume: targetVolume,
            background_ducked: this.currentState.backgroundMusic.isDucked
        });
    }

    async _clearSpeechQueue() {
        this.logger.info('Clearing speech queue');

        await this.audioManager.clearSpeechQueue();

        // Update state
        this.currentState.speechQueue = {
            length: 0,
            isProcessing: false
        };
        
        this.mpvInstances.speech.status = 'idle';

        // Un-duck background music if it was ducked
        if (this.currentState.backgroundMusic.isDucked) {
            this.currentState.backgroundMusic.isDucked = false;
        }

        this.publishStatus();
        this.publishEvent({ speech_queue_cleared: true });
    }

    async _playSoundEffect(audioPath, volume) {
        if (!audioPath) {
            throw new Error('Sound effect path is required');
        }

        // Validate file exists before proceeding
        const fileValidation = await this._validateMediaFile(audioPath);
        if (!fileValidation.exists) {
            this.publishMessage('warning', {
                message: fileValidation.error,
                command: 'playSoundEffect',
                file: audioPath
            });
            this.logger.warn(fileValidation.error);
            return; // Don't update state if file doesn't exist
        }

        const fullPath = fileValidation.path;
        const targetVolume = volume !== undefined ? volume : this.currentState.volume;

        this.logger.debug(`Playing sound effect: ${audioPath} at volume ${targetVolume}`);

        const result = await this.audioManager.playSoundEffect(fullPath, targetVolume);
        
        if (!result.success) {
            // Publish warning message to MQTT
            this.publishMessage('warning', {
                message: result.error,
                command: 'playSoundEffect',
                file: audioPath
            });
            return; // Don't update state if playback failed
        }

        // Update state
        this.currentState.lastSoundEffect = {
            file: audioPath,
            timestamp: new Date().toISOString()
        };

        this.publishEvent({
            sound_effect_played: audioPath,
            volume: targetVolume
        });
    }

    async _setVolume(volume) {
        if (volume === undefined || volume < 0 || volume > 100) {
            throw new Error('Volume must be between 0 and 100');
        }

        this.logger.info(`Setting volume to: ${volume}`);

        // Update background music volume if playing
        if (this.currentState.backgroundMusic.playing) {
            await this.audioManager.setBackgroundMusicVolume(volume);
            this.currentState.backgroundMusic.volume = volume;
        }

        this.currentState.volume = volume;

        this.publishStatus();
        this.publishEvent({ volume_changed: volume });
    }

    async _stopAll() {
        this.logger.info('Stopping all audio');

        // Stop background music
        if (this.currentState.backgroundMusic.playing) {
            await this._stopBackgroundMusic();
        }

        // Clear speech queue
        await this._clearSpeechQueue();

        this.currentState.status = 'idle';
        this.publishStatus();
        this.publishEvent({ all_audio_stopped: true });
    }

    /**
     * Duck the background music volume.
     */
    duck() {
        if (this.currentState.backgroundMusic.playing && !this.currentState.backgroundMusic.isDucked) {
            this.logger.info('Ducking background music');
            this.originalBackgroundVolume = this.currentState.backgroundMusic.volume;
            const duckingVolume = this.audioConfig.duckingVolume || 20; // Default to 20%
            this.audioManager.setBackgroundMusicVolume(duckingVolume);
            this.currentState.backgroundMusic.isDucked = true;
            this.publishStatus();
        }
    }

    /**
     * Un-duck the background music volume.
     */
    unduck() {
        if (this.currentState.backgroundMusic.playing && this.currentState.backgroundMusic.isDucked) {
            this.logger.info('Un-ducking background music');
            const restoreVolume = this.originalBackgroundVolume !== null ? this.originalBackgroundVolume : this.audioConfig.defaultVolume;
            this.audioManager.setBackgroundMusicVolume(restoreVolume);
            this.currentState.backgroundMusic.isDucked = false;
            this.originalBackgroundVolume = null;
            this.publishStatus();
        }
    }

    /**
     * Resolve device media directory path
     * @protected
     */
    _resolveDeviceMediaDir(config) {
        const path = require('path');
        
        // If mediaDir is absolute, use it directly
        if (config.mediaDir && path.isAbsolute(config.mediaDir)) {
            return config.mediaDir;
        }
        
        // Otherwise, combine media base path with device media_dir
        const mediaBasePath = config.mediaBasePath || '/opt/paradox/media';
        const deviceMediaDir = config.mediaDir || config.media_dir || '';
        
        return path.join(mediaBasePath, deviceMediaDir);
    }
}

module.exports = AudioZone;

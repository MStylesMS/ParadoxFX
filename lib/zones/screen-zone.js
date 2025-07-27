/**
 * Screen Zone
 * 
 * Handles screen zones with full multimedia capabilities:
 * - Image display
 * - Video playback  
 * - Audio playback (background music, speech, sound effects)
 * - Screen power management
 */

const BaseZone = require('./base-zone');
const MediaPlayerFactory = require('../media/media-player-factory');
const ScreenPowerManager = require('../utils/screen-power-manager');
const AudioManager = require('../media/audio-manager');

class ScreenZone extends BaseZone {
    constructor(config, mqttClient) {
        super(config, mqttClient);

        // Screen-specific configuration
        this.display = config.display || ':0';
        this.targetMonitor = config.targetMonitor || 0;
        this.defaultImage = config.defaultImage || config.default_image || 'default.png';

        // Media playback management
        this.mediaPlayerFactory = new MediaPlayerFactory(config);
        this.zoneManager = null; // MPV Zone Manager for images/video
        
        // Resolve media directory once for consistent path handling
        const resolvedMediaDir = this._resolveDeviceMediaDir(config);
        
        // Audio management for background music, speech, and effects
        this.audioManager = new AudioManager({
            baseMediaPath: resolvedMediaDir,
            audioDevice: config.audioDevice || 'auto',
            defaultVolume: parseInt(config.volume) || 80,
            zoneId: config.name || 'unknown'  // Add zone-specific identifier
        });

        // Screen power management
        this.screenPowerManager = new ScreenPowerManager(this.display);

        // Zone configuration for MPV manager
        this.zoneConfig = {
            name: config.name,
            mediaDir: resolvedMediaDir,
            audioDevice: config.audioDevice,
            display: this.display,
            targetMonitor: this.targetMonitor,
            videoQueueMax: config.videoQueueMax || 5,
            mpvVideoOptions: config.mpvVideoOptions,
            mpvVideoProfile: config.mpvVideoProfile
        };

        // Screen-specific state
        this.currentState = {
            ...this.currentState,
            currentImage: null,
            currentVideo: null,
            backgroundMusic: null,
            videoQueueLength: 0,
            audioQueueLength: 0,
            speechQueueLength: 0,
            screenAwake: true
        };

        // Smart media handling state
        this.smartMediaState = {
            lastCommand: null,           // 'setImage' or 'playVideo'
            lastMediaPath: null,         // The last media file path
            currentLoadedPath: null,     // Currently loaded in MPV
            isVideoPaused: false         // Whether video is paused on first frame
        };
    }

    async initialize() {
        this.logger.info(`Initializing screen zone on display ${this.display}`);

        try {
            // Initialize screen power management
            await this.screenPowerManager.disableScreenBlanking();
            await this.screenPowerManager.checkDpmsSupport();

            // Initialize MPV Zone Manager for images/video
            this.zoneManager = await this.mediaPlayerFactory.createZoneManager(this.zoneConfig);
            this.mpvInstances.media = {
                status: 'idle',
                manager: this.zoneManager
            };

            // Initialize audio system
            await this.audioManager.initialize();
            this.mpvInstances.background = {
                status: 'idle',
                manager: this.audioManager
            };
            this.mpvInstances.speech = {
                status: 'idle', 
                manager: this.audioManager
            };

            // BUGFIX: Give MPV zone manager extra time to be fully ready for IPC commands
            // The zone manager initialization includes a 500ms delay, but we need to ensure
            // the IPC connection is completely stable before loading default media
            this.logger.debug('Waiting for MPV zone manager to be fully ready...');
            await new Promise(resolve => setTimeout(resolve, 250));

            // Display default image on startup
            await this._setDefaultImage();

            // Publish initial status
            this.publishStatus();

            this.isInitialized = true;
            this.logger.info('Screen zone initialized successfully');

        } catch (error) {
            this.logger.error('Screen zone initialization failed:', error);
            this.publishError('Zone initialization failed', { error: error.message });
            throw error;
        }
    }

    async handleCommand(command) {
        if (!this.isInitialized) {
            throw new Error('Screen zone not initialized');
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
                // Image commands
                case 'setImage':
                    await this._setImage(command.file || command.image);
                    break;

                // Video commands
                case 'playVideo':
                    await this._playVideo(command.file || command.video, command.volumeAdjust, command.channel);
                    break;
                case 'stopVideo':
                    await this._stopVideo();
                    break;
                case 'pause':
                    await this._pauseVideo();
                    break;
                case 'resume':
                    await this._resumeVideo();
                    break;

                // Audio commands
                case 'playAudio':
                    await this._playAudio(command.file || command.audio, command.volumeAdjust, command.channel);
                    break;
                case 'playBackgroundMusic':
                    await this._playBackgroundMusic(command.file || command.audio, command.volume, command.loop);
                    break;
                case 'stopBackgroundMusic':
                    await this._stopBackgroundMusic();
                    break;
                case 'playSpeech':
                    await this._playSpeech(command.file || command.audio, command.volume);
                    break;
                case 'playAudioFx':
                case 'playSoundEffect':
                    await this._playSoundEffect(command.file || command.audio, command.volume);
                    break;
                case 'stopAudio':
                    await this._stopAudio();
                    break;

                // Screen power management
                case 'sleepScreen':
                    await this._sleepScreen();
                    break;
                case 'wakeScreen':
                    await this._wakeScreen();
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
            'setImage',
            'playVideo', 'stopVideo', 'pause', 'resume',
            'playAudio', 'playBackgroundMusic', 'stopBackgroundMusic', 
            'playSpeech', 'playAudioFx', 'playSoundEffect', 'stopAudio',
            'sleepScreen', 'wakeScreen',
            'setVolume', 'getStatus', 'stopAll'
        ];
    }

    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        this.logger.info('Shutting down screen zone...');

        try {
            // Stop all media
            await this._stopAll();

            // Shutdown audio manager
            if (this.audioManager) {
                await this.audioManager.shutdown();
            }

            // Shutdown media player factory
            if (this.mediaPlayerFactory) {
                await this.mediaPlayerFactory.shutdown();
            }

            // Stop periodic status updates
            this._stopPeriodicStatus();

            this.isInitialized = false;
            this.logger.info('Screen zone shutdown complete');

        } catch (error) {
            this.logger.error('Error during screen zone shutdown:', error);
            throw error;
        }
    }

    // ========================================================================
    // SMART MEDIA HANDLING HELPERS
    // ========================================================================

    /**
     * Detect if a file is a video based on its extension
     * @param {string} filePath - File path to check
     * @returns {boolean} True if file is a video
     */
    _isVideoFile(filePath) {
        return this.mediaPlayerFactory.getMediaType(filePath) === 'video';
    }

    /**
     * Check if we should resume existing media instead of reloading
     * @param {string} mediaPath - Media path being requested
     * @param {string} commandType - 'setImage' or 'playVideo'
     * @returns {boolean} True if we should resume instead of reload
     */
    _shouldResumeExistingMedia(mediaPath, commandType) {
        return (
            commandType === 'playVideo' &&
            this.smartMediaState.lastCommand === 'setImage' &&
            this.smartMediaState.lastMediaPath === mediaPath &&
            this.smartMediaState.currentLoadedPath === mediaPath &&
            this.smartMediaState.isVideoPaused &&
            this._isVideoFile(mediaPath)
        );
    }

    // ========================================================================
    // COMMAND IMPLEMENTATIONS
    // ========================================================================

    async _setImage(imagePath) {
        if (!imagePath) {
            throw new Error('Image path is required');
        }

        // Validate file exists before proceeding
        const fileValidation = await this._validateMediaFile(imagePath);
        if (!fileValidation.exists) {
            this.publishMessage('warning', {
                message: fileValidation.error,
                command: 'setImage',
                file: imagePath
            });
            this.logger.warn(fileValidation.error);
            return; // Don't update state if file doesn't exist
        }

        await this.screenPowerManager.autoWakeForMedia('image');
        
        const fullPath = fileValidation.path;
        
        // Smart media handling: Check if this is actually a video file
        const isVideo = this._isVideoFile(imagePath);
        
        if (isVideo) {
            this.logger.info(`🎬 Smart setImage: Detected video file, loading and pausing on first frame: ${imagePath}`);
            
            // Load video and pause on first frame
            await this.zoneManager.loadMedia(fullPath);
            
            // Give MPV a moment to load the video, then pause it
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.zoneManager.pause();
            
            // Update smart media state
            this.smartMediaState.lastCommand = 'setImage';
            this.smartMediaState.lastMediaPath = imagePath;
            this.smartMediaState.currentLoadedPath = imagePath;
            this.smartMediaState.isVideoPaused = true;
            
            // Update zone state as if it's an image
            this.currentState.currentImage = imagePath;
            this.currentState.currentVideo = null;
            this.currentState.status = 'showing_image';
            this.mpvInstances.media.currentFile = imagePath;
        } else {
            // Regular image handling
            this.logger.info(`🖼️ Smart setImage: Loading image file: ${imagePath}`);
            await this.zoneManager.loadMedia(fullPath);
            
            // Update smart media state for images too
            this.smartMediaState.lastCommand = 'setImage';
            this.smartMediaState.lastMediaPath = imagePath;
            this.smartMediaState.currentLoadedPath = imagePath;
            this.smartMediaState.isVideoPaused = false;
            
            // Update zone state
            this.currentState.currentImage = imagePath;
            this.currentState.currentVideo = null;
            this.currentState.status = 'showing_image';
            this.mpvInstances.media.currentFile = imagePath;
        }
        
        this.publishStatus();
        this.logger.debug(`Image set: ${imagePath} (${isVideo ? 'video paused on first frame' : 'static image'})`);
    }

    async _setDefaultImage() {
        try {
            // Validate file exists before proceeding
            const fileValidation = await this._validateMediaFile(this.defaultImage);
            if (!fileValidation.exists) {
                this.logger.warn(`Default image not found: ${fileValidation.error}`);
                // Don't fail initialization, just log the warning
                return;
            }

            const imagePath = fileValidation.path;
            await this.zoneManager.loadMedia(imagePath, 'image');
            
            this.currentState.currentImage = this.defaultImage;
            this.currentState.status = 'showing_image';
            this.mpvInstances.media.currentFile = this.defaultImage;
            
            this.logger.debug(`Default image set: ${this.defaultImage}`);
        } catch (error) {
            this.logger.warn(`Failed to set default image ${this.defaultImage}:`, error.message);
        }
    }

    async _playVideo(videoPath, volumeAdjust, channel) {
        if (!videoPath) {
            throw new Error('Video path is required');
        }

        // Validate file exists before proceeding
        const fileValidation = await this._validateMediaFile(videoPath);
        if (!fileValidation.exists) {
            this.publishMessage('warning', {
                message: fileValidation.error,
                command: 'playVideo',
                file: videoPath
            });
            this.logger.warn(fileValidation.error);
            return; // Don't update state if file doesn't exist
        }

        await this.screenPowerManager.autoWakeForMedia('video');
        
        const fullPath = fileValidation.path;
        
        // Smart media handling: Check if we should resume existing media
        const shouldResume = this._shouldResumeExistingMedia(videoPath, 'playVideo');
        
        if (shouldResume) {
            this.logger.info(`🎬 Smart playVideo: Resuming paused video instead of reloading: ${videoPath}`);
            
            // Just resume the already loaded video
            await this.zoneManager.play();
            
            // Update smart media state
            this.smartMediaState.lastCommand = 'playVideo';
            this.smartMediaState.isVideoPaused = false;
            
        } else {
            // Load new video or reload different video
            this.logger.info(`🎬 Smart playVideo: Loading and auto-playing video: ${videoPath}`);
            
            const options = {};
            
            if (volumeAdjust !== undefined) {
                const adjustedVolume = Math.max(0, Math.min(100, this.currentState.volume + volumeAdjust));
                options.volume = adjustedVolume;
            }

            await this.zoneManager.loadMedia(fullPath, options);
            
            // BUGFIX: With --keep-open=always, videos load paused by default
            // Force play() for playVideo commands to ensure auto-play behavior
            await this.zoneManager.play();
            
            // Update smart media state
            this.smartMediaState.lastCommand = 'playVideo';
            this.smartMediaState.lastMediaPath = videoPath;
            this.smartMediaState.currentLoadedPath = videoPath;
            this.smartMediaState.isVideoPaused = false;
        }
        
        // Update zone state
        this.currentState.currentVideo = videoPath;
        this.currentState.currentImage = null;
        this.currentState.status = 'playing_video';
        this.mpvInstances.media.currentFile = videoPath;
        
        this.publishStatus();
        this.publishEvent({
            video_started: videoPath,
            volume_adjust: volumeAdjust || 0,
            resumed: shouldResume
        });
        
        this.logger.debug(`Video playing: ${videoPath} (${shouldResume ? 'resumed' : 'loaded'})`);
    }

    async _stopVideo() {
        if (this.zoneManager) {
            await this.zoneManager.stop();
        }
        
        this.currentState.currentVideo = null;
        this.mpvInstances.media.currentFile = null;
        
        // Reset smart media state
        this.smartMediaState = {
            lastCommand: null,
            lastMediaPath: null,
            currentLoadedPath: null,
            isVideoPaused: false
        };
        
        // Return to default image
        await this._setDefaultImage();
        
        this.publishStatus();
        this.publishEvent({ video_stopped: true });
    }

    async _pauseVideo() {
        if (this.zoneManager) {
            await this.zoneManager.pause();
        }
        
        this.currentState.status = 'video_paused';
        this.publishStatus();
        this.publishEvent({ video_paused: true });
    }

    async _resumeVideo() {
        if (this.zoneManager) {
            await this.zoneManager.resume();
        }
        
        this.currentState.status = 'playing_video';
        this.publishStatus();
        this.publishEvent({ video_resumed: true });
    }

    async _playAudio(audioPath, volumeAdjust, channel) {
        if (!audioPath) {
            throw new Error('Audio path is required');
        }

        // Validate file exists before proceeding
        const fileValidation = await this._validateMediaFile(audioPath);
        if (!fileValidation.exists) {
            this.publishMessage('warning', {
                message: fileValidation.error,
                command: 'playAudio',
                file: audioPath
            });
            this.logger.warn(fileValidation.error);
            return; // Don't update state if file doesn't exist
        }

        // Auto-wake for HDMI audio only
        if (this.screenPowerManager.shouldWakeForAudio(this.config.audioDevice)) {
            await this.screenPowerManager.autoWakeForMedia('audio');
        }
        
        const fullPath = fileValidation.path;
        const options = {};
        
        if (volumeAdjust !== undefined) {
            const adjustedVolume = Math.max(0, Math.min(100, this.currentState.volume + volumeAdjust));
            options.volume = adjustedVolume;
        }

        await this.zoneManager.loadMedia(fullPath, 'audio', options);
        
        this.currentState.currentAudio = audioPath;
        this.currentState.status = 'playing_audio';
        this.mpvInstances.media.currentFile = audioPath;
        
        this.publishStatus();
        this.publishEvent({
            audio_started: audioPath,
            volume_adjust: volumeAdjust || 0
        });
        
        this.logger.debug(`Audio playing: ${audioPath}`);
    }

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
        const targetVolume = volume || this.currentState.volume;
        const shouldLoop = loop !== undefined ? loop : false; // Default to single play

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
        
        this.currentState.backgroundMusic = audioPath;
        this.mpvInstances.background.currentFile = audioPath;
        this.mpvInstances.background.status = 'playing';
        
        this.publishStatus();
        this.publishEvent({ 
            background_music_started: true, 
            file: audioPath, 
            volume: targetVolume 
        });
        
        this.logger.info(`Background music started: ${audioPath}`);
    }

    async _stopBackgroundMusic() {
        await this.audioManager.stopBackgroundMusic();
        
        this.currentState.backgroundMusic = null;
        this.mpvInstances.background.currentFile = null;
        this.mpvInstances.background.status = 'idle';
        
        this.publishStatus();
        this.publishEvent({ background_music_stopped: true });
        this.logger.info('Background music stopped');
    }

    async _playSpeech(audioPath, volume) {
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
        const targetVolume = volume || this.currentState.volume;

        await this.audioManager.playSpeech(fullPath, targetVolume);
        
        this.mpvInstances.speech.status = 'playing';
        
        this.publishStatus();
        this.publishEvent({
            speech_started: audioPath,
            volume: targetVolume
        });
        
        this.logger.info(`Speech playing: ${audioPath} at volume ${targetVolume}`);
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
        const targetVolume = volume || this.currentState.volume;

        await this.audioManager.playSoundEffect(fullPath, targetVolume);
        
        this.publishEvent({
            sound_effect_played: audioPath,
            volume: targetVolume
        });
        
        this.logger.debug(`Sound effect played: ${audioPath} at volume ${targetVolume}`);
    }

    async _stopAudio() {
        // Stop background music and speech
        await this._stopBackgroundMusic();
        await this.audioManager.clearSpeechQueue();
        
        this.publishEvent({ all_audio_stopped: true });
    }

    async _sleepScreen() {
        await this.screenPowerManager.sleepScreens();
        
        this.currentState.screenAwake = false;
        this.currentState.status = 'screen_asleep';
        
        this.publishStatus();
        this.publishEvent({ screen_sleep: true });
        this.logger.info('Screen put to sleep');
    }

    async _wakeScreen() {
        await this.screenPowerManager.wakeScreens();
        
        // Restore default image if no media is currently playing
        if (!this.currentState.currentVideo && !this.currentState.currentAudio) {
            await this._setDefaultImage();
        }
        
        this.currentState.screenAwake = true;
        
        this.publishStatus();
        this.publishEvent({ screen_wake: true });
        this.logger.info('Screen woken up');
    }

    async _setVolume(volume) {
        if (volume === undefined || volume < 0 || volume > 100) {
            throw new Error('Volume must be between 0 and 100');
        }

        this.currentState.volume = volume;
        
        // Set volume on audio manager
        await this.audioManager.setBackgroundMusicVolume(volume);
        
        this.publishStatus();
        this.publishEvent({ volume_changed: volume });
        this.logger.info(`Volume set to: ${volume}`);
    }

    async _stopAll() {
        // Stop video
        if (this.currentState.currentVideo) {
            await this._stopVideo();
        }
        
        // Stop all audio
        await this._stopAudio();
        
        // Return to default image
        await this._setDefaultImage();
        
        this.currentState.status = 'idle';
        this.publishStatus();
        this.publishEvent({ all_media_stopped: true });
        this.logger.debug('All media stopped');
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

module.exports = ScreenZone;

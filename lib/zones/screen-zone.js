/**
 * Screen Zone
 * 
 * Handles screen zones with full multimedia capabilities:
 * - Image display
 * - Video playback  
 * - Audio playback (background music, speech, sound effects)
 * - Screen power management
 */

const { execSync } = require('child_process');
const BaseZone = require('./base-zone');
const MediaPlayerFactory = require('../media/media-player-factory');
const ScreenPowerManager = require('../utils/screen-power-manager');
const AudioManager = require('../media/audio-manager');
const WindowManager = require('../utils/window-manager');

class ScreenZone extends BaseZone {
    constructor(config, mqttClient, zoneManager) {
        super(config, mqttClient);
        this.zoneManager = zoneManager; // The main ZoneManager

        // Screen-specific configuration
        this.display = config.display || ':0';
        this.targetMonitor = config.targetMonitor || 0;
        this.defaultImage = config.defaultImage || config.default_image || 'default.png';

        // Media playback management
        this.mediaPlayerFactory = new MediaPlayerFactory(config);
        this.mpvZoneManager = null; // MPV Zone Manager for images/video

        // Resolve media directory once for consistent path handling
        const resolvedMediaDir = this._resolveDeviceMediaDir(config);

        // Audio management for background music, speech, and effects
        this.audioManager = new AudioManager({
            baseMediaPath: resolvedMediaDir,
            audioDevice: config.audioDevice || 'auto',
            defaultVolume: parseInt(config.volume) || 80,
            duckingVolume: config.duckingVolume,
            zoneId: config.name || 'unknown'  // Add zone-specific identifier
        }, this);

        // Screen power management
        this.screenPowerManager = new ScreenPowerManager(this.display);

        // Window management for browser switching
        this.windowManager = new WindowManager(this.display);

        // Browser management
        this.browserManager = {
            process: null,
            windowId: null,
            url: null,
            enabled: false,
            keepAlive: false,
            profilePath: `/tmp/pfx-browser-${config.name}`,
            className: 'ParadoxBrowser'
        };

        // Browser monitoring
        this._browserMonitorInterval = null;

        // Zone configuration for MPV manager
        this.zoneConfig = {
            name: config.name,
            mediaDir: resolvedMediaDir,
            audioDevice: config.audioDevice,
            display: this.display,
            targetMonitor: this.targetMonitor,
            videoQueueMax: config.videoQueueMax || 5,
            mpvVideoOptions: config.mpvVideoOptions,
            mpvVideoProfile: config.mpvVideoProfile,
            maxVolume: config.maxVolume || config.max_volume
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
            screenAwake: true,
            zoneVolume: 80, // Default zone master volume
            focus: 'mpv',  // 'mpv' | 'chromium' | 'none'
            content: null, // current file/url being displayed
            browser: {
                enabled: false,
                url: null,
                process_id: null,
                window_id: null
            }
        };

        // Smart media handling state
        this.videoQueue = [];
        this.isProcessingVideoQueue = false;
        this._videoEofTimer = null;

        // Smart media handling state
        this.smartMediaState = {
            lastCommand: null,           // 'setImage' or 'playVideo'
            lastMediaPath: null,         // The last media file path
            currentLoadedPath: null,     // Currently loaded in MPV
            isVideoPaused: false         // Whether video is paused on first frame
        };

        // EOF detection state
        this._videoEofCache = new Map();           // cache durations
        this._videoEofTimeout = null;              // duration-based timer
        this._observerId = null;                   // playback-time observer ID
        this._lastPlaybackTime = 0;                // last observed playback-time
        this._stallCount = 0;                      // consecutive stalled ticks
        this._pausedAt = null;                     // timestamp when video was paused
        this._videoStartedAt = null;               // timestamp when video started playing
        this._originalDuration = null;             // original video duration for resume calculations


        // initialize our queue state
    }

    async initialize() {
        this.logger.info(`Initializing screen zone on display ${this.display}`);

        try {
            // Initialize screen power management
            await this.screenPowerManager.disableScreenBlanking();
            await this.screenPowerManager.checkDpmsSupport();

            // Initialize MPV Zone Manager for images/video
            this.mpvZoneManager = await this.mediaPlayerFactory.createZoneManager(this.zoneConfig);
            this.mpvInstances.media = {
                status: 'idle',
                manager: this.mpvZoneManager
            };

            // Wire MPV resilience events to zone-level publishCommandOutcome / events
            this.mpvZoneManager.on('mpv_exited', (info) => {
                this.publishCommandOutcome({
                    command: 'internal:mpv',
                    outcome: 'warning',
                    parameters: { event: 'mpv_exited', code: info.code, signal: info.signal, attempts: info.attempts },
                    warning_type: 'mpv_exited',
                    message: `MPV process exited (code=${info.code}, signal=${info.signal}).`
                });
            });
            this.mpvZoneManager.on('mpv_restarting', (info) => {
                this.publishMessage('events', {
                    command: 'internal:mpv',
                    outcome: 'warning',
                    restarting: true,
                    attempt: info.attempt,
                    delay_ms: info.delay,
                    code: info.code,
                    signal: info.signal,
                    message: `Attempting MPV restart (attempt ${info.attempt}) in ${info.delay}ms`
                });
            });
            this.mpvZoneManager.on('mpv_restarted', (info) => {
                this.publishCommandOutcome({
                    command: 'internal:mpv',
                    outcome: 'success',
                    parameters: { event: 'mpv_restarted', attempt: info.attempt, socket: info.socket },
                    message: `MPV restarted successfully on attempt ${info.attempt}`
                });
            });
            this.mpvZoneManager.on('mpv_restart_failed', (info) => {
                this.publishCommandOutcome({
                    command: 'internal:mpv',
                    outcome: 'failed',
                    parameters: { event: 'mpv_restart_failed', attempt: info.attempt, max: info.max },
                    error_type: 'mpv_restart_failed',
                    error_message: info.error || 'MPV restart failed',
                    message: `MPV restart failed after ${info.attempt}/${info.max} attempts`
                });
            });

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

            // NOTE: DO NOT enable native MPV 'end-file' event handler here!
            // MPV's native end-file events are unreliable due to 'keep alive' and other MPV settings.
            // They fire immediately instead of when video actually ends, breaking the queue system.
            // Use only the duration-based EOF detection in _setupVideoEof() method.
            // this.mpvZoneManager.on('end-file', () => this._handleMediaEnd()); // DISABLED - DO NOT RE-ENABLE

            // Display default image on startup
            await this._setDefaultImage();

            // Publish initial status
            this.publishStatus();

            // Start periodic status publishing (every 10 seconds)
            this._startPeriodicStatus();

            this.isInitialized = true;
            this.logger.info('Screen zone initialized successfully');

        } catch (error) {
            this.logger.error('Screen zone initialization failed:', error);
            this.publishError('Zone initialization failed', { error: error.message });
            throw error;
        }
    }

    async handleCommand(command) {
        // Normalize command field: support both 'Command' and 'command' keys
        command.command = command.command || command.Command;

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

        // Capture parameters excluding the command field for event payload
        const parameters = Object.keys(command)
            .filter(k => k !== 'Command' && k !== 'command')
            .reduce((acc, k) => { acc[k] = command[k]; return acc; }, {});

        try {
            switch (command.command) {
                // Queue inspection commands
                case 'videoQueue':
                    await this._videoQueue();
                    break;
                case 'speechQueue':
                    await this._speechQueue();
                    break;
                // System control commands
                case 'sleepScreen':
                    await this._sleepScreen();
                    break;
                case 'wakeScreen':
                    await this._wakeScreen();
                    break;
                case 'reboot': {
                    const { exec } = require('child_process');
                    exec('sudo reboot', (err) => { if (err) this.logger.error('Reboot failed', err); });
                    break;
                }
                case 'shutdown': {
                    const { exec } = require('child_process');
                    exec('sudo shutdown now', (err) => { if (err) this.logger.error('Shutdown failed', err); });
                    break;
                }
                case 'killPfx':
                    process.kill(process.pid, 'SIGTERM');
                    break;
                // Image commands
                case 'setImage':
                    await this._enqueueVideoCommand(command);
                    break;

                // Video commands
                case 'playVideo':
                    await this._enqueueVideoCommand(command);
                    break;
                case 'stopVideo':
                    await this._stopVideo();
                    break;
                case 'pauseVideo':
                    await this._pauseVideo();
                    break;
                case 'resumeVideo':
                    await this._resumeVideo();
                    break;
                case 'skipVideo':
                    await this._skipVideo();
                    break;

                // Audio commands
                case 'playAudio':
                    await this._playAudio(command.file || command.audio, command.volumeAdjust, command.channel);
                    break;
                case 'playBackground':
                    await this._playBackgroundMusic(command.file || command.audio, command.volume, command.loop);
                    break;
                case 'pauseBackground':
                    await this._pauseBackgroundMusic();
                    break;
                case 'resumeBackground':
                    await this._resumeBackgroundMusic();
                    break;
                case 'stopBackground':
                    await this._stopBackgroundMusic(command.fadeTime || 0);
                    break;
                case 'playSpeech':
                    await this._playSpeech(command.file || command.audio, command.volume, command.ducking);
                    break;
                case 'pauseSpeech':
                    await this.audioManager.pauseSpeech();
                    break;
                case 'resumeSpeech':
                    await this.audioManager.resumeSpeech();
                    break;
                case 'skipSpeech':
                    await this.audioManager.skipSpeech();
                    break;
                case 'playAudioFX':
                case 'playSoundEffect':
                    await this._playSoundEffect(command.file || command.audio, command.volume);
                    break;
                case 'duck':
                    await this._handleDuckCommand(command);
                    break;
                case 'unduck':
                    await this._handleUnduckCommand(command);
                    break;
                case 'stopAudio':
                    await this._stopAudio(command.fadeTime || 0);
                    break;
                case 'stopSpeech':
                    await this._stopSpeech(command.fadeTime || 0);
                    break;

                // Screen power management
                case 'sleepScreen':
                    await this._sleepScreen();
                    break;
                case 'wakeScreen':
                    await this._wakeScreen();
                    break;
                case 'recoverScreens':
                    await this._recoverScreens();
                    break;

                // Volume control
                case 'setVolume':
                    await this._setVolume(command.volume);
                    break;

                // Stop commands
                case 'stopAll':
                    await this._stopAll(command.fadeTime || 0);
                    break;
                case 'pauseAll':
                    await this._pauseAll();
                    break;
                case 'resumeAll':
                    await this._resumeAll();
                    break;

                // Browser/Clock commands
                case 'enableBrowser':
                    await this._enableBrowser(command.url);
                    break;
                case 'disableBrowser':
                    await this._disableBrowser();
                    break;
                case 'showBrowser':
                    await this._showBrowser();
                    break;
                case 'hideBrowser':
                    await this._hideBrowser();
                    break;
                case 'setBrowserUrl':
                    await this._setBrowserUrl(command.url);
                    break;
                case 'setBrowserKeepAlive':
                    await this._setBrowserKeepAlive(command.enabled);
                    break;
                case 'setZoneVolume':
                    await this._setZoneVolume(command.volume);
                    break;
                case 'restartPfx':
                    await this._restartPfx();
                    break;
                case 'getState':
                case 'getStatus':
                    this.publishStatus();
                    break;

                default:
                    throw new Error(`Unknown command: ${command.command}`);
            }
            this.publishCommandOutcome({
                command: command.command,
                outcome: 'success',
                parameters,
                message: `Command '${command.command}' executed successfully`
            });

        } catch (error) {
            this.logger.error(`Command failed: ${command.command}`, error);
            this.publishCommandOutcome({
                command: command.command,
                outcome: 'failed',
                parameters,
                error_type: 'execution_error',
                error_message: error.message,
                message: `Command '${command.command}' failed: ${error.message}`
            });
            throw error;
        }
    }

    getSupportedCommands() {
        return [
            'setImage',
            'playVideo', 'stopVideo', 'pauseVideo', 'resumeVideo', 'skipVideo',
            'videoQueue',
            'playAudio', 'playBackground', 'pauseBackground', 'resumeBackground', 'stopBackground',
            'playSpeech', 'pauseSpeech', 'resumeSpeech', 'skipSpeech', 'speechQueue', 'playAudioFX', 'playSoundEffect', 'stopAudio', 'stopSpeech',
            'sleepScreen', 'wakeScreen', 'recoverScreens',
            'reboot', 'shutdown', 'killPfx', 'restartPfx',
            'setVolume', 'setZoneVolume', 'getStatus', 'getState', 'stopAll', 'pauseAll', 'resumeAll',
            'enableBrowser', 'disableBrowser', 'showBrowser', 'hideBrowser', 'setBrowserUrl', 'setBrowserKeepAlive'
        ];
    }
    /** Publish the current video queue */
    async _videoQueue() {
        const queue = this.videoQueue.map(item => item.mediaPath);
        this.publishEvent({ video_queue: queue });
        this.publishStatus();
    }

    /** Publish the current speech queue */
    async _speechQueue() {
        const queue = (this.audioManager.speechQueue || []).map(item => item.filePath);
        this.publishEvent({ speech_queue: queue });
        this.publishStatus();
    }

    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        this.logger.info('Shutting down screen zone...');

        try {
            // Stop browser monitoring
            this._stopBrowserMonitoring();

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

    async _setImage(command) {
        const imagePath = command.file || command.image; // Support both 'file' and legacy 'image'
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
            await this.mpvZoneManager.loadMedia(fullPath);

            // Give MPV a moment to load the video, then pause it
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.mpvZoneManager.pause();

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
            await this.mpvZoneManager.loadMedia(fullPath);

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
            await this.mpvZoneManager.loadMedia(imagePath, 'image');

            this.currentState.currentImage = this.defaultImage;
            this.currentState.status = 'showing_image';
            this.mpvInstances.media.currentFile = this.defaultImage;

            this.logger.debug(`Default image set: ${this.defaultImage}`);
        } catch (error) {
            this.logger.warn(`Failed to set default image ${this.defaultImage}:`, error.message);
        }
    }

    async _playVideo(command) {
        const videoPath = command.file || command.video; // Support both 'file' and legacy 'video'
        const { volumeAdjust, channel, ducking } = command;
        if (!videoPath) {
            throw new Error('Video path is required');
        }

        // Wake screen early in the process to avoid timing conflicts
        await this.screenPowerManager.autoWakeForMedia('video');

        // Validate file exists before proceeding
        const fileValidation = await this._validateMediaFile(videoPath);
        if (!fileValidation.exists) {
            this.publishCommandOutcome({
                command: 'playVideo',
                outcome: 'failed',
                parameters: { file: videoPath },
                error_type: 'file_not_found',
                error_message: fileValidation.error,
                message: `Media file not found for playVideo: ${videoPath}`
            });
            this.logger.warn(fileValidation.error);
            return; // Don't update state if file doesn't exist
        }

        const fullPath = fileValidation.path;

        const isVideo = this._isVideoFile(videoPath);

        // Handle ducking parameter for video files - use zone config or default to -24 for videos, 0 for images
        const defaultVideoDucking = this.config.videoDucking !== undefined ? this.config.videoDucking : (isVideo ? -24 : 0);
        const duckingLevel = ducking !== undefined ? ducking : defaultVideoDucking;
        let duckId = null;

        if (isVideo && duckingLevel < 0) {
            // Generate unique duck ID for this video
            duckId = `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            this._applyDucking(duckId, duckingLevel);
            this.logger.info(`Applied ${duckingLevel} ducking for video: ${videoPath}`);
        }

        // Smart media handling: Check if we should resume existing media
        const shouldResume = this._shouldResumeExistingMedia(videoPath, 'playVideo');

        if (shouldResume) {
            this.logger.info(`🎬 Smart playVideo: Resuming paused video instead of reloading: ${videoPath}`);
            await this.mpvZoneManager.play();
            this.smartMediaState.lastCommand = 'playVideo';
            this.smartMediaState.isVideoPaused = false;
        } else {
            // Always load the new video, replacing any current one
            this.logger.info(`🎬 Smart playVideo: Loading and auto-playing video: ${videoPath}`);
            const options = {};
            if (volumeAdjust !== undefined) {
                const adjustedVolume = Math.max(0, Math.min(200, this.currentState.volume + volumeAdjust));
                options.volume = adjustedVolume;
            }
            // Stop any current playback (video or image)
            await this.mpvZoneManager.stop();
            // Load and play the new video (no playlisting)
            await this.mpvZoneManager.loadMedia(videoPath, 'video', options);
            await this.mpvZoneManager.play();
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

        // Store duck ID for cleanup when video ends
        if (duckId) {
            this.currentState.currentVideoDuckId = duckId;
        }

        // Update queue length from our application-level queue (not MPV playlist)
        this.currentState.videoQueueLength = this.videoQueue.length;

        this.publishStatus();
        this.publishEvent({
            video_started: videoPath,
            volume_adjust: volumeAdjust || 0,
            resumed: shouldResume,
            ducking_applied: duckingLevel,
            duck_id: duckId
        });

        this.logger.debug(`Video playing: ${videoPath} (${shouldResume ? 'resumed' : 'loaded'})`);
    }

    /**
     * Get current video queue length from zone manager
     * @private
     */
    async _getVideoQueueLength() {
        // For now, return 0 since we've reverted to simple implementation
        return 0;
    }

    /**
     * Normalize media path for comparison (handles relative vs absolute paths)
     * @private
     */
    _normalizeMediaPath(mediaPath) {
        if (!mediaPath) return '';

        const path = require('path');

        // If already absolute, return as-is
        if (path.isAbsolute(mediaPath)) {
            return path.resolve(mediaPath);
        }

        // If relative, resolve against media directory
        return path.resolve(this.zoneConfig.mediaDir, mediaPath);
    }

    async _stopVideo() {
        // Remove video ducking if active
        if (this.currentState.currentVideoDuckId) {
            this._removeDucking(this.currentState.currentVideoDuckId);
            this.currentState.currentVideoDuckId = null;
        }

        // stop playback and clear playlist
        await this.mpvZoneManager.stop();

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
        await this.mpvZoneManager.pause();
        this.currentState.status = 'video_paused';

        // Store pause timestamp for accurate resume timing
        this._pausedAt = Date.now();

        this._clearEofHandlers();
        this.publishStatus(); this.publishEvent({ video_paused: true });
    }

    async _resumeVideo() {
        await this.mpvZoneManager.play();
        this.currentState.status = 'playing_video';

        // Calculate remaining time for more accurate EOF detection
        let remainingDuration = null;
        if (this._pausedAt && this._videoStartedAt && this._originalDuration) {
            const playedTime = (this._pausedAt - this._videoStartedAt) / 1000;
            remainingDuration = Math.max(0.1, this._originalDuration - playedTime);
            this.logger.debug(`Resume EOF: played=${playedTime.toFixed(2)}s, remaining=${remainingDuration.toFixed(2)}s of ${this._originalDuration}s`);
        }

        // Re-setup EOF detection (with remaining time if available)
        await this._setupVideoEof(this.smartMediaState.currentLoadedPath, remainingDuration);

        // Clear pause timing
        this._pausedAt = null;

        this.publishStatus(); this.publishEvent({ video_resumed: true });
    }

    async _skipVideo() {
        const wasPaused = this.currentState.status === 'video_paused';
        // Try to skip to next playlist item; if none, stop video
        try {
            await this.mpvZoneManager.next();
        } catch (error) {
            this.logger.info('No next item in playlist, stopping video');
            await this._stopVideo();
            return;
        }
        // Preserve paused state if video was paused
        if (wasPaused) {
            // Give MPV a moment to load the next video, then pause it
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.mpvZoneManager.pause();
            this.currentState.status = 'video_paused';
        } else {
            this.currentState.status = 'playing_video';
        }

        this.publishStatus();
        this.publishEvent({ video_skipped: true, preserved_pause_state: wasPaused });
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
            const adjustedVolume = Math.max(0, Math.min(200, this.currentState.volume + volumeAdjust));
            options.volume = adjustedVolume;
        }

        await this.mpvZoneManager.loadMedia(fullPath, 'audio', options);

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

        // Check if audio manager processes are healthy
        const processRunning = await this.audioManager.checkAndRestartProcesses();
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

    async _stopBackgroundMusic(fadeTime = 0) {
        if (fadeTime > 0) {
            // Fade out over specified time, then stop
            const durationMs = fadeTime * 1000;
            const fadeResult = await this.audioManager.fadeBackgroundMusic(0, durationMs, async () => {
                await this.audioManager.stopBackgroundMusic();

                this.currentState.backgroundMusic = null;
                this.mpvInstances.background.currentFile = null;
                this.mpvInstances.background.status = 'idle';

                this.publishStatus();
                this.publishEvent({ background_music_stopped: true, fade_time: fadeTime });
                this.logger.info(`Background music stopped with ${fadeTime}s fade`);
            });

            if (!fadeResult.success) {
                this.logger.error('Failed to start background music fade:', fadeResult.error);
                // Fallback to immediate stop
                await this.audioManager.stopBackgroundMusic();
                this.currentState.backgroundMusic = null;
                this.mpvInstances.background.currentFile = null;
                this.mpvInstances.background.status = 'idle';
                this.publishStatus();
                this.publishEvent({ background_music_stopped: true });
                this.logger.info('Background music stopped immediately (fade failed)');
            }
        } else {
            // Immediate stop (existing behavior)
            await this.audioManager.stopBackgroundMusic();

            this.currentState.backgroundMusic = null;
            this.mpvInstances.background.currentFile = null;
            this.mpvInstances.background.status = 'idle';

            this.publishStatus();
            this.publishEvent({ background_music_stopped: true });
            this.logger.info('Background music stopped immediately');
        }
    }

    async _pauseBackgroundMusic() {
        await this.audioManager.pauseBackgroundMusic();

        this.mpvInstances.background.status = 'paused';

        this.publishStatus();
        this.publishEvent({ background_music_paused: true });
        this.logger.info('Background music paused');
    }

    async _resumeBackgroundMusic() {
        await this.audioManager.resumeBackgroundMusic();

        this.mpvInstances.background.status = 'playing';

        this.publishStatus();
        this.publishEvent({ background_music_resumed: true });
        this.logger.info('Background music resumed');
    }

    async _playSpeech(audioPath, volume, ducking) {
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

        // Check if audio manager processes are healthy
        const processRunning = await this.audioManager.checkAndRestartProcesses();
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

        // Handle ducking parameter - use zone config or default to -26 if not specified
        const defaultSpeechDucking = this.config.speechDucking !== undefined ? this.config.speechDucking : -26;
        const duckingLevel = ducking !== undefined ? ducking : defaultSpeechDucking;

        this.logger.info(`Playing speech: ${audioPath} at volume ${targetVolume} with ${duckingLevel} ducking`);

        // Generate unique duck ID for this speech
        const duckId = `speech-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Apply ducking if level is negative
        if (duckingLevel < 0) {
            this._applyDucking(duckId, duckingLevel);
        }

        await this.audioManager.playSpeech(fullPath, {
            volume: targetVolume,
            duckVolume: this.audioManager.duckingVolume
        });

        // Set up auto-unduck when speech completes
        if (duckingLevel > 0) {
            setTimeout(() => {
                this.logger.debug(`Auto-removing ducking for speech: ${duckId}`);
                this._removeDucking(duckId);
                this.mpvInstances.speech.status = 'idle';
                this.publishStatus();
            }, 5000); // 5 second timeout - should be replaced with actual speech end detection
        }

        this.mpvInstances.speech.status = 'playing';

        this.publishStatus();
        this.publishEvent({
            speech_started: audioPath,
            volume: targetVolume,
            ducking_applied: duckingLevel,
            duck_id: duckId
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

    async _stopAudio(fadeTime = 0) {
        // Stop background music with fade if specified
        await this._stopBackgroundMusic(fadeTime);

        // Clear speech queue (immediate - speech should stop quickly)
        await this.audioManager.clearSpeechQueue();

        this.publishEvent({ all_audio_stopped: true, fade_time: fadeTime });
        this.logger.info(`All audio stopped${fadeTime > 0 ? ` with ${fadeTime}s fade` : ' immediately'}`);
    }

    async _stopSpeech(fadeTime = 0) {
        if (fadeTime > 0) {
            // Fade out speech over specified time, then stop
            const durationMs = fadeTime * 1000;
            const fadeResult = await this.audioManager.fadeSpeech(0, durationMs, async () => {
                await this.audioManager.clearSpeechQueue();
                this.publishEvent({ speech_stopped: true, fade_time: fadeTime });
                this.logger.info(`Speech stopped with ${fadeTime}s fade`);
            });

            if (!fadeResult.success) {
                this.logger.error('Failed to start speech fade:', fadeResult.error);
                // Fallback to immediate stop
                await this.audioManager.clearSpeechQueue();
                this.publishEvent({ speech_stopped: true });
                this.logger.info('Speech stopped immediately (fade failed)');
            }
        } else {
            // Immediate stop
            await this.audioManager.clearSpeechQueue();
            this.publishEvent({ speech_stopped: true });
            this.logger.info('Speech stopped immediately');
        }
    }

    async _sleepScreen() {
        // Ignore sleep commands while video is actively playing
        if (this.currentState.status === 'playing_video') {
            this.logger.info('Sleep command ignored: video is actively playing');
            this.publishEvent({
                screen_sleep: false,
                ignored: true,
                reason: 'video_playing'
            });
            return;
        }

        // Sleep only the target monitor
        await this.screenPowerManager.sleepMonitor(this.targetMonitor);

        this.currentState.screenAwake = false;
        this.currentState.status = 'screen_asleep';

        this.publishStatus();
        this.publishEvent({ screen_sleep: true });
        this.logger.info('Screen put to sleep');
    }

    async _wakeScreen() {
        // Wake only the target monitor
        await this.screenPowerManager.wakeMonitor(this.targetMonitor);

        // Restore default image if no media is currently playing
        if (!this.currentState.currentVideo && !this.currentState.currentAudio) {
            await this._setDefaultImage();
        }

        this.currentState.screenAwake = true;

        this.publishStatus();
        this.publishEvent({ screen_wake: true });
        this.logger.info('Screen woken up');
    }

    async _recoverScreens() {
        this.logger.info('Recovering all screens via screen power manager');
        await this.screenPowerManager.recoverAllMonitors();

        // Restore default image if no media is currently playing
        if (!this.currentState.currentVideo && !this.currentState.currentAudio) {
            await this._setDefaultImage();
        }

        this.currentState.screenAwake = true;

        this.publishStatus();
        this.publishEvent({ screens_recovered: true });
        this.logger.info('Screens recovered');
    }

    async _setVolume(volume) {
        if (volume === undefined || volume < 0 || volume > 200) {
            throw new Error('Volume must be between 0 and 200');
        }

        this.currentState.volume = volume;

        // Set volume on audio manager
        await this.audioManager.setBackgroundMusicVolume(volume);

        this.publishStatus();
        this.publishEvent({ volume_changed: volume });
        this.logger.info(`Volume set to: ${volume}`);
    }

    async _setZoneVolume(volume) {
        if (volume === undefined || volume < 0 || volume > 200) {
            throw new Error('Zone volume must be between 0 and 200');
        }

        this.logger.info(`Setting zone master volume to: ${volume}`);

        // Apply volume to all MPV instances in this zone
        const promises = [];

        // Set volume on MPV zone manager (for media/video)
        if (this.mpvZoneManager) {
            promises.push(this.mpvZoneManager.setVolume(volume));
        }

        // Set volume on audio manager (background music, speech, effects)
        if (this.audioManager) {
            promises.push(this.audioManager.setBackgroundMusicVolume(volume));
        }

        await Promise.all(promises);

        // Update zone state
        this.currentState.zoneVolume = volume;

        this.publishStatus();
        this.publishEvent({ zone_volume_changed: volume });
        this.logger.info(`Zone master volume set to: ${volume}`);
    }

    async _restartPfx() {
        this.logger.info('Restarting PFX: executing cleanup and restart sequence...');

        try {
            // Execute cleanup logic (similar to cleanup.sh script)
            await this._executeCleanupSequence();

            // Restart the PFX process
            this.publishEvent({ pfx_restart_initiated: true });
            this.logger.info('PFX restart initiated - terminating current process for restart');

            // Give a moment for the message to be published
            setTimeout(() => {
                process.exit(0); // Exit cleanly to allow restart by process manager
            }, 1000);

        } catch (error) {
            this.logger.error('PFX restart failed:', error);
            this.publishError('PFX restart failed', { error: error.message });
            throw error;
        }
    }

    async _executeCleanupSequence() {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        this.logger.info('Executing cleanup sequence...');

        try {
            // 1. Kill MPV processes
            this.logger.debug('Killing MPV processes...');
            try {
                await execAsync('pkill mpv || true');
                await new Promise(resolve => setTimeout(resolve, 2000));
                await execAsync('pkill -9 mpv || true'); // Force kill any remaining
            } catch (err) {
                this.logger.debug('MPV cleanup completed:', err.message);
            }

            // 2. Clean up socket files
            this.logger.debug('Cleaning up socket files...');
            try {
                await execAsync('rm -f /tmp/mpv-*.sock /tmp/pfx-*.sock');
            } catch (err) {
                this.logger.debug('Socket cleanup completed:', err.message);
            }

            // 3. Clean up PulseAudio combined sinks
            this.logger.debug('Cleaning up PulseAudio combined sinks...');
            try {
                const { stdout } = await execAsync('pactl list short sinks | grep "paradox_dual_output" || true');
                if (stdout.trim()) {
                    await execAsync('pactl unload-module module-combine-sink || true');
                }
            } catch (err) {
                this.logger.debug('PulseAudio cleanup completed:', err.message);
            }

            // 4. Kill Chromium processes
            this.logger.debug('Killing Chromium processes...');
            try {
                await execAsync('pkill chromium || true');
                await new Promise(resolve => setTimeout(resolve, 2000));
                await execAsync('pkill -9 chromium || true'); // Force kill any remaining
            } catch (err) {
                this.logger.debug('Chromium cleanup completed:', err.message);
            }

            this.logger.info('Cleanup sequence completed successfully');

        } catch (error) {
            this.logger.error('Cleanup sequence failed:', error);
            throw error;
        }
    }

    async _stopAll(fadeTime = 0) {
        // Stop video (immediate - no fade for video as requested)
        if (this.currentState.currentVideo) {
            await this._stopVideo();
        }

        // Stop all audio with fade if specified
        await this._stopAudio(fadeTime);

        // Return to default image
        await this._setDefaultImage();

        this.currentState.status = 'idle';
        this.publishStatus();
        this.publishEvent({ all_media_stopped: true, fade_time: fadeTime });
        this.logger.debug(`All media stopped${fadeTime > 0 ? ` with ${fadeTime}s fade` : ' immediately'}`);
    }

    async _pauseAll() {
        // Pause video if playing
        if (this.currentState.status === 'playing_video') {
            await this._pauseVideo();
        }

        // Pause audio manager (background music and speech)
        await this.audioManager.pauseAll();

        this.publishEvent({ all_media_paused: true });
        this.logger.debug('All media paused');
    }

    async _resumeAll() {
        // Resume video if paused
        if (this.currentState.status === 'video_paused') {
            await this._resumeVideo();
        }

        // Resume audio manager (background music and speech)
        await this.audioManager.resumeAll();

        this.publishEvent({ all_media_resumed: true });
        this.logger.debug('All media resumed');
    }

    // ========================================================================
    // VIDEO QUEUE MANAGEMENT
    // ========================================================================

    /**
     * Enqueue a playVideo or setImage command with advanced deduplication/replacement logic
     */
    async _enqueueVideoCommand(command) {
        const { command: type } = command;
        // Support both 'file' and legacy field names
        const mediaPath = command.file || command.video || command.image;
        const mediaType = this._isVideoFile(mediaPath) ? 'video' : 'image';

        this.logger.debug(`Enqueue command: ${type} ${mediaPath}. Queue before: ${this.videoQueue.length}`);

        // Enhanced duplicate detection
        // 1. Ignore duplicate playVideo if the same video is already playing
        if (type === 'playVideo' && this.currentState.currentVideo === mediaPath && this.currentState.status === 'playing_video') {
            this.logger.debug(`Ignoring duplicate playVideo for currently playing video: ${mediaPath}`);
            return;
        }

        // 2. Ignore if identical command already exists anywhere in the queue
        const existingInQueue = this.videoQueue.find(item =>
            item.type === type && item.mediaPath === mediaPath
        );
        if (existingInQueue) {
            this.logger.debug(`Ignoring duplicate ${type} command - already in queue: ${mediaPath}`);
            return;
        }

        // Replacement logic
        // Replacement logic: only replace explicit setImage commands (static visuals)
        if (this.videoQueue.length > 0) {
            const last = this.videoQueue[this.videoQueue.length - 1];
            const lastIsSetImage = last.type === 'setImage';
            if (lastIsSetImage) {
                this.logger.debug('Replacing last setImage command in queue');
                this.videoQueue[this.videoQueue.length - 1] = { type, mediaPath, mediaType, command };
                this.currentState.videoQueueLength = this.videoQueue.length;
                this.publishStatus();
                if (!this.isProcessingVideoQueue) this._processVideoQueue();
                return;
            }
        }

        // Otherwise, add to end of queue
        this.videoQueue.push({ type, mediaPath, mediaType, command });
        this.logger.debug(`Queue after enqueue: ${this.videoQueue.length}`);
        // If queue is full, drop oldest
        const max = this.zoneConfig.videoQueueMax || 5;
        if (this.videoQueue.length > max) {
            this.logger.debug('Video queue full, dropping oldest item');
            this.videoQueue.shift();
        }
        this.currentState.videoQueueLength = this.videoQueue.length;
        this.publishStatus();
        if (!this.isProcessingVideoQueue) this._processVideoQueue();
    }

    /**
     * Process the video/image queue (one at a time)
     */
    async _processVideoQueue() {
        this.logger.debug(`_processVideoQueue called. isProcessing=${this.isProcessingVideoQueue}, queueLength=${this.videoQueue.length}`);
        if (this.isProcessingVideoQueue || this.videoQueue.length === 0) return;
        // Remove the blocking status check - queue should process even when video is playing
        // The isProcessingVideoQueue flag and EOF handling provide proper sequencing
        this.isProcessingVideoQueue = true;

        const { type, mediaPath, mediaType, command } = this.videoQueue.shift();
        this.logger.debug(`Dequeued item: ${type} ${mediaPath}. Remaining queue: ${this.videoQueue.length}`);
        this.currentState.videoQueueLength = this.videoQueue.length;
        this.publishStatus();
        try {
            if (type === 'setImage') {
                await this._handleSetImageQueue(mediaPath, mediaType, command);
                // Images and paused videos: immediately process next item
                if (mediaType === 'image' || (mediaType === 'video' && command.command === 'setImage')) {
                    this.isProcessingVideoQueue = false;
                    // Recursively process next item if any
                    if (this.videoQueue.length > 0) this._processVideoQueue();
                    return;
                }
            }
            if (type === 'playVideo') {
                await this._handlePlayVideoQueue(mediaPath, mediaType, command);
                // For video files, wait for EOF (simulated or real) before continuing
                if (mediaType === 'video') {
                    // EOF detection set up; _handleMediaEnd() will resume the queue
                    return;
                } else {
                    // For images, just display and continue
                    this.isProcessingVideoQueue = false;
                    if (this.videoQueue.length > 0) this._processVideoQueue();
                    return;
                }
            }
        } catch (err) {
            this.logger.error('Error processing video/image queue:', err);

            // Clean up any incomplete ducking operations
            if (this.currentState.currentVideoDuckId) {
                this._removeDucking(this.currentState.currentVideoDuckId);
                this.currentState.currentVideoDuckId = null;
            }

            // Continue to next item
            this.isProcessingVideoQueue = false;
            if (this.videoQueue.length > 0) {
                // Add small delay before retrying to prevent rapid failure loops
                setTimeout(() => this._processVideoQueue(), 1000);
            }
        }
    }

    /**
     * Handle setImage command in queue
     */
    async _handleSetImageQueue(mediaPath, mediaType, command) {
        if (mediaType === 'image') {
            // Display image
            await this._setImage({ file: mediaPath });
        } else {
            // Video file: load and pause on first frame
            await this._setImage({ file: mediaPath });
        }
    }

    /**
     * Handle playVideo command in queue
     */
    async _handlePlayVideoQueue(mediaPath, mediaType, command) {
        if (mediaType === 'image') {
            await this._playVideo({ file: mediaPath });
        } else {
            const fullPath = mediaPath;
            await this._playVideo({ file: fullPath });
            await this._setupVideoEof(fullPath);
        }
    }

    /**
     * Start a simulated EOF timer for a video file
     * @param {string} mediaPath - Path to the video file
     * @param {number|null} remainingDuration - Optional remaining duration in seconds (for resume)
     */
    async _setupVideoEof(mediaPath, remainingDuration = null) {
        // clear existing handlers
        this._clearEofHandlers();

        // Record when video starts (only for new videos, not resume)
        if (remainingDuration === null) {
            this._videoStartedAt = Date.now();
        }

        // gather frame count if available
        let frames = null;
        try {
            frames = await this.mpvZoneManager.getProperty('estimated-frame-count');
        } catch {
            // property not available or unsupported
            frames = null;
        }

        let duration;
        let usedProbe = false;

        // Use provided remaining duration if available, otherwise determine full duration
        if (remainingDuration !== null) {
            duration = remainingDuration;
            this.logger.debug(`Using remaining duration: ${duration}s`);
        } else {
            // determine duration via mpv or ffprobe
            duration = this._videoEofCache.get(mediaPath);
            if (duration === undefined) {
                try {
                    duration = await this.mpvZoneManager.getDuration();
                } catch {
                    try {
                        duration = await this._probeDuration(mediaPath);
                        usedProbe = true;
                        this._videoEofCache.set(mediaPath, duration);
                    } catch (err) {
                        this.logger.warn(`Could not determine video duration: ${err.message}`);
                        duration = null;
                    }
                }
                if (duration != null) {
                    this._videoEofCache.set(mediaPath, duration);
                    // Store original duration for pause/resume calculations
                    this._originalDuration = duration;
                }
            } else {
                // Use cached duration and store as original
                this._originalDuration = duration;
            }
        }
        if (duration != null) {
            // log duration-based EOF detection
            const durationLabel = remainingDuration !== null ? 'remaining time' : (usedProbe ? 'ffprobe fallback' : 'mpv duration');
            this.logger.info(`EOF detection: ${durationLabel} (${duration}s${frames != null ? `, frames=${frames}` : ''})`);
            const timeoutMs = Math.max(0, duration * 1000);
            this._videoEofTimeout = setTimeout(() => {
                this.logger.debug('Video EOF timeout fired (duration-based)');
                this._handleMediaEnd();
            }, timeoutMs);
        } else {
            // log polling-based EOF detection
            this.logger.info(`EOF detection: playback-time polling (tick=50ms, epsilon=100ms)${frames != null ? `, frames=${frames}` : ''}`);
            // fallback to playback-time observer at 50ms tick
            this._observerId = await this.mpvZoneManager.observeProperty('playback-time');
            this.mpvZoneManager.on('property-playback-time', ev => this._onPlaybackTime(ev));
        }
    }

    async _probeDuration(mediaPath) {
        const { spawn } = require('child_process');
        const probePath = this._normalizeMediaPath(mediaPath);
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                probePath
            ]);
            let output = '';
            let errOutput = '';
            ffprobe.stdout.on('data', data => output += data);
            ffprobe.stderr.on('data', data => errOutput += data);
            ffprobe.on('close', code => {
                if (code === 0) {
                    const dur = parseFloat(output.trim());
                    if (!isNaN(dur)) {
                        resolve(dur);
                    } else {
                        reject(new Error(`ffprobe returned invalid duration for ${probePath}: ${output.trim()}`));
                    }
                } else {
                    reject(new Error(`ffprobe exited with code ${code} on ${probePath}: ${errOutput.trim()}`));
                }
            });
        });
    }

    _clearEofHandlers() {
        if (this._videoEofTimeout) {
            clearTimeout(this._videoEofTimeout);
            this._videoEofTimeout = null;
        }
        if (this._observerId != null) {
            this.mpvZoneManager.unobserveProperty(this._observerId);
            this._observerId = null;
        }
        this._lastPlaybackTime = 0;
        this._stallCount = 0;
    }

    _onPlaybackTime(event) {
        const time = event.data;
        if (time === this._lastPlaybackTime) {
            this._stallCount++;
        } else {
            this._stallCount = 0;
            this._lastPlaybackTime = time;
        }
        // two consecutive stalls (~100ms) => EOF
        if (this._stallCount >= 2) {
            this.logger.debug('Playback-time stalled, assuming EOF');
            this._handleMediaEnd();
        }
    }

    /**
     * Handle end of file (real or simulated)
     */
    _handleMediaEnd() {
        this.logger.debug('Video EOF triggered (duration-based timeout). Queue length: ' + this.videoQueue.length);

        // Capture current video file before clearing state for event publishing
        const completedVideoFile = this.currentState.currentVideo;

        // Remove video ducking if active
        if (this.currentState.currentVideoDuckId) {
            this._removeDucking(this.currentState.currentVideoDuckId);
            this.currentState.currentVideoDuckId = null;
            this.logger.debug('Removed video ducking on media end');
        }

        // Update state to idle
        this.currentState.currentVideo = null;
        this.currentState.currentImage = null;
        this.currentState.status = 'idle';

        // Publish video completion event if a video was playing
        if (completedVideoFile) {
            const path = require('path');
            const filename = path.basename(completedVideoFile);

            this.publishEvent({
                type: 'video',
                state: 'ended',
                file: filename
            });

            this.logger.info(`📺 Published video completion event for: ${filename}`);
        }

        // Clear any EOF detection handlers
        this._clearEofHandlers();

        // Clear timing state
        this._videoStartedAt = null;
        this._pausedAt = null;

        // Allow queue processing to continue
        this.isProcessingVideoQueue = false;
        // Only schedule next when idle, mimic original behavior
        if (this.videoQueue.length > 0) {
            setTimeout(() => this._processVideoQueue(), 100);
        }
        this.publishStatus();
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

    /**
     * Set background volume (implementation for base class)
     * @param {number} volume - Volume level (0-200)
     * @protected
     */
    _setBackgroundVolume(volume) {
        if (this.audioManager) {
            this.audioManager.setBackgroundMusicVolume(volume);
        }
    }

    /**
     * Get current background volume (implementation for base class)
     * @returns {number} Current background volume (0-200)
     * @protected
     */
    _getCurrentBackgroundVolume() {
        return this.currentState.volume || 80;
    }

    /**
     * Check and restart MPV process if needed (deprecated)
     * @deprecated Use audioManager.checkAndRestartProcesses() instead
     */
    _checkAndRestartMpvProcess(type) {
        this.logger.warn(`_checkAndRestartMpvProcess is deprecated. Use audioManager.checkAndRestartProcesses() instead.`);
        return this.audioManager.checkAndRestartProcesses();
    }

    /**
     * Validate that a media file exists and return its full path
     * @private
     */
    async _validateMediaFile(mediaPath) {
        if (!mediaPath) {
            return { exists: false, path: null, error: 'Media path is empty' };
        }

        const fullPath = this.audioManager.resolveMediaPath(mediaPath);
        const fs = require('fs');

        if (!fs.existsSync(fullPath)) {
            return { exists: false, path: fullPath, error: `Media file not found: ${fullPath}` };
        }

        return { exists: true, path: fullPath, error: null };
    }

    // ========================================================================
    // BROWSER MANAGEMENT METHODS
    // ========================================================================
    // NOTE: Current implementation has a limitation when multiple screens
    // run an enabled browser concurrently. Window detection heuristics may
    // select the wrong Chromium window when several instances are present.
    // Workaround: enable browser on only one screen at a time. Future work
    // should add per-zone PID->window-id mapping to reliably disambiguate windows.

    /**
     * Enable browser: Launch Chromium in background (hidden behind MPV)
     */
    async _enableBrowser(url = 'http://localhost/clock/') {
        if (this.browserManager.enabled) {
            this.logger.warn('Browser already enabled');
            return;
        }

        this.logger.info(`Enabling browser with URL: ${url} (background launch)`);

        // Clean up any existing browser artifacts
        this.windowManager.safeRemoveDir(this.browserManager.profilePath);

        // Determine target display. Prefer explicit targetMonitor from zone config.
        let targetDisplay;
        try {
            const displays = this.windowManager.getDisplays() || [];
            // Sort displays by X position for deterministic indexing
            displays.sort((a, b) => (a.x || 0) - (b.x || 0));
            if (Array.isArray(displays) && displays.length > 0 && Number.isInteger(this.targetMonitor) && this.targetMonitor >= 0 && this.targetMonitor < displays.length) {
                targetDisplay = displays[this.targetMonitor];
                this.logger.debug(`Browser target display chosen by targetMonitor ${this.targetMonitor}: ${targetDisplay.name} at ${targetDisplay.width}x${targetDisplay.height}+${targetDisplay.x}+${targetDisplay.y}`);
            } else {
                // Fallback to previous selection logic (prefer secondary)
                targetDisplay = this.windowManager.pickTargetDisplay(true);
                if (targetDisplay) this.logger.debug(`Browser target display (fallback): ${targetDisplay.name} at ${targetDisplay.width}x${targetDisplay.height}+${targetDisplay.x}+${targetDisplay.y}`);
            }
        } catch (err) {
            this.logger.warn('Failed to determine target display by index, falling back to pickTargetDisplay: ' + err.message);
            targetDisplay = this.windowManager.pickTargetDisplay(true);
        }

        // Launch browser
        const browserOptions = {
            url,
            profilePath: this.browserManager.profilePath,
            className: this.browserManager.className,
            width: targetDisplay.width,
            height: targetDisplay.height,
            x: targetDisplay.x,
            y: targetDisplay.y
        };

        this.browserManager.process = this.windowManager.launchChromium(browserOptions);
        this.browserManager.url = url;
        this.browserManager.enabled = true;

        // Wait for browser window to appear
        this.browserManager.windowId = await this.windowManager.waitForWindowByClass(
            this.browserManager.className,
            5000
        );

        if (!this.browserManager.windowId) {
            // Fallback detection
            // Try a few short retries to allow the window to appear
            for (let attempt = 1; attempt <= 3 && !this.browserManager.windowId; attempt++) {
                this.logger.debug(`enableBrowser: fallback attempt ${attempt} to find Chromium window`);
                this.browserManager.windowId = this.windowManager.findChromiumWindowId(this.browserManager.className);
                if (!this.browserManager.windowId) await new Promise(r => setTimeout(r, 300));
            }
            if (!this.browserManager.windowId) this.browserManager.windowId = this.windowManager.findChromiumWindowId(this.browserManager.className);
        }

        this.logger.info(`enableBrowser result: pid=${this.browserManager.process?.pid || 'unknown'}, windowId=${this.browserManager.windowId || 'not-found'}`);

        // If we have a detected window id, cross-check with a fresh search and log if it changed
        if (this.browserManager.windowId) {
            try {
                const found = this.windowManager.findChromiumWindowId(this.browserManager.className);
                if (found && found !== this.browserManager.windowId) {
                    this.logger.warn(`enableBrowser: detected chromium windowId changed (stored=${this.browserManager.windowId} detected=${found}), updating stored id`);
                    this.browserManager.windowId = found;
                }
            } catch (err) {
                this.logger.debug('enableBrowser: cross-check findChromiumWindowId failed: ' + err.message);
            }
        }

        if (this.browserManager.windowId) {
            // Position and configure window BUT KEEP HIDDEN
            this.windowManager.moveWindow(this.browserManager.windowId, targetDisplay.x, targetDisplay.y);
            this.windowManager.fullscreenWindow(this.browserManager.windowId);

            const desk = this.windowManager.getActiveDesktop();
            this.windowManager.moveToDesktop(this.browserManager.windowId, desk);

            // ALWAYS start browser behind MPV (background launch)
            this.windowManager.addWindowState(this.browserManager.windowId, 'below');

            // CRITICAL: Ensure MPV regains focus after browser window creation
            const mpvWindow = this.windowManager.getWindowIdByNameExact('ParadoxMPV');
            if (mpvWindow) {
                this.windowManager.activateWindow(mpvWindow);
                this.logger.debug('MPV window reactivated after browser launch');
            } else {
                this.logger.warn('MPV window not found - browser may be visible');
            }
        } else {
            this.logger.warn('Browser window not found after launch');
        }

        // Update state (browser starts hidden)
        this.currentState.focus = 'mpv'; // MPV remains focused
        this.currentState.content = this.currentState.currentVideo || this.currentState.currentImage;
        this._updateFocusAndContent();

        this.publishStatus();
        this.publishEvent({
            browser_enabled: true,
            url,
            window_id: this.browserManager.windowId,
            focused: false // Always false - browser starts hidden
        });

        this.logger.info('Browser enabled successfully (hidden in background)');
    }

    /**
     * Disable browser: Terminate browser process and clean up
     */
    async _disableBrowser() {
        if (!this.browserManager.enabled) {
            this.logger.warn('Browser not enabled');
            return;
        }

        this.logger.info(`Disabling browser (stored windowId=${this.browserManager.windowId || 'none'}, pid=${this.browserManager.process?.pid || 'unknown'})`);

        // Kill browser process
        if (this.browserManager.process) {
            await this.windowManager.killProcess(this.browserManager.process);
        }

        // Clean up artifacts
        this.windowManager.safeRemoveDir(this.browserManager.profilePath);

        // Reset state
        this.logger.info(`disableBrowser: killed process, clearing stored window id (was=${this.browserManager.windowId || 'none'})`);
        this.browserManager.process = null;
        this.browserManager.windowId = null;
        this.browserManager.url = null;
        this.browserManager.enabled = false;

        // Update focus back to MPV
        this.currentState.focus = 'mpv';
        this.currentState.content = this.currentState.currentVideo || this.currentState.currentImage;

        this.publishStatus();
        this.publishEvent({ browser_disabled: true });

        this.logger.info('Browser disabled successfully');
    }

    /**
     * Show browser: Pure window management - bring browser to front
     */
    async _showBrowser() {
        if (!this.browserManager.enabled) {
            throw new Error('Browser not enabled. Call enableBrowser first.');
        }

        if (!this.browserManager.windowId) {
            throw new Error('Browser window not found');
        }

        this.logger.info(`Showing browser (pure window management) - Window ID: ${this.browserManager.windowId}`);

        // Lightweight debug instrumentation: record timestamps, window ids and results
        const tsStart = Date.now();
        const browserWin = this.browserManager.windowId;
        let mpvWindow = null;
        try {
            mpvWindow = this.windowManager.getWindowIdByNameExact('ParadoxMPV');
        } catch (err) {
            this.logger.debug('getWindowIdByNameExact threw when checking MPV window:', err.message);
        }

        this.logger.debug(`_showBrowser start ts=${tsStart}, browserWin=${browserWin}, mpvWindow=${mpvWindow}, DISPLAY=${process.env.DISPLAY || 'unset'}`);

        // Refresh stored Chromium window id in case it changed since enableBrowser
        try {
            const fresh = this.windowManager.findChromiumWindowId(this.browserManager.className);
            if (fresh && fresh !== browserWin) {
                this.logger.warn(`_showBrowser: stored browser windowId=${browserWin} is stale, updating to fresh id=${fresh}`);
                this.browserManager.windowId = fresh;
            }
        } catch (err) {
            this.logger.debug(`_showBrowser: findChromiumWindowId threw: ${err.message}`);
        }

        // refresh local variable after possible update
        const browserWinRefreshed = this.browserManager.windowId || browserWin;
        if (browserWinRefreshed !== browserWin) {
            this.logger.debug(`_showBrowser: using browser window id ${browserWinRefreshed} for activation`);
        }

        // Attempt to force browser above MPV. Some MPV instances run with --ontop
        // which keeps them above other windows; try to counter that by setting
        // the browser to 'above' and removing 'above' from MPV before activating.
        try {
            let t0 = Date.now();
            try {
                const res = this.windowManager.addWindowState(browserWin, 'above');
                this.logger.debug(`addWindowState(browser,above) succeeded in ${Date.now() - t0}ms, result=${String(res)}`);
            } catch (errAdd) {
                this.logger.warn(`addWindowState(browser,above) failed: ${errAdd.message}`);
            }

            // Try to unset 'above' on MPV windows to avoid ontop conflicts
            if (mpvWindow) {
                try {
                    t0 = Date.now();
                    const resRem = this.windowManager.removeWindowState(mpvWindow, 'above');
                    this.logger.debug(`removeWindowState(mpv,above) succeeded in ${Date.now() - t0}ms, result=${String(resRem)}`);
                } catch (errRem) {
                    this.logger.warn(`removeWindowState(mpv,above) failed for ${mpvWindow}: ${errRem.message}`);
                }
            } else {
                this.logger.debug('No MPV window id found prior to activate()');
            }

            // Pure window focus switching using Option 6 technique
            try {
                t0 = Date.now();
                const resAct = this.windowManager.activateWindow(browserWin);
                this.logger.debug(`activateWindow(browser) completed in ${Date.now() - t0}ms, result=${String(resAct)}`);
            } catch (errAct) {
                this.logger.warn(`activateWindow(browser) failed: ${errAct.message}`);
            }

            // Verify the browser actually became active. If not, retry and fall back to wmctrl.
            let becameActive = false;
            try {
                becameActive = this.windowManager.isWindowActive(browserWin);
            } catch (err) {
                this.logger.debug('isWindowActive check threw: ' + err.message);
                becameActive = false;
            }

            if (!becameActive) {
                this.logger.warn('Browser did not appear active after first activate(), attempting retries and wmctrl fallback');
                for (let attempt = 1; attempt <= 3 && !becameActive; attempt++) {
                    try {
                        await new Promise(r => setTimeout(r, attempt * 120));
                        const t1 = Date.now();
                        try { this.windowManager.activateWindow(browserWin); } catch (e) { this.logger.debug(`retry activateWindow attempt ${attempt} failed: ${e.message}`); }
                        this.logger.debug(`retry activateWindow attempt ${attempt} took ${Date.now() - t1}ms`);

                        // try wmctrl fallback
                        if (this.windowManager.wmctrlActivate) {
                            try {
                                const t2 = Date.now();
                                this.windowManager.wmctrlActivate(browserWin);
                                this.logger.debug(`wmctrlActivate fallback attempt ${attempt} took ${Date.now() - t2}ms`);
                            } catch (e) {
                                this.logger.debug(`wmctrlActivate attempt ${attempt} failed: ${e.message}`);
                            }
                        }

                        // re-check
                        try {
                            becameActive = this.windowManager.isWindowActive(browserWin);
                        } catch (err) { becameActive = false; }
                        if (becameActive) this.logger.info(`Browser became active on attempt ${attempt}`);
                    } catch (errLoop) {
                        this.logger.debug(`retry loop error: ${errLoop.message}`);
                    }
                }
            }

            if (!becameActive) {
                // Capture additional diagnostics: wmctrl list and xdotool search output
                try {
                    const wmOut = execSync('wmctrl -lG', { env: { ...process.env, DISPLAY: this.display } }).toString().trim();
                    this.logger.debug('wmctrl -lG output:\n' + wmOut);
                } catch (e) {
                    this.logger.debug('Failed to run wmctrl -lG: ' + e.message);
                }
                try {
                    const wmPid = execSync('wmctrl -lp', { env: { ...process.env, DISPLAY: this.display } }).toString().trim();
                    this.logger.debug('wmctrl -lp output:\n' + wmPid);
                } catch (e) {
                    this.logger.debug('Failed to run wmctrl -lp: ' + e.message);
                }
                try {
                    const xd = execSync(`xdotool search --class ${this.browserManager.className} || true`, { env: { ...process.env, DISPLAY: this.display } }).toString().trim();
                    this.logger.debug(`xdotool search --class ${this.browserManager.className} output: ${xd}`);
                } catch (e) {
                    this.logger.debug('xdotool search failed: ' + e.message);
                }

                // Aggressive fallback: try to find any ParadoxBrowser windows and force-map/raise/focus them
                try {
                    const targetPid = this.browserManager.process?.pid || null;
                    // If we have a browser PID, try to find the window associated with that PID first
                    if (targetPid) {
                        try {
                            const wmPidOut = execSync('wmctrl -lp', { env: { ...process.env, DISPLAY: this.display } }).toString();
                            const lines = wmPidOut.split('\n');
                            for (const line of lines) {
                                const m = line.trim().match(/^(0x[0-9a-fA-F]+)\s+\S+\s+(\d+)/);
                                if (m && parseInt(m[2], 10) === targetPid) {
                                    const hexId = m[1];
                                    this.logger.info(`Aggressive fallback: found window ${hexId} for browser PID ${targetPid}, trying to unhide/raise`);
                                    try { execSync(`xdotool windowmap ${hexId}`, { env: { ...process.env, DISPLAY: this.display } }); } catch (_) { }
                                    try { execSync(`xdotool windowraise ${hexId}`, { env: { ...process.env, DISPLAY: this.display } }); } catch (_) { }
                                    try { execSync(`xdotool windowfocus ${hexId}`, { env: { ...process.env, DISPLAY: this.display } }); } catch (_) { }
                                    try { execSync(`wmctrl -i -a ${hexId}`, { env: { ...process.env, DISPLAY: this.display } }); } catch (_) { }
                                    await new Promise(r => setTimeout(r, 120));
                                    try { if (this.windowManager.isWindowActive(hexId)) { becameActive = true; this.browserManager.windowId = hexId; this.logger.info(`Aggressive fallback: browser active via PID matched window ${hexId}`); } } catch (_) { }
                                    if (becameActive) break;
                                }
                            }
                        } catch (e) {
                            this.logger.debug('Aggressive fallback wmctrl -lp parse failed: ' + e.message);
                        }
                    }

                    if (!becameActive) {
                        const raw = execSync(`xdotool search --class ${this.browserManager.className} || true`, { env: { ...process.env, DISPLAY: this.display } }).toString().trim();
                        const ids = raw.split('\n').map(s => s.trim()).filter(Boolean);
                        if (ids.length === 0) {
                            this.logger.debug('Aggressive fallback: no ParadoxBrowser windows found to try');
                        }
                        for (const id of ids) {
                            this.logger.info(`Aggressive fallback: attempting to unhide/raise/focus window ${id}`);
                            try { execSync(`xdotool windowmap ${id}`, { env: { ...process.env, DISPLAY: this.display } }); } catch (e) { this.logger.debug(`windowmap ${id} failed: ${e.message}`); }
                            try { execSync(`xdotool windowraise ${id}`, { env: { ...process.env, DISPLAY: this.display } }); } catch (e) { this.logger.debug(`windowraise ${id} failed: ${e.message}`); }
                            try { execSync(`xdotool windowfocus ${id}`, { env: { ...process.env, DISPLAY: this.display } }); } catch (e) { this.logger.debug(`windowfocus ${id} failed: ${e.message}`); }
                            try { execSync(`wmctrl -i -a ${id}`, { env: { ...process.env, DISPLAY: this.display } }); } catch (e) { this.logger.debug(`wmctrl activate ${id} failed: ${e.message}`); }
                            // Give WM a moment to apply
                            await new Promise(r => setTimeout(r, 120));
                            try {
                                if (this.windowManager.isWindowActive(id)) {
                                    becameActive = true;
                                    this.browserManager.windowId = id;
                                    this.logger.info(`Aggressive fallback: succeeded with window ${id}`);
                                    break;
                                }
                            } catch (e) {
                                this.logger.debug(`isWindowActive check failed for ${id}: ${e.message}`);
                            }
                        }
                    }
                } catch (e) {
                    this.logger.debug('Aggressive fallback encountered an error: ' + e.message);
                }
            }
        } catch (e) {
            this.logger.warn('Robust showBrowser flow failed unexpectedly:', e.message);
        }

        // Update state
        this.currentState.focus = 'chromium';
        this.currentState.content = this.browserManager.url;

        this.publishStatus();
        this.publishEvent({
            browser_shown: true,
            url: this.browserManager.url
        });

        this.logger.info(`Browser shown (end) ts=${Date.now()}, duration=${Date.now() - tsStart}ms`);
    }

    /**
     * Hide browser: Pure window management - return focus to MPV
     */
    async _hideBrowser() {
        if (!this.browserManager.enabled) {
            this.logger.warn('Browser not enabled, nothing to hide');
            return;
        }

        this.logger.info(`Hiding browser (pure window management) - stored windowId=${this.browserManager.windowId || 'none'}`);

        // Pure window focus switching back to MPV
        const mpvWindow = this.windowManager.getWindowIdByNameExact('ParadoxMPV');
        if (mpvWindow) {
            this.logger.debug(`Found MPV window: ${mpvWindow}, activating...`);
            this.windowManager.activateWindow(mpvWindow);
        } else {
            this.logger.warn('MPV window not found - trying alternative detection');
            // Try alternative MPV window detection
            try {
                const mpvWindows = execSync('xdotool search --class mpv', { env: { ...process.env, DISPLAY: ':0' } }).toString().trim().split('\n');
                if (mpvWindows.length > 0 && mpvWindows[0]) {
                    const altMpvWindow = mpvWindows[0];
                    this.logger.debug(`Found MPV window via class search: ${altMpvWindow}, activating...`);
                    this.windowManager.activateWindow(altMpvWindow);
                } else {
                    this.logger.error('No MPV window found - cannot hide browser properly');
                }
            } catch (e) {
                this.logger.error('Failed to find MPV window:', e.message);
            }
        }

        // Update state
        this.currentState.focus = 'mpv';
        this.currentState.content = this.currentState.currentVideo || this.currentState.currentImage;

        this.publishStatus();
        this.publishEvent({
            browser_hidden: true,
            mpv_content: this.currentState.content
        });

        this.logger.info('Browser hidden successfully');
    }

    /**
     * Set browser URL: Update URL and optionally reload/relaunch
     */
    async _setBrowserUrl(url) {
        if (!url) {
            throw new Error('URL is required');
        }

        this.logger.info(`Setting browser URL to: ${url}`);

        if (this.browserManager.enabled) {
            // Browser is running - need to relaunch with new URL
            const wasFocused = this.currentState.focus === 'chromium';
            await this._disableBrowser();
            await this._enableBrowser(url);

            // If browser was focused before, show it again
            if (wasFocused) {
                await this._showBrowser();
            }
        } else {
            // Browser not running - just store the URL for next launch
            this.browserManager.url = url;
        }

        this.publishEvent({ browser_url_set: url });
        this.logger.info('Browser URL updated successfully');
    }

    /**
     * Set browser keep-alive: Enable/disable auto-restart on crash
     */
    async _setBrowserKeepAlive(enabled) {
        this.browserManager.keepAlive = !!enabled;

        this.publishEvent({
            browser_keep_alive_set: enabled
        });

        this.logger.info(`Browser keep-alive ${enabled ? 'enabled' : 'disabled'}`);

        if (enabled) {
            this._startBrowserMonitoring();
        } else {
            this._stopBrowserMonitoring();
        }
    }

    /**
     * Start monitoring browser process for crashes and restart if enabled
     * @private
     */
    _startBrowserMonitoring() {
        if (this._browserMonitorInterval) {
            clearInterval(this._browserMonitorInterval);
        }

        this.logger.debug('Starting browser keep-alive monitoring...');

        this._browserMonitorInterval = setInterval(async () => {
            if (this.browserManager.enabled && this.browserManager.keepAlive && this.browserManager.process) {
                // Check if browser process is still alive
                try {
                    process.kill(this.browserManager.process.pid, 0); // Check if process exists
                } catch (error) {
                    if (error.code === 'ESRCH') {
                        // Process doesn't exist - browser crashed
                        this.logger.warn('Browser process crashed, restarting due to keep-alive setting...');

                        const previousUrl = this.browserManager.url || 'http://localhost/clock/';
                        const wasFocused = this.currentState.focus === 'chromium';

                        try {
                            // Reset browser state
                            this.browserManager.process = null;
                            this.browserManager.windowId = null;
                            this.browserManager.enabled = false;

                            // Restart browser
                            await this._enableBrowser(previousUrl);

                            if (wasFocused) {
                                await this._showBrowser();
                            }

                            this.publishEvent({
                                browser_restarted: true,
                                reason: 'keep_alive_crash_recovery',
                                url: previousUrl
                            });

                        } catch (restartError) {
                            this.logger.error('Failed to restart browser after crash:', restartError);
                            this.publishError('Browser restart failed', {
                                error: restartError.message,
                                url: previousUrl
                            });
                        }
                    }
                }
            }
        }, 5000); // Check every 5 seconds
    }

    /**
     * Stop monitoring browser process
     * @private
     */
    _stopBrowserMonitoring() {
        if (this._browserMonitorInterval) {
            this.logger.debug('Stopping browser keep-alive monitoring...');
            clearInterval(this._browserMonitorInterval);
            this._browserMonitorInterval = null;
        }
    }

    /**
     * Update focus and content tracking based on active window
     */
    _updateFocusAndContent() {
        // Check if browser window is active
        if (this.browserManager.windowId &&
            this.windowManager.isWindowActive(this.browserManager.windowId)) {
            this.currentState.focus = 'chromium';
            this.currentState.content = this.browserManager.url;
        } else {
            // Check if MPV window is active
            const mpvWindow = this.windowManager.getWindowIdByNameExact('ParadoxMPV');
            if (mpvWindow && this.windowManager.isWindowActive(mpvWindow)) {
                this.currentState.focus = 'mpv';
                this.currentState.content = this.currentState.currentVideo || this.currentState.currentImage;
            } else {
                this.currentState.focus = 'none';
                this.currentState.content = 'none';
            }
        }

        // Update browser status (include whether browser window is foreground)
        let browserForeground = false;
        try {
            const wm = this.windowManager;
            if (wm) {
                // Prefer explicit API if available
                if (typeof wm.isWindowActive === 'function') {
                    browserForeground = !!(this.browserManager.windowId && wm.isWindowActive(this.browserManager.windowId));
                } else if (typeof wm.getActiveWindowId === 'function') {
                    const active = wm.getActiveWindowId();
                    if (active != null && this.browserManager.windowId != null) {
                        // Normalize hex/decimal window ids for comparison
                        const a = String(active).replace(/^0x/, '');
                        const b = String(this.browserManager.windowId).replace(/^0x/, '');
                        browserForeground = a === b;
                    }
                } else if (typeof wm.getActiveWindow === 'function') {
                    const aw = wm.getActiveWindow();
                    if (aw && aw.id != null && this.browserManager.windowId != null) {
                        const a = String(aw.id).replace(/^0x/, '');
                        const b = String(this.browserManager.windowId).replace(/^0x/, '');
                        browserForeground = a === b;
                    }
                } else {
                    // As a last resort, use focus field as heuristic
                    browserForeground = this.currentState.focus === 'chromium';
                }
            }
        } catch (err) {
            this.logger.debug('Failed to determine browser foreground state', err);
            browserForeground = false;
        }

        this.currentState.browser = {
            enabled: this.browserManager.enabled,
            url: this.browserManager.url,
            process_id: this.browserManager.process?.pid || null,
            window_id: this.browserManager.windowId,
            foreground: !!browserForeground
        };
    }

    // ========================================================================
    // WINDOW SWITCHING CORE FUNCTIONS
    // ========================================================================

    /**
     * Switch to MPV: Hide browser and show video content (pure window management)
     */
    async _switchToMpv() {
        this.logger.info('Switching to MPV (pure window management)');

        // If browser is enabled and focused, hide it first
        if (this.browserManager.enabled && this.currentState.focus === 'chromium') {
            await this._hideBrowser();
        } else {
            // Direct switch to MPV
            const mpvWindow = this.windowManager.getWindowIdByNameExact('ParadoxMPV');
            if (mpvWindow) {
                this.windowManager.activateWindow(mpvWindow);

                // Update state
                this.currentState.focus = 'mpv';
                this.currentState.content = this.currentState.currentVideo || this.currentState.currentImage;

                this.publishStatus();
                this.publishEvent({
                    switched_to_mpv: true,
                    content: this.currentState.content
                });
            } else {
                this.logger.warn('MPV window not found for switching');
            }
        }

        this.logger.info('Switched to MPV successfully');
    }

    /**
     * Switch to browser: Show browser (pure window management)
     */
    async _switchToBrowser() {
        if (!this.browserManager.enabled) {
            throw new Error('Browser not enabled. Call enableBrowser first.');
        }

        this.logger.info('Switching to browser (pure window management)');

        // If MPV is focused, coordinate transition
        if (this.currentState.focus === 'mpv') {
            // Pure window switching to browser
            this.windowManager.activateWindow(this.browserManager.windowId);

            // Update state
            this.currentState.focus = 'chromium';
            this.currentState.content = this.browserManager.url;

            this.publishStatus();
            this.publishEvent({
                switched_to_browser: true,
                url: this.browserManager.url
            });
        } else {
            // Direct switch to browser (already showing or no current focus)
            await this._showBrowser();
        }

        this.logger.info('Switched to browser successfully');
    }

    /**
     * Smart toggle: Switch between MPV and browser based on current focus
     */
    async _toggleMpvBrowser() {
        this.logger.info('Toggling between MPV and browser (pure window management)');

        if (this.currentState.focus === 'chromium') {
            await this._switchToMpv();
        } else if (this.currentState.focus === 'mpv') {
            if (this.browserManager.enabled) {
                await this._switchToBrowser();
            } else {
                this.logger.warn('Cannot switch to browser - not enabled');
            }
        } else {
            // No clear focus - default to MPV
            await this._switchToMpv();
        }

        this.logger.info('Toggle completed');
    }

    // ========================================================================
    // ENHANCED STATUS REPORTING
    // ========================================================================

    /**
     * Override publishStatus to include current focus and content information
     */
    publishStatus() {
        // Update focus and content tracking before publishing
        this._updateFocusAndContent();

        // Call parent publishStatus with enhanced currentState
        super.publishStatus();
    }

    // ---------------------- Manual duck/unduck commands ----------------------
    async _handleDuckCommand(command) {
        // Determine duck value: command.ducking > zone config.videoDucking > global videoDucking > code default
        const codeDefault = this._isVideoFile(command.file || command.video) ? -24 : 0;
        const zoneDefault = this.config && this.config.videoDucking !== undefined ? this.config.videoDucking : undefined;
        const globalDefault = this.config && this.config.videoDucking !== undefined ? this.config.videoDucking : undefined;
        let duckValue = command.ducking !== undefined ? command.ducking : (zoneDefault !== undefined ? zoneDefault : (globalDefault !== undefined ? globalDefault : codeDefault));

        const duckId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this._applyDucking(duckId, duckValue);
        this.publishEvent({ ducked: true, ducking_applied: duckValue, duck_id: duckId });
        this.publishStatus();
    }

    async _handleUnduckCommand(command) {
        const id = command.duck_id;
        if (id) {
            this._removeDucking(id);
            this.publishEvent({ unducked: true, duck_id: id });
        } else {
            // remove manual ducks only
            for (const key of Array.from(this._activeDucks.keys())) {
                if (String(key).startsWith('manual-')) this._removeDucking(key);
            }
            this.publishEvent({ unducked_all_manual: true });
        }
        this.publishStatus();
    }
}

module.exports = ScreenZone;

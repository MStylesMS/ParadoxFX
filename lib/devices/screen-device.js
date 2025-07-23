/**
 * Screen Device
 * 
 * Handles image, video, and audio playback for screen devices.
 * Uses unified MPV Zone Manager for all media playback.
 * Includes intelligent screen power management.
 */

const MediaPlayerFactory = require('../media/media-player-factory');
const ScreenPowerManager = require('../utils/screen-power-manager');
const Logger = require('../utils/logger');

class ScreenDevice {
    constructor(config, mqttClient) {
        this.config = config;
        this.mqttClient = mqttClient;
        this.logger = new Logger(`ScreenDevice:${config.name}`);

        // MPV Zone Manager for unified media control
        this.mediaPlayerFactory = new MediaPlayerFactory(config);
        this.zoneManager = null;

        // Screen power management
        this.screenPowerManager = new ScreenPowerManager(config.display || ':0');
        
        // Default image configuration
        this.defaultImage = config.defaultImage || config.default_image || 'default.png';

        // State tracking
        this.currentState = {
            status: 'idle',
            currentImage: null,
            currentVideo: null,
            currentAudio: null,
            backgroundMusic: null,
            videoQueueLength: 0,
            audioQueueLength: 0,
            speechQueueLength: 0,
            volume: config.defaultVolume || 70,
            screenAwake: true
        };

        // Zone configuration for MPV manager
        this.zoneConfig = {
            name: config.name,
            mediaDir: config.mediaDir || '/opt/paradox/media',
            audioDevice: config.audioDevice,
            display: config.display || ':0',
            xineramaScreen: config.xineramaScreen || 0,
            videoQueueMax: config.videoQueueMax || 5,
            mpvVideoOptions: config.mpvVideoOptions
        };
    }

    async initialize() {
        this.logger.info(`Initializing screen device on display ${this.config.display}`);

        try {
            // Initialize screen power management
            await this.screenPowerManager.disableScreenBlanking();
            await this.screenPowerManager.checkDpmsSupport();

            // Initialize MPV Zone Manager for unified media control
            this.zoneManager = await this.mediaPlayerFactory.createZoneManager(this.zoneConfig);

            // Display default image on startup
            await this._setDefaultImage();

            // Send initial status
            this._publishState();

            this.logger.info('Screen device initialized successfully');
            
        } catch (error) {
            this.logger.error('Screen device initialization failed:', error);
            throw error;
        }
    }

    async shutdown() {
        this.logger.info('Shutting down screen device...');
        await this._stopAll();
        await this.mediaPlayerFactory.shutdown();
        this.logger.info('Screen device shutdown complete');
    }

    async handleCommand(command) {
        this.logger.debug(`Handling command: ${command.Command}`);

        try {
            switch (command.Command) {
                case 'setImage':
                    await this._setImage(command.Image);
                    break;
                case 'playVideo':
                    await this._playVideo(command.Video, command.Channel);
                    break;
                case 'playAudio':
                    await this._playAudio(command.Audio, command.Channel);
                    break;
                case 'playAudioFx':
                    await this._playAudioFx(command.Audio, command.Channel);
                    break;
                case 'playBackgroundMusic':
                    await this._playBackgroundMusic(command.Audio, command.Volume);
                    break;
                case 'stopVideo':
                    await this._stopVideo();
                    break;
                case 'stopAudio':
                    await this._stopAudio();
                    break;
                case 'stopAllAudioFx':
                    await this._stopAllAudioFx();
                    break;
                case 'stopAll':
                    await this._stopAll();
                    break;
                case 'sleepScreen':
                    await this._sleepScreen();
                    break;
                case 'wakeScreen':
                    await this._wakeScreen();
                    break;
                    break;
                case 'stopBackgroundMusic':
                    await this._stopBackgroundMusic();
                    break;
                case 'setVolume':
                    await this._setVolume(command.Volume);
                    break;
                case 'playSpeech':
                    await this._playSpeech(command.Audio, command.Volume);
                    break;
                case 'clearSpeechQueue':
                    await this._clearSpeechQueue();
                    break;
                case 'playSoundEffect':
                    await this._playSoundEffect(command.Audio, command.Volume);
                    break;
                case 'transition':
                    await this._transition(command.Video, command.Image, command.Channel);
                    break;
                case 'stopVideo':
                    await this._stopVideo();
                    break;
                case 'stopAudio':
                    await this._stopAudio();
                    break;
                case 'stopAllAudioFx':
                    await this._stopAllAudioFx();
                    break;
                case 'stopAll':
                    await this._stopAll();
                    break;
                case 'getConfig':
                    this._sendConfig();
                    break;
                case 'getStatus':
                    this._publishState();
                    break;
                default:
                    throw new Error(`Unknown command: ${command.Command}`);
            }
        } catch (error) {
            this.logger.error(`Command failed: ${command.Command}`, error);
            this._publishError('COMMAND_FAILED', `${command.Command}: ${error.message}`);
            throw error;
        }
    }

    // ...existing methods omitted for brevity...

    /**
     * Set default image on screen
     */
    async _setDefaultImage() {
        try {
            const imagePath = this._resolveMediaPath(this.defaultImage);
            await this.zoneManager.loadMedia(imagePath, 'image');
            
            this.currentState.currentImage = this.defaultImage;
            this.currentState.status = 'showing_image';
            this._publishState();
            
            this.logger.debug(`Default image set: ${this.defaultImage}`);
        } catch (error) {
            this.logger.warn(`Failed to set default image ${this.defaultImage}:`, error.message);
        }
    }

    /**
     * Set image on screen with auto-wake
     */
    async _setImage(imagePath) {
        await this.screenPowerManager.autoWakeForMedia('image');
        
        const fullPath = this._resolveMediaPath(imagePath);
        await this.zoneManager.loadMedia(fullPath, 'image');
        
        this.currentState.currentImage = imagePath;
        this.currentState.status = 'showing_image';
        this._publishState();
        
        this.logger.debug(`Image set: ${imagePath}`);
    }

    /**
     * Play video with auto-wake
     */
    async _playVideo(videoPath, channel) {
        await this.screenPowerManager.autoWakeForMedia('video');
        
        const fullPath = this._resolveMediaPath(videoPath);
        await this.zoneManager.loadMedia(fullPath, 'video');
        
        this.currentState.currentVideo = videoPath;
        this.currentState.status = 'playing_video';
        this._publishState();
        
        this.logger.debug(`Video playing: ${videoPath}`);
    }

    /**
     * Play audio with conditional auto-wake (HDMI audio wakes, analog doesn't)
     */
    async _playAudio(audioPath, channel) {
        // Auto-wake for HDMI audio only
        if (this.screenPowerManager.shouldWakeForAudio(this.config.audioDevice)) {
            await this.screenPowerManager.autoWakeForMedia('audio');
        }
        
        const fullPath = this._resolveMediaPath(audioPath);
        await this.zoneManager.loadMedia(fullPath, 'audio');
        
        this.currentState.currentAudio = audioPath;
        this.currentState.status = 'playing_audio';
        this._publishState();
        
        this.logger.debug(`Audio playing: ${audioPath}`);
    }

    /**
     * Sleep screen using DPMS
     */
    async _sleepScreen() {
        await this.screenPowerManager.sleepScreens();
        
        this.currentState.screenAwake = false;
        this.currentState.status = 'screen_asleep';
        this._publishState();
        
        this.logger.info('Screen put to sleep');
    }

    /**
     * Wake screen and restore default image
     */
    async _wakeScreen() {
        await this.screenPowerManager.wakeScreens();
        
        // Restore default image if no media is currently playing
        if (!this.currentState.currentVideo && !this.currentState.currentAudio) {
            await this._setDefaultImage();
        }
        
        this.currentState.screenAwake = true;
        this._publishState();
        
        this.logger.info('Screen woken up');
    }

    /**
     * Resolve media file path relative to media directory
     */
    _resolveMediaPath(filename) {
        const path = require('path');
        const mediaDir = path.join(this.zoneConfig.mediaDir, this.config.media_dir || '');
        return path.join(mediaDir, filename);
    }

    /**
     * Stop all media and return to default image
     */
    async _stopAll() {
        if (this.zoneManager) {
            await this.zoneManager.stop();
        }
        
        this.currentState.currentImage = null;
        this.currentState.currentVideo = null;
        this.currentState.currentAudio = null;
        this.currentState.status = 'idle';
        
        // Show default image after stop
        await this._setDefaultImage();
        
        this._publishState();
        this.logger.debug('All media stopped');
    }

    /**
     * Placeholder methods for other stop commands
     */
    async _stopVideo() {
        // Implementation would stop video only
        this.logger.debug('Stop video command received');
    }

    async _stopAudio() {
        // Implementation would stop audio only  
        this.logger.debug('Stop audio command received');
    }

    async _stopAllAudioFx() {
        // Implementation would stop audio effects only
        this.logger.debug('Stop all audio FX command received');
    }

    async _playAudioFx(audioPath, channel) {
        // Implementation for audio effects
        this.logger.debug(`Play audio FX: ${audioPath}`);
    }

    async _playBackgroundMusic(audioPath, volume) {
        // Implementation for background music
        this.logger.debug(`Play background music: ${audioPath} at volume ${volume}`);
    }

    _publishError(errorCode, message) {
        const errorMessage = {
            timestamp: new Date().toISOString(),
            device: this.config.name,
            type: 'error',
            error_code: errorCode,
            message: message,
            source_topic: this.config.baseTopic
        };
        this.mqttClient.publish(this.config.statusTopic, errorMessage);
        this.mqttClient.publish(this.mqttClient.config.heartbeatTopic, errorMessage);
    }
}

module.exports = ScreenDevice;

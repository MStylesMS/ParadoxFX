/**
 * Screen Device
 * 
 * Handles image, video, and audio playback for screen devices.
 * Uses unified MPV Zone Manager for all media playback.
 */

const MediaPlayerFactory = require('../media/media-player-factory');
const Logger = require('../utils/logger');

class ScreenDevice {
    constructor(config, mqttClient) {
        this.config = config;
        this.mqttClient = mqttClient;
        this.logger = new Logger(`ScreenDevice:${config.name}`);

        // MPV Zone Manager for unified media control
        this.mediaPlayerFactory = new MediaPlayerFactory(config);
        this.zoneManager = null;

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
            volume: config.defaultVolume || 70
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

        // Initialize MPV Zone Manager for unified media control
        this.zoneManager = await this.mediaPlayerFactory.createZoneManager(this.zoneConfig);

        // Set up event handlers
        this.zoneManager.on('mediaEnded', (media) => {
            this.logger.debug(`Media ended: ${media.filepath}`);
            this._updateCurrentState(media.type, null);
            this._publishState();
        });

        this.zoneManager.on('queueEmpty', (type) => {
            this.logger.debug(`${type} queue is now empty`);
            this._publishState();
        });

        this.zoneManager.on('error', (error) => {
            this.logger.error('Zone manager error:', error);
            this._publishState();
        });

        // Send initial status
        this._publishState();

        this.logger.info('Screen device initialized successfully');
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

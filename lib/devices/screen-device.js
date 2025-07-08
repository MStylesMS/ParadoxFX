/**
 * Screen Device
 * 
 * Handles image, video, and audio playback for screen devices.
 */

const MediaPlayerFactory = require('../media/media-player-factory');
const Logger = require('../utils/logger');

class ScreenDevice {
    constructor(config, mqttClient) {
        this.config = config;
        this.mqttClient = mqttClient;
        this.logger = new Logger(`ScreenDevice:${config.name}`);

        // Media players
        this.imagePlayer = null;
        this.videoPlayer = null;
        this.audioPlayer = null;
        this.audioFxPlayer = null;

        // Queues
        this.videoQueue = [];
        this.audioQueue = [];

        // State tracking
        this.currentState = {
            status: 'idle',
            currentImage: null,
            currentVideo: null,
            currentAudio: null,
            videoQueueLength: 0,
            audioQueueLength: 0
        };
    }

    async initialize() {
        this.logger.info(`Initializing screen device on display ${this.config.display}`);

        // Initialize media players
        this.imagePlayer = MediaPlayerFactory.createImagePlayer(this.config);
        this.videoPlayer = MediaPlayerFactory.createVideoPlayer(this.config);
        this.audioPlayer = MediaPlayerFactory.createAudioPlayer(this.config);
        this.audioFxPlayer = MediaPlayerFactory.createAudioFxPlayer(this.config);

        // Send initial status
        this._publishState();

        this.logger.info('Screen device initialized successfully');
    }

    async shutdown() {
        this.logger.info('Shutting down screen device...');

        // Stop all media playback
        await this._stopAll();

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

                case 'videoQueue':
                    this._sendVideoQueue();
                    break;

                case 'audioQueue':
                    this._sendAudioQueue();
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

    async _setImage(imagePath) {
        if (!imagePath) {
            throw new Error('Image path is required');
        }

        this.logger.info(`Setting image: ${imagePath}`);

        await this.imagePlayer.showImage(imagePath);

        this.currentState.currentImage = imagePath;
        this.currentState.status = 'showing_image';

        this._publishState();
    }

    async _playVideo(videoPath, channel) {
        if (!videoPath) {
            throw new Error('Video path is required');
        }

        this.logger.info(`Playing video: ${videoPath}`);

        // Add to queue if not already present
        if (!this.videoQueue.includes(videoPath)) {
            if (this.videoQueue.length >= this.config.videoQueueMax) {
                this.videoQueue.shift(); // Remove oldest
            }
            this.videoQueue.push(videoPath);
        }

        await this.videoPlayer.play(videoPath);

        this.currentState.currentVideo = videoPath;
        this.currentState.status = 'playing_video';
        this.currentState.videoQueueLength = this.videoQueue.length;

        this._publishState();
    }

    async _playAudio(audioPath, channel) {
        if (!audioPath) {
            throw new Error('Audio path is required');
        }

        this.logger.info(`Playing audio: ${audioPath}`);

        // Add to queue if not already present
        if (!this.audioQueue.includes(audioPath)) {
            if (this.audioQueue.length >= this.config.audioQueueMax) {
                this.audioQueue.shift(); // Remove oldest
            }
            this.audioQueue.push(audioPath);
        }

        await this.audioPlayer.play(audioPath);

        this.currentState.currentAudio = audioPath;
        this.currentState.audioQueueLength = this.audioQueue.length;

        this._publishState();
    }

    async _playAudioFx(audioPath, channel) {
        if (!audioPath) {
            throw new Error('Audio FX path is required');
        }

        this.logger.info(`Playing audio FX: ${audioPath}`);

        await this.audioFxPlayer.play(audioPath);

        this._publishState();
    }

    async _transition(videoPath, imagePath, channel) {
        if (!videoPath || !imagePath) {
            throw new Error('Both video and image paths are required for transition');
        }

        this.logger.info(`Transition: ${videoPath} -> ${imagePath}`);

        // TODO: Implement transition logic
        await this._playVideo(videoPath, channel);

        // After video completes, show image
        setTimeout(async () => {
            await this._setImage(imagePath);
        }, this.config.transitionDelay);
    }

    async _stopVideo() {
        this.logger.info('Stopping video playback');
        await this.videoPlayer.stop();
        this.currentState.currentVideo = null;
        this.currentState.status = 'idle';
        this._publishState();
    }

    async _stopAudio() {
        this.logger.info('Stopping audio playback');
        await this.audioPlayer.stop();
        this.currentState.currentAudio = null;
        this._publishState();
    }

    async _stopAllAudioFx() {
        this.logger.info('Stopping all audio FX');

        // TODO: Implement audio FX stop

        this._publishState();
    }

    async _stopAll() {
        this.logger.info('Stopping all media playback');

        await this._stopVideo();
        await this._stopAudio();
        await this._stopAllAudioFx();

        this.currentState.status = 'idle';
        this._publishState();
    }

    _sendConfig() {
        const configMessage = {
            timestamp: new Date().toISOString(),
            device: this.config.name,
            type: 'config',
            config: this.config
        };

        this.mqttClient.publish(this.config.statusTopic, configMessage);
    }

    _sendVideoQueue() {
        const queueMessage = {
            timestamp: new Date().toISOString(),
            device: this.config.name,
            type: 'video_queue',
            queue: this.videoQueue,
            current: this.currentState.currentVideo
        };

        this.mqttClient.publish(this.config.statusTopic, queueMessage);
    }

    _sendAudioQueue() {
        const queueMessage = {
            timestamp: new Date().toISOString(),
            device: this.config.name,
            type: 'audio_queue',
            queue: this.audioQueue,
            current: this.currentState.currentAudio
        };

        this.mqttClient.publish(this.config.statusTopic, queueMessage);
    }

    _publishState() {
        const stateMessage = {
            timestamp: new Date().toISOString(),
            device: this.config.name,
            type: 'state',
            ...this.currentState
        };

        this.mqttClient.publish(this.config.statusTopic, stateMessage);
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

        // Send to device status topic
        this.mqttClient.publish(this.config.statusTopic, errorMessage);

        // Also send to global heartbeat topic
        this.mqttClient.publish(this.mqttClient.config.heartbeatTopic, errorMessage);
    }
}

module.exports = ScreenDevice;

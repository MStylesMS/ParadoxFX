/**
 * Media Player Factory
 * 
 * Creates appropriate media players based on configuration and platform.
 */

const path = require('path');
const FbiPlayer = require('./players/fbi-player');
const MpvPlayer = require('./players/mpv-player');
const CvlcPlayer = require('./players/cvlc-player');
const BasePlayer = require('./players/base-player');
const Logger = require('../utils/logger');

class MediaPlayerFactory {
    constructor(config, processManager) {
        this.config = config || {};
        this.processManager = processManager;
        this.logger = new Logger('MediaPlayerFactory');
    }

    /**
     * Create a player based on the media file type
     * @param {string} filePath - Path to the media file
     * @returns {BasePlayer} - Appropriate player instance
     */
    createPlayer(filePath) {
        const ext = path.extname(filePath).toLowerCase();

        // Determine media type by extension
        if (this.isImageFile(ext)) {
            return this.createImagePlayer(filePath);
        } else if (this.isVideoFile(ext)) {
            return this.createVideoPlayer(filePath);
        } else if (this.isAudioFile(ext)) {
            return this.createAudioPlayer(filePath);
        } else {
            throw new Error(`Unsupported media file type: ${ext}`);
        }
    }

    isImageFile(ext) {
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'];
        return imageExts.includes(ext);
    }

    isVideoFile(ext) {
        const videoExts = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm'];
        return videoExts.includes(ext);
    }

    isAudioFile(ext) {
        const audioExts = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.opus', '.m4a', '.wma'];
        return audioExts.includes(ext);
    }

    createImagePlayer(filePath) {
        // Default order of preference for image display
        const imagePlayerPreference = ['feh', 'fbi', 'fim', 'pqiv'];

        // Use configured player or default
        const playerCmd = this.config.defaultImagePlayer || 'feh';

        this.logger.debug(`Creating image player (${playerCmd}) for: ${filePath}`);

        // Create a mock player object for testing
        return {
            command: playerCmd,
            args: [filePath],
            type: 'image',
            play: () => this.logger.info(`Playing image: ${filePath}`),
            stop: () => this.logger.info(`Stopping image: ${filePath}`)
        };
    }

    createVideoPlayer(filePath) {
        // Default order of preference for video playback
        const videoPlayerPreference = ['mpv', 'cvlc', 'omxplayer'];

        // Use configured player or default
        const playerCmd = this.config.defaultVideoPlayer || 'mpv';

        this.logger.debug(`Creating video player (${playerCmd}) for: ${filePath}`);

        // Create a mock player object for testing
        return {
            command: playerCmd,
            args: [filePath],
            type: 'video',
            play: () => this.logger.info(`Playing video: ${filePath}`),
            stop: () => this.logger.info(`Stopping video: ${filePath}`)
        };
    }

    createAudioPlayer(filePath) {
        // Default order of preference for audio playback
        const audioPlayerPreference = ['mpv', 'cvlc', 'aplay', 'paplay'];

        // Use configured player or default
        const playerCmd = this.config.defaultAudioPlayer || 'mpv';

        this.logger.debug(`Creating audio player (${playerCmd}) for: ${filePath}`);

        // Create a mock player object for testing
        return {
            command: playerCmd,
            args: [filePath],
            type: 'audio',
            play: () => this.logger.info(`Playing audio: ${filePath}`),
            stop: () => this.logger.info(`Stopping audio: ${filePath}`)
        };
    }

    // Legacy static methods for backward compatibility
    static createImagePlayer(config) {
        const factory = new MediaPlayerFactory(config);
        return factory.createImagePlayer();
    }

    static createVideoPlayer(config) {
        const factory = new MediaPlayerFactory(config);
        return factory.createVideoPlayer();
    }

    static createAudioPlayer(config) {
        const factory = new MediaPlayerFactory(config);
        return factory.createAudioPlayer();
    }

    static createAudioFxPlayer(config) {
        const logger = new Logger('MediaPlayerFactory');

        // Audio FX can use the same players as audio but with different settings
        logger.debug(`Creating audio FX player for channel ${config.audioChannelMap}`);
        return new MpvPlayer(config, 'audiofx');
    }

    static getAvailablePlayers() {
        // TODO: Implement system check for available media players
        return {
            image: ['fbi', 'feh', 'fim', 'pqiv'],
            video: ['mpv', 'cvlc', 'omxplayer'],
            audio: ['mpv', 'cvlc', 'aplay', 'paplay']
        };
    }
}

module.exports = MediaPlayerFactory;

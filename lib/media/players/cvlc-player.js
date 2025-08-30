/**
 * CVLC Media Player
 * 
 * Wrapper for the cvlc (VLC command line) media player.
 * Used for video and audio playback.
 */

const BasePlayer = require('./base-player');
const fs = require('fs').promises;

class CvlcPlayer extends BasePlayer {
    constructor(config, mediaType) {
        super(config, mediaType);
    }

    async play(mediaPath, options = {}) {
        const fullPath = this._getMediaPath(mediaPath);

        // Check if file exists
        try {
            await fs.access(fullPath);
        } catch (error) {
            throw new Error(`Media file not found: ${fullPath}`);
        }

        this.logger.info(`Playing ${this.mediaType} with cvlc: ${fullPath}`);
        this.currentMedia = mediaPath;

        const args = this._buildCvlcArgs(fullPath, options);

        try {
            this._spawnProcess('cvlc', args);
            return this.process;
        } catch (error) {
            this.logger.error('Failed to start cvlc:', error);
            throw error;
        }
    }

    _buildCvlcArgs(mediaPath, options) {
        const args = [];

        // Basic arguments
        args.push('--intf', 'dummy');       // No interface
        args.push('--quiet');               // Minimize output
        args.push('--play-and-exit');       // Exit after playing

        // Media type specific arguments
        switch (this.mediaType) {
            case 'video':
                args.push('--fullscreen');
                args.push('--no-video-title-show');

                // Video output
                args.push('--vout', 'x11');

                // Display configuration
                if (this.config.display) {
                    // Set X11 display
                    // VLC will use the DISPLAY environment variable
                }

                // Audio output for video
                const videoAudio = this._parseChannelMap(this.config.audioChannelMap);
                if (videoAudio.device !== 'default') {
                    args.push('--aout', 'alsa');
                    args.push('--alsa-audio-device', videoAudio.device);
                }
                break;

            case 'audio':
            case 'audiofx':
                args.push('--intf', 'dummy');
                args.push('--no-video');

                // Audio output configuration
                const audioConfig = this._parseChannelMap(this.config.audioChannelMap);
                args.push('--aout', 'alsa');
                if (audioConfig.device !== 'default') {
                    args.push('--alsa-audio-device', audioConfig.device);
                }

                // Volume settings
                if (options.volume !== undefined) {
                    args.push('--volume', Math.round(options.volume * 1.28)); // Convert 0-200 to VLC scale
                }
                break;
        }

        // Loop settings
        if (options.loop) {
            args.push('--loop');
        }

        // The media file path (must be last)
        args.push(mediaPath);

        return args;
    }
}

module.exports = CvlcPlayer;

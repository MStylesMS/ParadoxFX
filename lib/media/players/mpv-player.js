/**
 * MPV Media Player
 * 
 * Wrapper for the mpv media player.
 * Used for video and audio playback.
 */

const BasePlayer = require('./base-player');
const fs = require('fs').promises;

class MpvPlayer extends BasePlayer {
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

        this.logger.info(`Playing ${this.mediaType} with mpv: ${fullPath}`);
        this.currentMedia = mediaPath;

        const args = this._buildMpvArgs(fullPath, options);

        try {
            this._spawnProcess('mpv', args);
            return this.process;
        } catch (error) {
            this.logger.error('Failed to start mpv:', error);
            throw error;
        }
    }

    _buildMpvArgs(mediaPath, options) {
        const args = [];

        // Basic arguments
        args.push('--no-terminal');     // Don't use terminal for input
        args.push('--really-quiet');    // Minimize output

        // Media type specific arguments
        switch (this.mediaType) {
            case 'video':
                args.push('--fullscreen');
                args.push('--no-border');
                args.push('--ontop');

                // Video-specific display
                if (this.config.display) {
                    // For X11 displays
                    args.push(`--screen=${this.config.display.replace(':', '')}`);
                }

                // Audio output for video
                const videoAudio = this._parseChannelMap(this.config.audioChannelMap);
                if (videoAudio.device !== 'default') {
                    args.push(`--audio-device=alsa/${videoAudio.device}`);
                }
                break;

            case 'audio':
            case 'audiofx':
                args.push('--no-video');   // Audio only

                // Audio output configuration
                const audioConfig = this._parseChannelMap(this.config.audioChannelMap);
                if (audioConfig.device !== 'default') {
                    args.push(`--audio-device=alsa/${audioConfig.device}`);
                }

                // Volume settings
                if (options.volume !== undefined) {
                    args.push(`--volume=${options.volume}`);
                }
                break;
        }

        // Loop settings
        if (options.loop) {
            args.push('--loop-file=inf');
        } else {
            args.push('--loop-file=no');
        }

        // Pause at start (for pre-loading)
        if (options.pauseAtStart) {
            args.push('--pause');
        }

        // The media file path (must be last)
        args.push(mediaPath);

        return args;
    }

    async pause() {
        if (this.process && this.isPlaying) {
            this.logger.debug('Pausing mpv playback');
            // Send pause command via stdin (if we had stdin control)
            // For now, this is a placeholder
            this.logger.warn('MPV pause control not yet implemented');
        }
    }

    async resume() {
        if (this.process && this.isPlaying) {
            this.logger.debug('Resuming mpv playback');
            // Send resume command via stdin (if we had stdin control)
            // For now, this is a placeholder
            this.logger.warn('MPV resume control not yet implemented');
        }
    }
}

module.exports = MpvPlayer;

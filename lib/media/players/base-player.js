/**
 * Base Media Player
 * 
 * Base class for all media players.
 */

const { spawn } = require('child_process');
const Logger = require('../../utils/logger');

class BasePlayer {
    constructor(config, mediaType) {
        this.config = config;
        this.mediaType = mediaType; // 'image', 'video', 'audio', 'audiofx'
        this.logger = new Logger(`BasePlayer:${mediaType}`);

        this.process = null;
        this.isPlaying = false;
        this.currentMedia = null;
    }

    async play(mediaPath, options = {}) {
        throw new Error('play() method must be implemented by subclass');
    }

    async stop() {
        if (this.process && !this.process.killed) {
            this.logger.debug(`Stopping ${this.mediaType} player`);
            this.process.kill('SIGTERM');

            // Force kill after timeout if needed
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.logger.warn(`Force killing ${this.mediaType} player`);
                    this.process.kill('SIGKILL');
                }
            }, 5000);
        }

        this.isPlaying = false;
        this.currentMedia = null;
        this.process = null;
    }

    async pause() {
        // Default implementation - not all players support pause
        this.logger.warn(`Pause not implemented for ${this.mediaType} player`);
    }

    async resume() {
        // Default implementation - not all players support resume
        this.logger.warn(`Resume not implemented for ${this.mediaType} player`);
    }

    getStatus() {
        return {
            isPlaying: this.isPlaying,
            currentMedia: this.currentMedia,
            mediaType: this.mediaType
        };
    }

    _spawnProcess(command, args, options = {}) {
        this.logger.debug(`Spawning process: ${command} ${args.join(' ')}`);

        const processOptions = {
            env: {
                ...process.env,
                DISPLAY: this.config.display
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            ...options
        };

        this.process = spawn(command, args, processOptions);
        this.isPlaying = true;

        this.process.on('close', (code) => {
            this.logger.debug(`Process exited with code ${code}`);
            this.isPlaying = false;
            this.currentMedia = null;
            this.process = null;
        });

        this.process.on('error', (error) => {
            this.logger.error(`Process error:`, error);
            this.isPlaying = false;
            this.currentMedia = null;
            this.process = null;
        });

        // Log stderr for debugging
        if (this.process.stderr) {
            this.process.stderr.on('data', (data) => {
                this.logger.debug(`Process stderr: ${data.toString().trim()}`);
            });
        }

        return this.process;
    }

    _getMediaPath(mediaPath) {
        // If absolute path, use as-is
        if (mediaPath.startsWith('/')) {
            return mediaPath;
        }

        // Otherwise, prepend media directory
        const path = require('path');
        return path.join(this.config.mediaDir, mediaPath);
    }

    _parseChannelMap(channelMap) {
        // Parse audio channel map format: "Channel0 DEVICE=device0 CHMASK=4199;Channel1 DEVICE=device1"
        if (!channelMap) {
            return { device: 'default', mask: null };
        }

        const channels = channelMap.split(';');
        const defaultChannel = channels[0];

        const parts = defaultChannel.split(' ');
        let device = 'default';
        let mask = null;

        for (const part of parts) {
            if (part.startsWith('DEVICE=')) {
                device = part.split('=')[1];
            } else if (part.startsWith('CHMASK=')) {
                mask = part.split('=')[1];
            }
        }

        return { device, mask };
    }
}

module.exports = BasePlayer;

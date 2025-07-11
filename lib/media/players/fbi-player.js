/**
 * FBI Media Player
 * 
 * Wrapper for the fbi (frame buffer image viewer) application.
 * Used for displaying images full-screen.
 */

const BasePlayer = require('./base-player');
const fs = require('fs').promises;
const path = require('path');

class FbiPlayer extends BasePlayer {
    constructor(config, mediaType) {
        super(config, mediaType);
        this.killExisting = true; // FBI requires killing existing instances
    }

    async play(mediaPath, options = {}) {
        const fullPath = this._getMediaPath(mediaPath);

        // Check if file exists
        try {
            await fs.access(fullPath);
        } catch (error) {
            throw new Error(`Media file not found: ${fullPath}`);
        }

        // Kill any existing fbi processes first
        if (this.killExisting) {
            await this._killExistingFbi();
        }

        this.logger.info(`Playing image with fbi: ${fullPath}`);
        this.currentMedia = mediaPath;

        const args = [
            '-d', '/dev/fb0',  // Framebuffer device
            '-T', '1',         // TTY to use
            '-noverbose',      // Quiet mode
            '--once',          // Display once and exit
            fullPath
        ];

        // Add display-specific arguments if needed
        if (this.config.display && this.config.display !== ':0') {
            // FBI doesn't support X11 displays directly
            this.logger.warn(`FBI doesn't support X11 display ${this.config.display}, using framebuffer`);
        }

        try {
            this._spawnProcess('fbi', args);
            return this.process;
        } catch (error) {
            this.logger.error('Failed to start fbi:', error);
            throw error;
        }
    }

    async stop() {
        await super.stop();

        // Also kill any other fbi processes that might be running
        if (this.killExisting) {
            await this._killExistingFbi();
        }
    }

    async _killExistingFbi() {
        try {
            // Kill existing fbi processes
            this.logger.debug('Killing existing fbi processes');
            const { spawn } = require('child_process');

            const killProcess = spawn('sudo', ['pkill', '-f', 'fbi'], {
                stdio: 'ignore'
            });

            return new Promise((resolve) => {
                killProcess.on('close', () => {
                    resolve();
                });

                // Don't wait too long
                setTimeout(resolve, 1000);
            });

        } catch (error) {
            this.logger.warn('Failed to kill existing fbi processes:', error);
        }
    }

    async _selectPlayer(filePath, displayMode = 'fullscreen') {
        const ext = path.extname(filePath).toLowerCase();
        const config = this.config;

        // Check if we're in a framebuffer environment (no X11)
        const hasX11 = process.env.DISPLAY && process.env.DISPLAY !== '';

        // Priority order based on environment and requirements
        if (config.preferredImagePlayer) {
            // User specified preference
            return this._createPlayerByName(config.preferredImagePlayer, filePath);
        }

        // Auto-select based on environment and capabilities
        if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'].includes(ext)) {
            if (hasX11) {
                // X11 environment - use X11-based viewers (no root needed)
                if (await this._isPlayerAvailable('feh')) {
                    return this._createFehPlayer(filePath, displayMode);
                } else if (await this._isPlayerAvailable('pqiv')) {
                    return this._createPqivPlayer(filePath, displayMode);
                } else if (await this._isPlayerAvailable('display')) {
                    return this._createImageMagickPlayer(filePath, displayMode);
                }
            } else {
                // Framebuffer environment - try framebuffer viewers
                if (await this._isPlayerAvailable('fim')) {
                    return this._createFimPlayer(filePath, displayMode);
                } else if (await this._isPlayerAvailable('fbi')) {
                    return this._createFbiPlayer(filePath, displayMode);
                }
            }
        }

        // Fallback to existing players for other formats
        return this._createDefaultPlayer(filePath);
    }

    async _createFehPlayer(filePath, displayMode, targetDisplay = null) {
        const args = ['--quiet', '--hide-pointer'];

        if (displayMode === 'fullscreen') {
            args.push('--fullscreen', '--auto-zoom');

            // Handle specific display targeting
            if (targetDisplay !== null) {
                if (typeof targetDisplay === 'number') {
                    // Xinerama screen index
                    args.push('--xinerama-index', targetDisplay.toString());
                } else if (typeof targetDisplay === 'object') {
                    // Custom geometry for specific monitor
                    const { width, height, x, y } = targetDisplay;
                    args.push('--geometry', `${width}x${height}+${x}+${y}`);
                }
            }
        }

        args.push(filePath);

        const options = {
            stdio: ['ignore', 'pipe', 'pipe']
        };

        // Set DISPLAY environment if specified
        if (this.config.display) {
            options.env = { ...process.env, DISPLAY: this.config.display };
        }

        return {
            command: 'feh',
            args: args,
            options: options
        };
    }

    async _createPqivPlayer(filePath, displayMode) {
        const args = ['--hide-info-box'];

        if (displayMode === 'fullscreen') {
            args.push('--fullscreen');
        }

        args.push(filePath);

        return {
            command: 'pqiv',
            args: args,
            options: {
                stdio: ['ignore', 'pipe', 'pipe']
            }
        };
    }

    async _createImageMagickPlayer(filePath, displayMode) {
        const args = [];

        if (displayMode === 'fullscreen') {
            args.push('-fullscreen');
        }

        args.push(filePath);

        return {
            command: 'display',
            args: args,
            options: {
                stdio: ['ignore', 'pipe', 'pipe']
            }
        };
    }

    async _createFimPlayer(filePath, displayMode) {
        const args = ['--quiet', '--device', '/dev/fb0'];

        if (displayMode === 'fullscreen') {
            args.push('--autowindow');
        }

        args.push(filePath);

        return {
            command: 'fim',
            args: args,
            options: {
                stdio: ['ignore', 'pipe', 'pipe']
            }
        };
    }

    async _isPlayerAvailable(command) {
        try {
            await this.processManager.which(command);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get available displays and monitors
     */
    async getAvailableDisplays() {
        try {
            const { execSync } = require('child_process');

            // Get Xinerama screen info
            let xineramaScreens = [];
            try {
                const xrandrOutput = execSync('xrandr --listmonitors', { encoding: 'utf8' });
                const lines = xrandrOutput.split('\n');

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line) {
                        const match = line.match(/^\s*(\d+):\s*\+(\w+)\s+(\d+)\/\d+x(\d+)\/\d+\+(\d+)\+(\d+)/);
                        if (match) {
                            xineramaScreens.push({
                                index: parseInt(match[1]),
                                name: match[2],
                                width: parseInt(match[3]),
                                height: parseInt(match[4]),
                                x: parseInt(match[5]),
                                y: parseInt(match[6])
                            });
                        }
                    }
                }
            } catch (error) {
                this.logger.warn('Could not query Xinerama screens:', error.message);
            }

            return {
                currentDisplay: process.env.DISPLAY || ':0',
                xineramaScreens: xineramaScreens,
                hasMultipleScreens: xineramaScreens.length > 1
            };

        } catch (error) {
            this.logger.error('Failed to get display information:', error);
            return {
                currentDisplay: process.env.DISPLAY || ':0',
                xineramaScreens: [],
                hasMultipleScreens: false
            };
        }
    }
}

module.exports = FbiPlayer;

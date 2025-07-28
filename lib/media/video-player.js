const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const Logger = require('../utils/logger');

class VideoPlayer {
    constructor(config) {
        this.config = config;
        this.logger = new Logger(`VideoPlayer:${config.name}`);
        this.mpv = null;
        const { sanitizeFilename } = require('../utils/utils');
        this.socketPath = path.join('/tmp', `mpvsocket_${sanitizeFilename(config.name)}`);
        this.isPlaying = false;
    }

    async initialize() {
        this.logger.info(`Initializing video player on display ${this.config.display}`);
        await this._startMpv();
    }

    _startMpv() {
        return new Promise((resolve, reject) => {
            if (this.mpv) {
                this.logger.warn('MPV process already running.');
                return resolve();
            }

            // Ensure socket doesn't exist from a previous crashed run
            if (fs.existsSync(this.socketPath)) {
                fs.unlinkSync(this.socketPath);
            }

            const args = [
                `--screen=${this.config.display}`,
                '--idle',
                '--fs',
                `--input-ipc-server=${this.socketPath}`,
                '--no-stop-screensaver',
                '--hwdec=auto',
                `--volume=${this.config.videoVolume || 70}`
            ];

            this.mpv = spawn('mpv', args);

            this.mpv.on('error', (err) => {
                this.logger.error('Failed to start MPV.', err);
                this.mpv = null;
                reject(err);
            });

            this.mpv.on('exit', (code, signal) => {
                this.logger.info(`MPV process exited with code ${code}, signal ${signal}`);
                this.mpv = null;
                this.isPlaying = false;
            });

            // Wait a moment for the socket to be created
            setTimeout(() => {
                if (fs.existsSync(this.socketPath)) {
                    this.logger.info('MPV process started and socket is available.');
                    resolve();
                } else {
                    this.logger.error('MPV socket not found after startup.');
                    reject(new Error('MPV socket not found.'));
                }
            }, 1000); // 1-second delay
        });
    }

    sendCommand(command) {
        return new Promise((resolve, reject) => {
            const client = net.createConnection({ path: this.socketPath }, () => {
                this.logger.debug(`Sending command to MPV: ${JSON.stringify(command)}`);
                client.write(JSON.stringify(command) + '\n');
                client.end();
            });

            let response = '';
            client.on('data', (data) => {
                response += data.toString();
            });

            client.on('end', () => {
                this.logger.debug(`MPV response: ${response}`);
                resolve(response);
            });

            client.on('error', (err) => {
                this.logger.error('Error communicating with MPV socket.', err);
                // If we can't communicate, the process might be dead. Try restarting it.
                this.logger.info('Attempting to restart MPV...');
                this._startMpv().then(() => reject(err)).catch(reject);
            });
        });
    }

    async play(filePath) {
        if (!fs.existsSync(filePath)) {
            this.logger.error(`Video file not found: ${filePath}`);
            throw new Error(`File not found: ${filePath}`);
        }
        this.logger.info(`Playing video: ${filePath}`);
        await this.sendCommand({ command: ['loadfile', filePath, 'replace'] });
        this.isPlaying = true;
    }

    async stop() {
        this.logger.info('Stopping video playback.');
        await this.sendCommand({ command: ['stop'] });
        this.isPlaying = false;
    }

    async shutdown() {
        this.logger.info('Shutting down video player.');
        await this.sendCommand({ command: ['quit'] });
        if (this.mpv) {
            this.mpv.kill('SIGTERM');
        }
        this.isPlaying = false;
    }
}

module.exports = VideoPlayer;

/**
 * Audio Device
 * 
 * MQTT-controlled multi-zone audio device supporting:
 * - Background music with volume control and ducking
 * - Speech/narration queuing system
 * - Fire-and-forget sound effects (Method 3)
 */

const path = require('path');
const AudioManager = require('../media/audio-manager');
const Logger = require('../utils/logger');

class AudioDevice {
    constructor(config, mqttClient) {
        this.config = config;
        this.mqttClient = mqttClient;
        this.logger = new Logger(`AudioDevice:${config.name}`);
        
        // Initialize AudioManager with configuration
        const audioConfig = {
            baseMediaPath: config.mediaPath || '/opt/paradox/media',
            audioDevice: config.audioDevice || 'auto',
            defaultVolume: parseInt(config.volume) || 80,
            // IPC socket path for background music control
            ipcSocketPath: config.ipcSocketPath || `/tmp/mpv-audio-${config.name}-socket`
        };
        
        this.audioManager = new AudioManager(audioConfig);
        this.isInitialized = false;
        
        // Status tracking
        this.status = {
            backgroundMusic: {
                playing: false,
                file: null,
                volume: audioConfig.defaultVolume,
                isDucked: false
            },
            lastSpeech: null,
            lastSoundEffect: null,
            isReady: false
        };
    }

    async initialize() {
        try {
            this.logger.info('Initializing audio device...');
            
            // Initialize AudioManager
            await this.audioManager.initialize();
            this.isInitialized = true;
            this.status.isReady = true;
            
            this.logger.info('Audio device initialized successfully');
            this._publishStatus();
            
        } catch (error) {
            this.logger.error('Failed to initialize audio device:', error);
            this.status.isReady = false;
            this._publishStatus();
            throw error;
        }
    }

    async handleCommand(message) {
        if (!this.isInitialized) {
            throw new Error('Audio device not initialized');
        }

        const { Command, ...params } = message;
        this.logger.debug(`Processing command: ${Command}`, params);

        try {
            switch (Command) {
                case 'play_background_music':
                    await this._handlePlayBackgroundMusic(params);
                    break;
                    
                case 'stop_background_music':
                    await this._handleStopBackgroundMusic();
                    break;
                    
                case 'set_volume':
                    await this._handleSetVolume(params);
                    break;
                    
                case 'play_speech':
                    await this._handlePlaySpeech(params);
                    break;
                    
                case 'play_sound_effect':
                    await this._handlePlaySoundEffect(params);
                    break;
                    
                case 'get_status':
                    this._publishStatus();
                    break;
                    
                default:
                    throw new Error(`Unknown command: ${Command}`);
            }
            
        } catch (error) {
            this.logger.error(`Error handling command ${Command}:`, error);
            this._publishError(Command, error.message);
            throw error;
        }
    }

    async _handlePlayBackgroundMusic(params) {
        const { file, volume, loop = true } = params;
        
        if (!file) {
            throw new Error('Background music file parameter required');
        }
        
        this.logger.info(`Playing background music: ${file}`);
        
        await this.audioManager.playBackgroundMusic(file, {
            volume: volume || this.status.backgroundMusic.volume,
            loop: loop
        });
        
        this.status.backgroundMusic = {
            playing: true,
            file: file,
            volume: volume || this.status.backgroundMusic.volume,
            isDucked: false
        };
        
        this._publishStatus();
    }

    async _handleStopBackgroundMusic() {
        this.logger.info('Stopping background music');
        
        await this.audioManager.stopBackgroundMusic();
        
        this.status.backgroundMusic = {
            playing: false,
            file: null,
            volume: this.status.backgroundMusic.volume,
            isDucked: false
        };
        
        this._publishStatus();
    }

    async _handleSetVolume(params) {
        const { volume } = params;
        
        if (volume === undefined || volume < 0 || volume > 100) {
            throw new Error('Volume must be between 0 and 100');
        }
        
        this.logger.info(`Setting volume to: ${volume}`);
        
        await this.audioManager.setBackgroundVolume(volume);
        
        this.status.backgroundMusic.volume = volume;
        this._publishStatus();
    }

    async _handlePlaySpeech(params) {
        const { file, duckVolume = 30 } = params;
        
        if (!file) {
            throw new Error('Speech file parameter required');
        }
        
        this.logger.info(`Playing speech: ${file} (duck to ${duckVolume}%)`);
        
        // Mark as ducked if background music is playing
        if (this.status.backgroundMusic.playing) {
            this.status.backgroundMusic.isDucked = true;
        }
        
        await this.audioManager.playSpeech(file, { duckVolume });
        
        this.status.lastSpeech = {
            file: file,
            timestamp: new Date().toISOString()
        };
        
        // Background music should auto-unduck after speech completes
        if (this.status.backgroundMusic.playing) {
            this.status.backgroundMusic.isDucked = false;
        }
        
        this._publishStatus();
    }

    async _handlePlaySoundEffect(params) {
        const { file } = params;
        
        if (!file) {
            throw new Error('Sound effect file parameter required');
        }
        
        this.logger.info(`Playing sound effect: ${file}`);
        
        // Use Method 3 (fire-and-forget spawn with low latency)
        await this.audioManager.playSoundEffect(file);
        
        this.status.lastSoundEffect = {
            file: file,
            timestamp: new Date().toISOString()
        };
        
        this._publishStatus();
    }

    _publishStatus() {
        if (!this.config.statusTopic) {
            return;
        }
        
        const statusMessage = {
            timestamp: new Date().toISOString(),
            device: this.config.name,
            type: 'audio_status',
            status: this.status
        };
        
        this.mqttClient.publish(this.config.statusTopic, statusMessage);
        this.logger.debug('Published status update');
    }

    _publishError(command, message) {
        if (!this.config.statusTopic) {
            return;
        }
        
        const errorMessage = {
            timestamp: new Date().toISOString(),
            device: this.config.name,
            type: 'error',
            command: command,
            message: message
        };
        
        this.mqttClient.publish(this.config.statusTopic, errorMessage);
        this.logger.debug('Published error message');
    }

    async shutdown() {
        if (this.audioManager && this.isInitialized) {
            this.logger.info('Shutting down audio device...');
            await this.audioManager.shutdown();
            this.isInitialized = false;
            this.status.isReady = false;
        }
    }
}

module.exports = AudioDevice;

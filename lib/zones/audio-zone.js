/**
 * Audio Zone
 * Handles audio-only zones with audio capabilities:
 * - Background music playback
 * - Speech/narration with queuing
 * - Sound effects
 * - Dual output support for combined audio sinks
 */

const BaseZone = require('./base-zone');
const AudioManager = require('../media/audio-manager');

class AudioZone extends BaseZone {
    constructor(config, mqttClient, zoneManager) {
        super(config, mqttClient);
        this.zoneManager = zoneManager;

        // Audio-specific configuration
        this.audioConfig = {
            baseMediaPath: this._resolveDeviceMediaDir(config),
            audioDevice: config.audioDevice || config.audio_device || 'auto',
            dualOutputMode: config.dualOutputMode || config.dual_output_mode || false,
            primaryDevice: config.primaryDevice || config.primary_device || null,
            secondaryDevice: config.secondaryDevice || config.secondary_device || null,
            defaultVolume: parseInt(config.volume) || 80,
            duckingVolume: config.duckingVolume !== undefined ? config.duckingVolume : null,
            zoneId: config.name || 'unknown'
        };

        // Audio management
        this.audioManager = new AudioManager(this.audioConfig);

        if (this.audioConfig.dualOutputMode) {
            this.logger.info(`Dual output mode enabled for zone ${this.audioConfig.zoneId}`);
        }

        this.originalBackgroundVolume = null;

        // Audio-specific state
        this.currentState = {
            ...this.currentState,
            backgroundMusic: {
                playing: false,
                file: null,
                volume: this.audioConfig.defaultVolume,
                isDucked: false
            },
            speechQueue: {
                length: 0,
                isProcessing: false
            },
            lastSpeech: null,
            lastSoundEffect: null
        };
    }

    async initialize() {
        this.logger.info('Initializing audio zone...');
        await this.audioManager.initialize();

        this.mpvInstances.background = { status: 'idle', manager: this.audioManager };
        this.mpvInstances.speech = { status: 'idle', manager: this.audioManager };

        this.isInitialized = true;
        this.publishStatus();
    }

    async handleCommand(command) {
        if (!this.isInitialized) throw new Error('Audio zone not initialized');

        this.currentState.lastCommand = command.command;

        // System control shortcuts
        if (['reboot','shutdown','killPfx'].includes(command.command)) {
            if (command.command === 'reboot') require('child_process').exec('sudo reboot');
            if (command.command === 'shutdown') require('child_process').exec('sudo shutdown now');
            if (command.command === 'killPfx') process.kill(process.pid, 'SIGTERM');
            this.publishEvent({ command_completed: command.command, success: true });
            return;
        }

        // Route commands
        switch (command.command) {
            case 'playBackground':
                await this._playBackgroundMusic(command.file || command.audio, command.volume, command.loop);
                break;
            case 'pauseBackground':
                await this._pauseBackgroundMusic();
                break;
            case 'resumeBackground':
                await this._resumeBackgroundMusic();
                break;
            case 'stopBackground':
                await this._stopBackgroundMusic();
                break;

            case 'playSpeech':
                await this._playSpeech(command.file || command.audio, command.volume, command.ducking);
                break;
            case 'pauseSpeech':
                await this._pauseSpeech();
                break;
            case 'resumeSpeech':
                await this._resumeSpeech();
                break;
            case 'skipSpeech':
                await this._skipSpeech();
                break;
            case 'stopSpeech':
                await this._stopSpeech();
                break;
            case 'clearSpeechQueue':
                await this._clearSpeechQueue();
                break;
            case 'duck':
                await this._handleDuckCommand(command);
                break;
            case 'unduck':
                await this._handleUnduckCommand(command);
                break;

            case 'playSoundEffect':
            case 'playEffect':
            case 'playAudioFX':
                await this._playSoundEffect(command.file || command.audio, command.volume);
                break;

            case 'setVolume':
                await this._setVolume(command.volume);
                break;
            case 'getStatus':
            case 'getState':
                this.publishStatus();
                break;
            case 'stopAll':
                await this._stopAll();
                break;
            default:
                this._handleUnsupportedCommand(command.command);
                return;
        }

        this.publishEvent({ command_completed: command.command, success: true });
    }

    getSupportedCommands() {
        return [
            'playBackground','pauseBackground','resumeBackground','stopBackground',
            'playSpeech','pauseSpeech','resumeSpeech','stopSpeech','skipSpeech','clearSpeechQueue',
            'playSoundEffect','playEffect','playAudioFX',
            'duck','unduck',
            'setVolume','getStatus','getState','stopAll','reboot','shutdown','killPfx'
        ];
    }

    _isCommandSupported(command) {
        // Audio zone ignores screen/video commands
        const unsupported = ['setImage','playVideo','stopVideo','sleepScreen','wakeScreen'];
        return !unsupported.includes(command);
    }

    async shutdown() {
        await this._stopAll();
        await this.audioManager.shutdown();
        this._stopPeriodicStatus();
        this.isInitialized = false;
    }

    // ---------------------- Background music ----------------------
    async _playBackgroundMusic(audioPath, volume, loop) {
        if (!audioPath) throw new Error('Background music path is required');
        const fv = await this._validateMediaFile(audioPath);
        if (!fv.exists) {
            this.publishMessage('warning', { message: fv.error, command: 'playBackgroundMusic', file: audioPath });
            return;
        }
        const fullPath = fv.path;
        const targetVolume = volume !== undefined ? volume : this.currentState.backgroundMusic.volume;
        const res = await this.audioManager.playBackgroundMusic(fullPath, targetVolume, !!loop);
        if (!res.success) {
            this.publishMessage('warning', { message: res.error, command: 'playBackgroundMusic', file: audioPath });
            return;
        }
        this.currentState.backgroundMusic = { playing: true, file: audioPath, volume: targetVolume, isDucked: false };
        this.mpvInstances.background.currentFile = audioPath; this.mpvInstances.background.status = 'playing';
        this.publishStatus();
        this.publishEvent({ background_music_started: audioPath, volume: targetVolume });
    }

    async _stopBackgroundMusic() {
        await this.audioManager.stopBackgroundMusic();
        this.currentState.backgroundMusic = { playing: false, file: null, volume: this.currentState.backgroundMusic.volume, isDucked: false };
        this.mpvInstances.background.currentFile = null; this.mpvInstances.background.status = 'idle';
        this.publishStatus(); this.publishEvent({ background_music_stopped: true });
    }

    async _pauseBackgroundMusic() { await this.audioManager.pauseBackgroundMusic(); this.mpvInstances.background.status = 'paused'; this.publishStatus(); }
    async _resumeBackgroundMusic() { await this.audioManager.resumeBackgroundMusic(); this.mpvInstances.background.status = 'playing'; this.publishStatus(); }

    // ---------------------- Speech ----------------------
    async _playSpeech(audioPath, volume, ducking) {
        if (!audioPath) throw new Error('Speech path is required');
        const fv = await this._validateMediaFile(audioPath);
        if (!fv.exists) {
            this.publishMessage('warning', { message: fv.error, command: 'playSpeech', file: audioPath });
            return;
        }
        const fullPath = fv.path;
        const processRunning = await this.audioManager.checkAndRestartProcesses();
        if (!processRunning) {
            this.publishMessage('warning', { message: 'Speech system not available', command: 'playSpeech', file: audioPath });
            return;
        }

        const targetVolume = volume !== undefined ? volume : this.currentState.backgroundMusic.volume || this.audioConfig.defaultVolume;

        // Resolve ducking precedence: command param > zone audioConfig.duckingVolume > global config.speechDucking > code default
        const codeDefault = -26;
        const zoneDefault = this.audioConfig.duckingVolume !== null ? this.audioConfig.duckingVolume : undefined;
        const globalDefault = this.config && this.config.speechDucking !== undefined ? this.config.speechDucking : undefined;
        const duckingLevel = ducking !== undefined ? ducking : (zoneDefault !== undefined ? zoneDefault : (globalDefault !== undefined ? globalDefault : codeDefault));

        this.logger.info(`Playing speech: ${audioPath} at volume ${targetVolume} with ducking ${duckingLevel}`);

        let duckId = null;
        if (duckingLevel < 0) {
            duckId = `speech-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
            this._applyDucking(duckId, duckingLevel);
        }

        // audioManager.playSpeech returns a promise that resolves on completion
        try {
            this.mpvInstances.speech.status = 'playing';
            await this.audioManager.playSpeech(fullPath, { volume: targetVolume, duckVolume: this.audioConfig.duckingVolume });
            this.logger.debug('Speech playback completed for ' + audioPath);
        } catch (err) {
            this.logger.error('Error during speech playback:', err && err.message ? err.message : err);
            // remove duck if applied
            if (duckId) this._removeDucking(duckId);
            this.mpvInstances.speech.status = 'idle';
            this.publishMessage('warning', { message: err && err.message ? err.message : String(err), command: 'playSpeech', file: audioPath });
            return;
        }

        // playback finished -> remove duck
        if (duckId) {
            this._removeDucking(duckId);
        }
        this.mpvInstances.speech.status = 'idle';

        this.currentState.lastSpeech = { file: audioPath, timestamp: new Date().toISOString(), duckingLevel, duckId };
        this.publishStatus();
        this.publishEvent({ speech_started: audioPath, volume: targetVolume, ducking_applied: duckingLevel, duck_id: duckId });
    }

    async _clearSpeechQueue() { await this.audioManager.clearSpeechQueue(); this.currentState.speechQueue = { length: 0, isProcessing: false }; this.mpvInstances.speech.status = 'idle'; this.publishStatus(); this.publishEvent({ speech_queue_cleared: true }); }
    async _pauseSpeech() { await this.audioManager.pauseSpeech(); this.mpvInstances.speech.status = 'paused'; this.publishStatus(); this.publishEvent({ speech_paused: true }); }
    async _resumeSpeech() { await this.audioManager.resumeSpeech(); this.mpvInstances.speech.status = 'playing'; this.publishStatus(); this.publishEvent({ speech_resumed: true }); }
    async _stopSpeech() { await this.audioManager.stopSpeech(); this.mpvInstances.speech.status = 'idle'; this.publishStatus(); this.publishEvent({ speech_stopped: true }); }
    async _skipSpeech() { await this.audioManager.skipSpeech(); this.publishStatus(); this.publishEvent({ speech_skipped: true }); }

    // ---------------------- Sound effects ----------------------
    async _playSoundEffect(audioPath, volume) {
        if (!audioPath) throw new Error('Sound effect path is required');
        const fv = await this._validateMediaFile(audioPath);
        if (!fv.exists) { this.publishMessage('warning', { message: fv.error, command: 'playSoundEffect', file: audioPath }); return; }
        const fullPath = fv.path; const targetVolume = volume !== undefined ? volume : this.currentState.backgroundMusic.volume;
        const result = await this.audioManager.playSoundEffect(fullPath, targetVolume);
        if (!result.success) { this.publishMessage('warning', { message: result.error, command: 'playSoundEffect', file: audioPath }); return; }
        this.currentState.lastSoundEffect = { file: audioPath, timestamp: new Date().toISOString() };
        this.publishEvent({ sound_effect_played: audioPath, volume: targetVolume });
    }

    async _setVolume(volume) {
        if (volume === undefined || volume < 0 || volume > 100) throw new Error('Volume must be between 0 and 100');
        if (this.currentState.backgroundMusic.playing) { await this.audioManager.setBackgroundMusicVolume(volume); this.currentState.backgroundMusic.volume = volume; }
        this.currentState.volume = volume; this.publishStatus(); this.publishEvent({ volume_changed: volume });
    }

    async _stopAll() { if (this.currentState.backgroundMusic.playing) await this._stopBackgroundMusic(); await this._clearSpeechQueue(); this.currentState.status = 'idle'; this.publishStatus(); this.publishEvent({ all_audio_stopped: true }); }

    async _pauseAudio() { if (this.currentState.backgroundMusic.playing) await this._pauseBackgroundMusic(); if (this.mpvInstances.speech.status === 'playing') await this._pauseSpeech(); this.publishEvent({ all_audio_paused: true }); }
    async _resumeAudio() { if (this.mpvInstances.background.status === 'paused') await this._resumeBackgroundMusic(); if (this.mpvInstances.speech.status === 'paused') await this._resumeSpeech(); this.publishEvent({ all_audio_resumed: true }); }

    // ---------------------- Manual duck/unduck commands ----------------------
    async _handleDuckCommand(command) {
        let duckValue = command.ducking;
        if (duckValue === undefined) {
            const v1 = this.audioConfig.duckingVolume !== null ? this.audioConfig.duckingVolume : (this.config.videoDucking !== undefined ? this.config.videoDucking : -24);
            const v2 = this.config.speechDucking !== undefined ? this.config.speechDucking : -26;
            duckValue = Math.round((v1 + v2) / 2);
        }
        const duckId = `manual-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
        this._applyDucking(duckId, duckValue);
        this.publishEvent({ ducked: true, ducking_applied: duckValue, duck_id: duckId });
        this.publishStatus();
    }

    async _handleUnduckCommand(command) {
        const id = command.duck_id;
        if (id) {
            this._removeDucking(id);
            this.publishEvent({ unducked: true, duck_id: id });
        } else {
            for (const key of Array.from(this._activeDucks.keys())) {
                if (String(key).startsWith('manual-')) this._removeDucking(key);
            }
            this.publishEvent({ unducked_all_manual: true });
        }
        this.publishStatus();
    }

    // ---------------------- Helpers ----------------------
    _setBackgroundVolume(volume) { if (this.currentState.backgroundMusic.playing) { this.audioManager.setBackgroundMusicVolume(volume); this.currentState.backgroundMusic.volume = volume; } }
    _getCurrentBackgroundVolume() { return this.currentState.backgroundMusic.volume || this.audioConfig.defaultVolume; }

    _resolveDeviceMediaDir(config) {
        const path = require('path');
        if (config.mediaDir && path.isAbsolute(config.mediaDir)) return config.mediaDir;
        const mediaBasePath = config.mediaBasePath || '/opt/paradox/media';
        const deviceMediaDir = config.mediaDir || config.media_dir || '';
        return path.join(mediaBasePath, deviceMediaDir);
    }
}

module.exports = AudioZone;

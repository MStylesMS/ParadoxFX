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
const { resolveEffectiveVolume } = require('../audio/resolve-effective-volume'); // PR-VOLUME Phase 8

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
            zoneId: config.name || 'unknown',
            maxVolume: config.maxVolume || config.max_volume || 150
        };

        // Audio management
        this.audioManager = new AudioManager(this.audioConfig, this);

        if (this.audioConfig.dualOutputMode) {
            this.logger.info(`Dual output mode enabled for zone ${this.audioConfig.zoneId}`);
        }

        this.originalBackgroundVolume = null;

        // Audio-specific state
        // Map legacy per-type volume config names into volumeModel if provided so status reflects user config rather than defaults
        if (this.volumeModel && this.volumeModel.baseVolumes) {
            if (this.audioConfig && this.audioConfig.defaultVolume !== undefined && this.config.background_volume !== undefined) {
                this.volumeModel.baseVolumes.background = parseInt(this.config.background_volume, 10);
            }
            if (this.config.speech_volume !== undefined) this.volumeModel.baseVolumes.speech = parseInt(this.config.speech_volume, 10);
            if (this.config.effects_volume !== undefined) this.volumeModel.baseVolumes.effects = parseInt(this.config.effects_volume, 10);
        }
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

        // Extract parameters excluding command
        const parameters = Object.keys(command)
            .filter(k => k !== 'Command' && k !== 'command')
            .reduce((acc, k) => { acc[k] = command[k]; return acc; }, {});

        // System control shortcuts
        if (['reboot', 'shutdown', 'killPfx'].includes(command.command)) {
            try {
                if (command.command === 'reboot') require('child_process').exec('sudo reboot');
                if (command.command === 'shutdown') require('child_process').exec('sudo shutdown now');
                if (command.command === 'killPfx') process.kill(process.pid, 'SIGTERM');
                this.publishCommandOutcome({
                    command: command.command,
                    outcome: 'success',
                    parameters,
                    message: `Command '${command.command}' executed successfully`
                });
            } catch (error) {
                this.publishCommandOutcome({
                    command: command.command,
                    outcome: 'failed',
                    parameters,
                    error_type: 'execution_error',
                    error_message: error.message,
                    message: `Command '${command.command}' failed: ${error.message}`
                });
                throw error;
            }
            return;
        }

        // Route commands
        try {
            switch (command.command) {
                case 'playBackground': {
                    const ok = await this._playBackgroundMusic(
                        command.file || command.audio,
                        {
                            volume: command.volume,
                            adjustVolume: command.adjustVolume,
                            loop: command.loop,
                            skipDucking: command.skipDucking || command.skip_ducking
                        }
                    );
                    if (ok === false) return; // outcome already published
                    break;
                }
                case 'pauseBackground':
                    await this._pauseBackgroundMusic();
                    break;
                case 'resumeBackground':
                    await this._resumeBackgroundMusic();
                    break;
                case 'stopBackground':
                    await this._stopBackgroundMusic(command.fadeTime || 0);
                    break;

                case 'playSpeech': {
                    const ok = await this._playSpeech(command.file || command.audio, command.volume, command.ducking);
                    if (ok === false) return; // outcome already published
                    break;
                }
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
                    await this._stopSpeech(command.fadeTime || 0);
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
                case 'playAudioFX': {
                    const ok = await this._playSoundEffect(command.file || command.audio, command.volume);
                    if (ok === false) return;
                    break;
                }

                case 'setVolume':
                    if (command.type || command.volumes) {
                        await this._handleSetVolumeModel(command);
                    } else {
                        await this._setVolume(command.volume);
                    }
                    break;
                case 'setDuckingAdjustment':
                    await this._handleSetDuckingAdjustment(command);
                    break;
                case 'getStatus':
                case 'getState':
                    this.publishStatus();
                    break;
                case 'stopAudio':
                    await this._stopAudio(command.fadeTime || 0);
                    break;
                case 'stopAll':
                    await this._stopAll(command.fadeTime || 0);
                    break;
                default:
                    this._handleUnsupportedCommand(command.command);
                    return; // Unsupported already published as warning
            }
            // Merge telemetry if last playback produced it and matches this command
            if (this._lastPlaybackTelemetry && this._lastPlaybackTelemetry.command === command.command) {
                Object.assign(parameters, {
                    effective_volume: this._lastPlaybackTelemetry.effective_volume,
                    pre_duck_volume: this._lastPlaybackTelemetry.pre_duck_volume,
                    ducked: this._lastPlaybackTelemetry.ducked
                });
                // clear after use to avoid leaking to unrelated commands
                this._lastPlaybackTelemetry = null;
            }
            this.publishCommandOutcome({
                command: command.command,
                outcome: 'success',
                parameters,
                message: `Command '${command.command}' executed successfully`
            });
        } catch (error) {
            this.publishCommandOutcome({
                command: command.command,
                outcome: 'failed',
                parameters,
                error_type: 'execution_error',
                error_message: error.message,
                message: `Command '${command.command}' failed: ${error.message}`
            });
            throw error;
        }
    }

    getSupportedCommands() {
        return [
            'playBackground', 'pauseBackground', 'resumeBackground', 'stopBackground',
            'playSpeech', 'pauseSpeech', 'resumeSpeech', 'stopSpeech', 'skipSpeech', 'clearSpeechQueue',
            'playSoundEffect', 'playEffect', 'playAudioFX',
            'duck', 'unduck',
            'setVolume', 'getStatus', 'getState', 'stopAll', 'reboot', 'shutdown', 'killPfx'
        ];
    }

    _isCommandSupported(command) {
        // Audio zone ignores screen/video commands
        const unsupported = ['setImage', 'playVideo', 'stopVideo', 'sleepScreen', 'wakeScreen'];
        return !unsupported.includes(command);
    }

    async shutdown() {
        await this._stopAll();
        await this.audioManager.shutdown();
        this._stopPeriodicStatus();
        this.isInitialized = false;
    }

    // ---------------------- Background music ----------------------
    async _playBackgroundMusic(audioPath, params = {}) {
        // params: { volume, adjustVolume, loop, skipDucking }
        if (!audioPath) throw new Error('Background music path is required');
        const { volume, adjustVolume, loop, skipDucking } = params || {};
        const fv = await this._validateMediaFile(audioPath);
        if (!fv.exists) {
            this.publishCommandOutcome({
                command: 'playBackground',
                outcome: 'failed',
                parameters: { file: audioPath, loop },
                error_type: 'file_not_found',
                error_message: fv.error,
                message: `Background music file not found: ${audioPath}`
            });
            return false;
        }
        const fullPath = fv.path;

        // Phase 8: resolve effective volume using unified model
        const commandPayload = {};
        if (volume !== undefined) commandPayload.volume = volume;
        if (adjustVolume !== undefined) commandPayload.adjustVolume = adjustVolume;
        if (skipDucking !== undefined) commandPayload.skipDucking = skipDucking;
        const duckActive = this.getDuckActive();
        let resolved;
        try {
            resolved = resolveEffectiveVolume({ type: 'background', zoneModel: this.volumeModel, command: commandPayload, duckActive });
        } catch (e) {
            this.publishCommandOutcome({
                command: 'playBackground',
                outcome: 'failed',
                parameters: { file: audioPath, loop, ...commandPayload },
                error_type: 'volume_resolution_error',
                error_message: e.message,
                message: `Failed to resolve background volume: ${e.message}`
            });
            return false;
        }

        const targetVolume = resolved.final;
        const res = await this.audioManager.playBackgroundMusic(fullPath, targetVolume, !!loop);
        if (!res.success) {
            this.publishCommandOutcome({
                command: 'playBackground',
                outcome: 'failed',
                parameters: { file: audioPath, loop, volume: targetVolume },
                error_type: 'play_error',
                error_message: res.error,
                message: `Failed to start background music: ${res.error}`
            });
            return false;
        }

        // Track context for future duck lifecycle recomputes
        this._backgroundPlayContext = { command: commandPayload, preDuck: resolved.preDuck };
        this.currentState.backgroundMusic = { playing: true, file: audioPath, volume: targetVolume, isDucked: resolved.ducked };
        this.mpvInstances.background.currentFile = audioPath; this.mpvInstances.background.status = 'playing';
        this.publishStatus();
        this.publishEvent({ background_music_started: audioPath, volume: targetVolume, pre_duck: resolved.preDuck, ducked: resolved.ducked });
        // Store telemetry for command outcome enrichment
        this._lastPlaybackTelemetry = { command: 'playBackground', effective_volume: targetVolume, pre_duck_volume: resolved.preDuck, ducked: resolved.ducked };
        if (resolved.warnings && resolved.warnings.length) {
            // Aggregate warning codes into a single warning outcome
            this.publishCommandOutcome({
                command: 'playBackground',
                outcome: 'warning',
                parameters: { file: audioPath, loop, volume: targetVolume, warnings: resolved.warnings.map(w => w.code), effective_volume: targetVolume, pre_duck_volume: resolved.preDuck, ducked: resolved.ducked },
                warning_type: 'volume_resolution_warning',
                message: 'Background playback started with volume resolution warnings'
            });
        }
        return true;
    }

    async _stopBackgroundMusic(fadeTime = 0) {
        if (fadeTime > 0) {
            const durationMs = fadeTime * 1000;
            const fadeResult = await this.audioManager.fadeBackgroundMusic(0, durationMs, async () => {
                await this.audioManager.stopBackgroundMusic();
                this.currentState.backgroundMusic = { playing: false, file: null, volume: this.currentState.backgroundMusic.volume, isDucked: false };
                this.mpvInstances.background.currentFile = null; this.mpvInstances.background.status = 'idle';
                this.publishStatus();
                this.publishEvent({ background_music_stopped: true, fade_time: fadeTime });
                this.logger.info(`Background music stopped with ${fadeTime}s fade`);
            });
            if (!fadeResult.success) {
                this.logger.error('Failed to start background music fade:', fadeResult.error);
                await this.audioManager.stopBackgroundMusic();
                this.currentState.backgroundMusic = { playing: false, file: null, volume: this.currentState.backgroundMusic.volume, isDucked: false };
                this.mpvInstances.background.currentFile = null; this.mpvInstances.background.status = 'idle';
                this.publishStatus(); this.publishEvent({ background_music_stopped: true });
            }
        } else {
            await this.audioManager.stopBackgroundMusic();
            this.currentState.backgroundMusic = { playing: false, file: null, volume: this.currentState.backgroundMusic.volume, isDucked: false };
            this.mpvInstances.background.currentFile = null; this.mpvInstances.background.status = 'idle';
            this.publishStatus(); this.publishEvent({ background_music_stopped: true });
        }
    }

    async _pauseBackgroundMusic() { await this.audioManager.pauseBackgroundMusic(); this.mpvInstances.background.status = 'paused'; this.publishStatus(); }
    async _resumeBackgroundMusic() { await this.audioManager.resumeBackgroundMusic(); this.mpvInstances.background.status = 'playing'; this.publishStatus(); }

    // ---------------------- Speech ----------------------
    async _playSpeech(audioPath, volume, ducking) {
        if (!audioPath) throw new Error('Speech path is required');
        const fv = await this._validateMediaFile(audioPath);
        if (!fv.exists) {
            this.publishCommandOutcome({
                command: 'playSpeech',
                outcome: 'failed',
                parameters: { file: audioPath, ducking },
                error_type: 'file_not_found',
                error_message: fv.error,
                message: `Speech file not found: ${audioPath}`
            });
            return false;
        }
        const fullPath = fv.path;
        const processRunning = await this.audioManager.checkAndRestartProcesses();
        if (!processRunning) {
            this.publishCommandOutcome({
                command: 'playSpeech',
                outcome: 'failed',
                parameters: { file: audioPath },
                error_type: 'subsystem_unavailable',
                error_message: 'Speech system not available',
                message: `Speech system not available for file: ${audioPath}`
            });
            return false;
        }
        const commandPayload = {};
        if (volume !== undefined) commandPayload.volume = volume;
        const resolvedSpeech = resolveEffectiveVolume({ type: 'speech', zoneModel: this.volumeModel, command: commandPayload, duckActive: false });
        const targetVolume = resolvedSpeech.final;

        // Phase 8: use duckLifecycle instead of legacy _applyDucking for speech-triggered background duck
        let duckId = null;
        // Determine if we should activate ducking on background based on provided ducking param or defaults
        const codeDefault = -26;
        const zoneDefault = (this.audioConfig.duckingVolume !== null && this.audioConfig.duckingVolume < 0) ? this.audioConfig.duckingVolume : undefined;
        const globalDefault = (this.config && this.config.speechDucking !== undefined && this.config.speechDucking < 0) ? this.config.speechDucking : undefined;
        const duckingLevel = ducking !== undefined ? ducking : (zoneDefault !== undefined ? zoneDefault : (globalDefault !== undefined ? globalDefault : codeDefault));
        if (duckingLevel < 0) {
            duckId = `speech-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            this.duckLifecycle.addTrigger(duckId, 'speech');
            // Recompute background volume with duck active
            await this._recomputeBackgroundAfterDuckChange();
        }

        this.logger.info(`Playing speech: ${audioPath} at volume ${targetVolume} (duck trigger=${duckId ? 'yes' : 'no'})`);

        // audioManager.playSpeech returns a promise that resolves on completion
        try {
            this.mpvInstances.speech.status = 'playing';
            await this.audioManager.playSpeech(fullPath, { volume: targetVolume });
            this.logger.debug('Speech playback completed for ' + audioPath);
        } catch (err) {
            this.logger.error('Error during speech playback:', err && err.message ? err.message : err);
            if (duckId) {
                this.duckLifecycle.removeTrigger(duckId);
                await this._recomputeBackgroundAfterDuckChange();
            }
            this.mpvInstances.speech.status = 'idle';
            this.publishCommandOutcome({
                command: 'playSpeech',
                outcome: 'failed',
                parameters: { file: audioPath, ducking: duckingLevel },
                error_type: 'play_error',
                error_message: err && err.message ? err.message : String(err),
                message: `Failed to play speech: ${audioPath}`
            });
            return false;
        }
        if (duckId) {
            this.duckLifecycle.removeTrigger(duckId);
            await this._recomputeBackgroundAfterDuckChange();
        }
        this.mpvInstances.speech.status = 'idle';

        this.currentState.lastSpeech = { file: audioPath, timestamp: new Date().toISOString(), duckingLevel, duckId };
        this.publishStatus();
        this.publishEvent({ speech_started: audioPath, volume: targetVolume, ducking_applied: duckingLevel, duck_id: duckId });
        this._lastPlaybackTelemetry = { command: 'playSpeech', effective_volume: targetVolume, pre_duck_volume: resolvedSpeech.preDuck, ducked: false };
        if (resolvedSpeech.warnings && resolvedSpeech.warnings.length) {
            this.publishCommandOutcome({
                command: 'playSpeech',
                outcome: 'warning',
                parameters: { file: audioPath, volume: targetVolume, warnings: resolvedSpeech.warnings.map(w => w.code), effective_volume: targetVolume, pre_duck_volume: resolvedSpeech.preDuck, ducked: false },
                warning_type: 'volume_resolution_warning',
                message: 'Speech playback completed with volume resolution warnings'
            });
        }
        return true;
    }

    async _clearSpeechQueue() { await this.audioManager.clearSpeechQueue(); this.currentState.speechQueue = { length: 0, isProcessing: false }; this.mpvInstances.speech.status = 'idle'; this.publishStatus(); this.publishEvent({ speech_queue_cleared: true }); }
    async _pauseSpeech() { await this.audioManager.pauseSpeech(); this.mpvInstances.speech.status = 'paused'; this.publishStatus(); this.publishEvent({ speech_paused: true }); }
    async _resumeSpeech() { await this.audioManager.resumeSpeech(); this.mpvInstances.speech.status = 'playing'; this.publishStatus(); this.publishEvent({ speech_resumed: true }); }
    async _stopSpeech(fadeTime = 0) {
        if (fadeTime > 0) {
            const durationMs = fadeTime * 1000;
            const fadeResult = await this.audioManager.fadeSpeech(0, durationMs, async () => {
                await this.audioManager.stopSpeech();
                this.mpvInstances.speech.status = 'idle';
                this.publishStatus();
                this.publishEvent({ speech_stopped: true, fade_time: fadeTime });
                this.logger.info(`Speech stopped with ${fadeTime}s fade`);
            });
            if (!fadeResult.success) {
                this.logger.error('Failed to start speech fade:', fadeResult.error);
                await this.audioManager.stopSpeech();
                this.mpvInstances.speech.status = 'idle'; this.publishStatus(); this.publishEvent({ speech_stopped: true });
            }
        } else {
            await this.audioManager.stopSpeech(); this.mpvInstances.speech.status = 'idle'; this.publishStatus(); this.publishEvent({ speech_stopped: true });
        }
    }
    async _skipSpeech() { await this.audioManager.skipSpeech(); this.publishStatus(); this.publishEvent({ speech_skipped: true }); }

    // ---------------------- Sound effects ----------------------
    async _playSoundEffect(audioPath, volume) {
        if (!audioPath) throw new Error('Sound effect path is required');
        const fv = await this._validateMediaFile(audioPath);
        if (!fv.exists) {
            this.publishCommandOutcome({
                command: 'playSoundEffect',
                outcome: 'failed',
                parameters: { file: audioPath, volume },
                error_type: 'file_not_found',
                error_message: fv.error,
                message: `Sound effect file not found: ${audioPath}`
            });
            return false;
        }
        const fullPath = fv.path;
        // Use resolver for effects for consistent telemetry
        const commandPayload = {};
        if (volume !== undefined) commandPayload.volume = volume;
        let resolvedFX;
        try {
            resolvedFX = resolveEffectiveVolume({ type: 'effects', zoneModel: this.volumeModel, command: commandPayload, duckActive: false });
        } catch (e) { resolvedFX = { final: volume !== undefined ? volume : this.currentState.backgroundMusic.volume, preDuck: volume !== undefined ? volume : this.currentState.backgroundMusic.volume, ducked: false, warnings: [] }; }
        const targetVolume = resolvedFX.final;
        const result = await this.audioManager.playSoundEffect(fullPath, targetVolume);
        if (!result.success) {
            this.publishCommandOutcome({
                command: 'playSoundEffect',
                outcome: 'failed',
                parameters: { file: audioPath, volume: targetVolume },
                error_type: 'play_error',
                error_message: result.error,
                message: `Failed to play sound effect: ${audioPath}`
            });
            return false;
        }
        this.currentState.lastSoundEffect = { file: audioPath, timestamp: new Date().toISOString() };
        this.publishEvent({ sound_effect_played: audioPath, volume: targetVolume, pre_duck: resolvedFX.preDuck, ducked: resolvedFX.ducked });
        this._lastPlaybackTelemetry = { command: 'playSoundEffect', effective_volume: targetVolume, pre_duck_volume: resolvedFX.preDuck, ducked: resolvedFX.ducked };
        if (resolvedFX.warnings && resolvedFX.warnings.length) {
            this.publishCommandOutcome({
                command: 'playSoundEffect',
                outcome: 'warning',
                parameters: { file: audioPath, volume: targetVolume, warnings: resolvedFX.warnings.map(w => w.code), effective_volume: targetVolume, pre_duck_volume: resolvedFX.preDuck, ducked: resolvedFX.ducked },
                warning_type: 'volume_resolution_warning',
                message: 'Sound effect played with volume resolution warnings'
            });
        }
        return true;
    }

    async _setVolume(volume) {
        if (volume === undefined || volume < 0 || volume > 200) throw new Error('Volume must be between 0 and 200');
        if (this.currentState.backgroundMusic.playing) {
            await this.audioManager.setBackgroundMusicVolume(volume);
            this.currentState.backgroundMusic.volume = volume;
        }
        this.currentState.volume = volume;
        this.publishStatus();
        this.publishEvent({ volume_changed: volume });
    }

    // ========================================================================
    // PR-VOLUME Phase 4: Model mutation command handlers (audio zone)
    // ========================================================================
    async _handleSetVolumeModel(command) {
        const { type, volume, volumes } = command;
        if (type) {
            const result = this._setBaseVolumeType(type, volume);
            if (!result.ok) {
                this.publishCommandOutcome({ command: 'setVolume', outcome: 'failed', parameters: { type, volume }, error_type: result.error_type || 'validation', message: result.message });
                return;
            }
            this.publishCommandOutcome({ command: 'setVolume', outcome: result.outcome, parameters: { type: result.type, volume: result.final, requested: result.requested }, message: result.message, warning_type: result.warning_type });
            this.publishStatus();
            return;
        }
        if (volumes && typeof volumes === 'object') {
            const bulk = this._setBaseVolumesBulk(volumes);
            if (bulk.overall === 'failed') {
                this.publishCommandOutcome({ command: 'setVolume', outcome: 'failed', parameters: { volumes }, error_type: 'validation', message: bulk.message });
                return;
            }
            this.publishCommandOutcome({ command: 'setVolume', outcome: bulk.overall, parameters: { volumes: Object.fromEntries(Object.entries(volumes).map(([k, v]) => [k, this.volumeModel.baseVolumes[k]])) }, message: bulk.message, warning_type: bulk.warning_type });
            this.publishStatus();
            return;
        }
        this.publishCommandOutcome({ command: 'setVolume', outcome: 'failed', parameters: { type, volume, volumes }, error_type: 'validation', message: 'Invalid setVolume payload: expected {type, volume} or {volumes:{...}}' });
    }

    async _handleSetDuckingAdjustment(command) {
        const { adjustValue } = command;
        const result = this._setDuckingAdjustment(adjustValue);
        if (!result.ok) {
            this.publishCommandOutcome({ command: 'setDuckingAdjustment', outcome: 'failed', parameters: { adjustValue }, error_type: result.error_type || 'validation', message: result.message });
            return;
        }
        this.publishCommandOutcome({ command: 'setDuckingAdjustment', outcome: result.outcome, parameters: { adjustValue: result.final, requested: result.requested }, message: result.message, warning_type: result.warning_type });
        this.publishStatus();
    }

    async _stopAudio(fadeTime = 0) {
        if (this.currentState.backgroundMusic.playing) await this._stopBackgroundMusic(fadeTime);
        // For speech we either fade or immediate; using _stopSpeech to leverage fade logic
        await this._stopSpeech(fadeTime);
        this.publishEvent({ all_audio_stopped: true, fade_time: fadeTime });
    }

    async _stopAll(fadeTime = 0) { await this._stopAudio(fadeTime); this.currentState.status = 'idle'; this.publishStatus(); }

    async _pauseAudio() { if (this.currentState.backgroundMusic.playing) await this._pauseBackgroundMusic(); if (this.mpvInstances.speech.status === 'playing') await this._pauseSpeech(); this.publishEvent({ all_audio_paused: true }); }
    async _resumeAudio() { if (this.mpvInstances.background.status === 'paused') await this._resumeBackgroundMusic(); if (this.mpvInstances.speech.status === 'paused') await this._resumeSpeech(); this.publishEvent({ all_audio_resumed: true }); }

    // ---------------------- Manual duck/unduck commands ----------------------
    async _handleDuckCommand(command) {
        // Phase 8: manual duck now uses unified lifecycle (percentage duck handled by resolver via duckingAdjust)
        // We interpret provided 'ducking' value only to decide whether to create a trigger (negative) or ignore.
        let duckValue = command.ducking;
        if (duckValue === undefined) {
            // Use average of configured video/speech defaults (legacy behavior) just for telemetry; effect size now comes from model.duckingAdjust
            const v1 = this.audioConfig.duckingVolume !== null ? this.audioConfig.duckingVolume : (this.config.videoDucking !== undefined ? this.config.videoDucking : -24);
            const v2 = this.config.speechDucking !== undefined ? this.config.speechDucking : -26;
            duckValue = Math.round((v1 + v2) / 2);
        }
        if (duckValue >= 0) {
            this.publishEvent({ manual_duck_ignored: true, reason: 'non_negative_value', requested: duckValue });
            return;
        }
        const duckId = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.duckLifecycle.addTrigger(duckId, 'manual');
        await this._recomputeBackgroundAfterDuckChange();
        this.publishEvent({ ducked: true, ducking_triggered: true, duck_id: duckId, requested_duck_level: duckValue });
        this.publishStatus();
    }

    async _handleUnduckCommand(command) {
        const id = command.duck_id;
        if (id) {
            this.duckLifecycle.removeTrigger(id);
            await this._recomputeBackgroundAfterDuckChange();
            this.publishEvent({ unducked: true, duck_id: id });
        } else {
            // Remove all manual triggers
            if (this.duckLifecycle) {
                const snap = this.duckLifecycle.snapshot();
                // We don't track IDs by kind, so brute force by inspecting internal map via snapshot not possible; maintain external list earlier? Instead rely on pattern: manual-
                // DuckLifecycle doesn't expose internal IDs; we stored them only when creating manual triggers. As a pragmatic approach, we can't enumerate -> soft reset.
                // Clear all then re-add non-manual if we had a catalog (we don't). Simpler: clear all and warn.
                this.duckLifecycle.clear();
            }
            await this._recomputeBackgroundAfterDuckChange();
            this.publishEvent({ unducked_all_manual: true, note: 'cleared_all_triggers_due_to_lifecycle_limitation' });
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

    // Phase 8 helper: recompute background volume when duck lifecycle changes
    async _recomputeBackgroundAfterDuckChange() {
        if (!this.currentState.backgroundMusic.playing) return;
        const commandPayload = this._backgroundPlayContext ? (this._backgroundPlayContext.command || {}) : {};
        let resolved;
        try {
            resolved = resolveEffectiveVolume({ type: 'background', zoneModel: this.volumeModel, command: commandPayload, duckActive: this.getDuckActive() });
        } catch (e) {
            this.logger.warn('Failed to recompute background volume after duck change: ' + e.message);
            return;
        }
        try {
            await this.audioManager.setBackgroundMusicVolume(resolved.final);
            this.currentState.backgroundMusic.volume = resolved.final;
            this.currentState.backgroundMusic.isDucked = resolved.ducked;
            this.publishStatus();
            this.publishEvent({ background_volume_recomputed: true, effective_volume: resolved.final, pre_duck_volume: resolved.preDuck, ducked: resolved.ducked });
        } catch (e) {
            this.logger.warn('Failed to apply recomputed background volume: ' + e.message);
        }
    }
}

module.exports = AudioZone;

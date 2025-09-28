/**
 * Base Zone Class
 * 
 * Abstract base class for all zone types in ParadoxFX system.
 * Provides common functionality for MQTT messaging, status reporting, and MPV instance management.
 */

const path = require('path');
const Logger = require('../utils/logger');
const Utils = require('../utils/utils');

class BaseZone {
    constructor(config, mqttClient) {
        if (new.target === BaseZone) {
            throw new Error('BaseZone is an abstract class and cannot be instantiated directly');
        }

        this.config = config;
        this.mqttClient = mqttClient;
        this.logger = new Logger(`${this.constructor.name}:${config.name}`);

        // Zone state
        this.isInitialized = false;
        this.currentState = {
            status: 'idle',
            volume: parseInt(config.volume) || 80,
            lastCommand: null,
            errors: []
        };

        // Per-zone ducking state
        this._activeDucks = new Map(); // key -> duck level (0-100)
        this._baseBackgroundVolume = null;

        // MPV instance tracking
        this.mpvInstances = {
            media: null,      // For images/video (screen zones only)
            background: null, // For background music  
            speech: null      // For speech/narration
        };

        // MPV socket paths
        this.socketPaths = {
            media: `/tmp/mpv-${Utils.sanitizeFilename(config.name)}-media.sock`,
            background: `/tmp/mpv-${Utils.sanitizeFilename(config.name)}-background.sock`,
            speech: `/tmp/mpv-${Utils.sanitizeFilename(config.name)}-speech.sock`
        };

        // Status update interval (enabled for 10-second heartbeat)
        this.statusInterval = null;
        this.statusIntervalMs = 10000; // 10 seconds for regular heartbeat
        this.periodicStatusEnabled = true; // Enabled for automatic state updates
    }

    /**
     * Publish a standardized command outcome event (success | failed | warning) and, when not successful,
     * also emit a human-readable warning message on the warnings topic.
     *
     * Event Schema (published to /events):
     * {
     *   command: string,              // canonical command name
     *   outcome: 'success'|'failed'|'warning',
     *   parameters?: object,          // original parameters (sanitized)
     *   message?: string,             // human readable summary (always for non-success, optional for success)
     *   error_type?: string,          // machine-friendly error category (failed only)
     *   error_message?: string,       // underlying error detail if available
     *   warning_type?: string,        // category for warning outcome
     *   timestamp: ISO8601 (injected by publishMessage)
     * }
     *
     * Warning Schema (published to /warnings for failed or warning outcomes):
     * {
     *   message: string,              // human readable summary
     *   command: string,
     *   outcome: 'failed'|'warning',
     *   error_type?: string,
     *   error_message?: string,
     *   warning_type?: string,
     *   parameters?: object,
     *   zone: string,                 // injected by publishMessage
     *   timestamp: ISO8601            // injected
     * }
     *
     * @param {Object} options
     * @param {string} options.command - Command name
     * @param {('success'|'failed'|'warning')} options.outcome - Outcome classification
     * @param {Object} [options.parameters] - Original command parameters (excluding the command field itself)
     * @param {string} [options.message] - Human readable summary (auto-generated if omitted on failure)
     * @param {string} [options.error_type] - Machine friendly error category for failures
     * @param {string} [options.error_message] - Low level error description
     * @param {string} [options.warning_type] - Category for warning (when outcome === 'warning')
     */
    publishCommandOutcome({ command, outcome, parameters = {}, message, error_type, error_message, warning_type }) {
        if (!command) {
            this.logger.warn('publishCommandOutcome called without command name');
            return;
        }

        // Normalize outcome
        const normalizedOutcome = ['success', 'failed', 'warning'].includes(outcome) ? outcome : 'failed';

        // Auto message if missing on non-success
        if (!message && normalizedOutcome !== 'success') {
            if (normalizedOutcome === 'failed') {
                message = error_message || `Command '${command}' failed`;
            } else if (normalizedOutcome === 'warning') {
                message = `Command '${command}' completed with warnings`;
            }
        }

        // Build event payload
        const eventPayload = {
            command,
            outcome: normalizedOutcome
        };
        if (parameters && Object.keys(parameters).length) eventPayload.parameters = parameters;
        if (message) eventPayload.message = message;
        if (error_type) eventPayload.error_type = error_type;
        if (error_message) eventPayload.error_message = error_message;
        if (warning_type) eventPayload.warning_type = warning_type;

        this.publishMessage('events', eventPayload);

        // Publish warning topic for non-success outcomes
        if (normalizedOutcome !== 'success') {
            const warningPayload = {
                message,
                command,
                outcome: normalizedOutcome,
            };
            if (parameters && Object.keys(parameters).length) warningPayload.parameters = parameters;
            if (error_type) warningPayload.error_type = error_type;
            if (error_message) warningPayload.error_message = error_message;
            if (warning_type) warningPayload.warning_type = warning_type;
            this.publishMessage('warning', warningPayload);
        }
    }

    /**
     * Initialize the zone - must be implemented by subclasses
     * @abstract
     */
    async initialize() {
        throw new Error('initialize() must be implemented by subclass');
    }

    /**
     * Handle MQTT command - must be implemented by subclasses
     * @abstract
     */
    async handleCommand(command) {
        throw new Error('handleCommand() must be implemented by subclass');
    }

    /**
     * Shutdown the zone - must be implemented by subclasses
     * @abstract
     */
    async shutdown() {
        throw new Error('shutdown() must be implemented by subclass');
    }

    /**
     * Publish MQTT message with specified type
     * @param {string} type - Message type: 'events', 'status', 'warning', 'error'
     * @param {Object} data - Message data
     */
    publishMessage(type, data) {
        if (!this.mqttClient || !this.config.baseTopic) {
            return;
        }

        const message = {
            timestamp: new Date().toISOString(),
            zone: this.config.name,
            type: type,
            ...data
        };

        // Add MPV instance status for status messages
        if (type === 'status') {
            message.mpv_instances = this._getMpvInstanceStatus();
            message.volume = this.currentState.volume;
            message.status = this.currentState.status;
        }

        // Normalize topic segment: commands, state, events, warnings
        let topicType = type;
        if (type === 'command') {
            topicType = 'commands';
        } else if (type === 'status') {
            topicType = 'state';  // Changed from 'status' to 'state' for standardization
        } else if (type === 'warning' || type === 'error') {
            topicType = 'warnings';
        }
        const topic = `${this.config.baseTopic}/${topicType}`;
        this.mqttClient.publish(topic, message);

        this.logger.debug(`Published ${type} message:`, message);
    }

    /**
     * Publish status update
     */
    publishStatus() {
        this.publishMessage('status', {
            current_state: this.currentState
        });
    }

    /**
     * Publish event message
     */
    publishEvent(eventData) {
        this.publishMessage('events', eventData);
    }

    /**
     * Publish warning message
     */
    publishWarning(message, details = {}) {
        this.publishMessage('warning', {
            message: message,
            ...details
        });
        this.logger.warn(message, details);
    }

    /**
     * Publish error message
     */
    publishError(message, details = {}) {
        this.publishMessage('warning', {
            message: message,
            ...details
        });
        this.logger.error(message, details);
    }

    /**
     * Get MPV instance status for status messages
     * @private
     */
    _getMpvInstanceStatus() {
        const status = {};

        for (const [instanceType, instance] of Object.entries(this.mpvInstances)) {
            if (instance) {
                status[instanceType] = {
                    status: instance.status || 'active',
                    file: instance.currentFile || null,
                    socket_path: this.socketPaths[instanceType]
                };
            } else {
                status[instanceType] = {
                    status: 'idle',
                    file: null,
                    socket_path: this.socketPaths[instanceType]
                };
            }
        }

        return status;
    }

    /**
     * Resolve media file path
     * @protected
     */
    _resolveMediaPath(filename) {
        const path = require('path');

        // Debug logging
        this.logger.debug(`_resolveMediaPath debug:`, {
            filename,
            'config.mediaDir': this.config.mediaDir,
            'config.mediaBasePath': this.config.mediaBasePath,
            'config.media_dir': this.config.media_dir
        });

        // Use the processed mediaDir if available, otherwise build from config
        if (this.config.mediaDir && path.isAbsolute(this.config.mediaDir)) {
            // mediaDir is already a complete absolute path (from _resolveDeviceMediaDir)
            const resolvedPath = path.resolve(path.join(this.config.mediaDir, filename));
            this.logger.debug(`Path resolved (absolute mediaDir): ${resolvedPath}`);
            return resolvedPath;
        } else {
            // Fallback: build path from base + device dir
            const mediaBasePath = this.config.mediaBasePath || '/opt/paradox/media';
            const deviceMediaDir = this.config.mediaDir || this.config.media_dir || '';
            const resolvedPath = path.resolve(path.join(mediaBasePath, deviceMediaDir, filename));
            this.logger.debug(`Path resolved (fallback): ${resolvedPath}`);
            return resolvedPath;
        }
    }

    /**
     * Check if media file exists and return full path
     * @protected
     */
    async _validateMediaFile(filename) {
        const fs = require('fs').promises;
        const fullPath = this._resolveMediaPath(filename);

        try {
            await fs.access(fullPath);
            return { exists: true, path: fullPath };
        } catch (error) {
            return {
                exists: false,
                path: fullPath,
                error: `Media file not found: ${fullPath}`
            };
        }
    }

    /**
     * Check if MPV process is running and restart if needed
     * @protected
     */
    async _checkAndRestartMpvProcess(instanceType) {
        const instance = this.mpvInstances[instanceType];
        if (!instance || !instance.manager) {
            return false;
        }

        // For AudioManager instances, use the health check method
        if (instance.manager.checkAndRestartProcesses) {
            try {
                const healthy = await instance.manager.checkAndRestartProcesses();
                if (!healthy) {
                    this.logger.warn(`${instanceType} MPV processes not healthy`);
                    return false;
                }
                return true;
            } catch (error) {
                this.logger.error(`Error checking ${instanceType} MPV health:`, error);
                return false;
            }
        }

        // For other types of managers, check if they're initialized
        if (instance.manager.isInitialized === false) {
            this.logger.warn(`${instanceType} manager not initialized, attempting restart...`);
            try {
                await instance.manager.initialize();
                this.logger.info(`${instanceType} manager restarted successfully`);
                return true;
            } catch (error) {
                this.logger.error(`Failed to restart ${instanceType} manager:`, error);
                return false;
            }
        }

        return true; // Process is running
    }

    /**
     * Check if command is supported by this zone type
     * @protected
     */
    _isCommandSupported(command) {
        // Default implementation - subclasses can override
        return true;
    }

    /**
     * Handle unsupported command
     * @protected
     */
    _handleUnsupportedCommand(command) {
        const message = `Command '${command}' is not supported by ${this.config.type} zone '${this.config.name}'`;
        this.publishWarning(message, {
            command: command,
            zone_type: this.config.type,
            supported_commands: this.getSupportedCommands()
        });
    }

    /**
     * Get list of supported commands - should be implemented by subclasses
     * @protected
     */
    getSupportedCommands() {
        return []; // Override in subclasses
    }

    /**
     * Start periodic status updates (disabled by default)
     * @protected
     */
    _startPeriodicStatus() {
        if (!this.periodicStatusEnabled) {
            return; // Disabled as requested
        }

        if (this.statusInterval) {
            return; // Already started
        }

        this.statusInterval = setInterval(() => {
            this.publishStatus();
        }, this.statusIntervalMs);

        this.logger.debug('Started periodic status updates');
    }

    /**
     * Stop periodic status updates
     * @protected
     */
    _stopPeriodicStatus() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
            this.logger.debug('Stopped periodic status updates');
        }
    }

    // ========================================================================
    // PER-ZONE DUCKING SYSTEM
    // ========================================================================

    /**
     * Apply ducking with the specified level for the given ID
     * @param {string} duckId - Unique identifier for this duck request
     * @param {number} level - Ducking level (negative values for volume reduction, e.g., -20 to reduce by 20 units)
     * @protected
     */
    _applyDucking(duckId, level) {
        // Validate ducking level - only negative values are allowed
        if (typeof level !== 'number') {
            this.logger.warn(`Invalid ducking level ${level}, using default -26`);
            this.publishWarning(`Invalid ducking level ${level}, using default -26`, { duckId });
            level = -26;
        } else if (level > 0) {
            this.logger.warn(`Positive ducking values are not allowed (${level}), ignoring ducking`);
            this.publishWarning(`Positive ducking values are not allowed (${level}), ignoring ducking`, { duckId });
            return; // Do not apply ducking for positive values
        } else if (level < -100) {
            this.logger.warn(`Ducking level ${level} too low, capping at -100`);
            this.publishWarning(`Ducking level ${level} too low, capping at -100`, { duckId });
            level = -100;
        }

        this.logger.debug(`Applying ducking: ${duckId} at level ${level} units`);
        this._activeDucks.set(duckId, level);
        this._updateBackgroundVolume();
    }

    /**
     * Remove ducking for the specified ID
     * @param {string} duckId - Unique identifier for the duck request to remove
     * @protected
     */
    _removeDucking(duckId) {
        if (this._activeDucks.has(duckId)) {
            this.logger.debug(`Removing ducking: ${duckId}`);
            this._activeDucks.delete(duckId);
            this._updateBackgroundVolume();
        } else {
            this.logger.debug(`No ducking found for ID: ${duckId}`);
        }
    }

    /**
     * Update background volume based on active ducking
     * Uses the maximum ducking level across all active duckers (most negative value)
     * @protected
     */
    _updateBackgroundVolume() {
        if (this._activeDucks.size === 0) {
            // No active ducking, restore original volume
            if (this._baseBackgroundVolume !== null) {
                this.logger.debug(`Restoring background volume to ${this._baseBackgroundVolume}`);
                this._setBackgroundVolume(this._baseBackgroundVolume);
                this._baseBackgroundVolume = null;
            }
        } else {
            // Find the maximum ducking level among all active duckers (most negative value)
            const maxDuckLevel = Math.min(...this._activeDucks.values());

            // Store original volume if this is the first ducking
            if (this._baseBackgroundVolume === null) {
                this._baseBackgroundVolume = this._getCurrentBackgroundVolume();
                this.logger.debug(`Stored base background volume: ${this._baseBackgroundVolume}`);
            }

            // Calculate target volume: reduce by maxDuckLevel absolute units
            const targetVolume = Math.max(0, this._baseBackgroundVolume + maxDuckLevel);
            this.logger.debug(`Ducking background to ${targetVolume} (${maxDuckLevel} units reduction from ${this._baseBackgroundVolume})`);
            this._setBackgroundVolume(targetVolume);
        }
    }

    /**
     * Set background volume - must be implemented by subclasses
     * @param {number} volume - Volume level (0-200)
     * @protected
     * @abstract
     */
    _setBackgroundVolume(volume) {
        // Default implementation - subclasses should override
        this.logger.debug(`_setBackgroundVolume called with ${volume} (base implementation)`);
    }

    /**
     * Get current background volume - must be implemented by subclasses
     * @returns {number} Current background volume (0-200)
     * @protected
     * @abstract
     */
    _getCurrentBackgroundVolume() {
        // Default implementation - subclasses should override
        this.logger.debug('_getCurrentBackgroundVolume called (base implementation)');
        return this.currentState.volume || 80;
    }

    /**
     * Get active ducking information for debugging
     * @returns {Object} Active ducking status
     * @protected
     */
    _getDuckingStatus() {
        return {
            activeDucks: Object.fromEntries(this._activeDucks),
            duckCount: this._activeDucks.size,
            baseVolume: this._baseBackgroundVolume,
            maxDuckLevel: this._activeDucks.size > 0 ? Math.min(...this._activeDucks.values()) : 0
        };
    }
}

module.exports = BaseZone;

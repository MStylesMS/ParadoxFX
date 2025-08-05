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

        // Status update interval (disabled by default as requested)
        this.statusInterval = null;
        this.statusIntervalMs = 30000; // 30 seconds
        this.periodicStatusEnabled = false; // Commented out/disabled
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

        const statusTopic = `${this.config.baseTopic}/status`;
        this.mqttClient.publish(statusTopic, message);

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
        this.publishMessage('error', {
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
     * @param {number} level - Ducking level (0-100, where 100 is complete silence)
     * @protected
     */
    _applyDucking(duckId, level) {
        // Validate ducking level
        if (typeof level !== 'number' || level < 0 || level > 100) {
            this.logger.warn(`Invalid ducking level ${level}, using default 50`);
            level = 50;
        }

        this.logger.debug(`Applying ducking: ${duckId} at level ${level}%`);
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
     * Uses the maximum ducking level across all active duckers
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
            // Find the maximum ducking level among all active duckers
            const maxDuckLevel = Math.max(...this._activeDucks.values());
            
            // Store original volume if this is the first ducking
            if (this._baseBackgroundVolume === null) {
                this._baseBackgroundVolume = this._getCurrentBackgroundVolume();
                this.logger.debug(`Stored base background volume: ${this._baseBackgroundVolume}`);
            }

            // Calculate target volume: reduce by maxDuckLevel percentage
            const targetVolume = Math.round(this._baseBackgroundVolume * (100 - maxDuckLevel) / 100);
            this.logger.debug(`Ducking background to ${targetVolume} (${maxDuckLevel}% reduction from ${this._baseBackgroundVolume})`);
            this._setBackgroundVolume(targetVolume);
        }
    }

    /**
     * Set background volume - must be implemented by subclasses
     * @param {number} volume - Volume level (0-100)
     * @protected
     * @abstract
     */
    _setBackgroundVolume(volume) {
        // Default implementation - subclasses should override
        this.logger.debug(`_setBackgroundVolume called with ${volume} (base implementation)`);
    }

    /**
     * Get current background volume - must be implemented by subclasses
     * @returns {number} Current background volume (0-100)
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
            maxDuckLevel: this._activeDucks.size > 0 ? Math.max(...this._activeDucks.values()) : 0
        };
    }
}

module.exports = BaseZone;

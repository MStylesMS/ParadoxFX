/**
 * Base Zone Class
 * 
 * Abstract base class for all zone types in ParadoxFX system.
 * Provides common functionality for MQTT messaging, status reporting, and MPV instance management.
 */

const path = require('path');
const Logger = require('../utils/logger');

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

        // MPV instance tracking
        this.mpvInstances = {
            media: null,      // For images/video (screen zones only)
            background: null, // For background music  
            speech: null      // For speech/narration
        };

        // MPV socket paths
        this.socketPaths = {
            media: `/tmp/mpv-${config.name}-media.sock`,
            background: `/tmp/mpv-${config.name}-background.sock`, 
            speech: `/tmp/mpv-${config.name}-speech.sock`
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
        const mediaBasePath = this.config.mediaPath || '/opt/paradox/media';
        const mediaDir = this.config.media_dir || '';
        
        return path.resolve(path.join(mediaBasePath, mediaDir, filename));
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
}

module.exports = BaseZone;

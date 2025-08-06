/**
 * Zone Manager
 * 
 * Manages all zones in the ParadoxFX system with unified command interface.
 * Replaces the previous DeviceManager with zone-centric architecture.
 */

const ScreenZone = require('../zones/screen-zone');
const AudioZone = require('../zones/audio-zone');
const Logger = require('../utils/logger');

class ZoneManager {
    constructor(config, mqttClient) {
        this.config = config;
        this.mqttClient = mqttClient;
        this.logger = new Logger('ZoneManager');
        
        this.zones = new Map();
        this.isInitialized = false;
        
        // MQTT command subscriptions
        this.commandSubscriptions = new Map();
    }

    /**
     * Initialize all zones
     */
    async initialize() {
        if (this.isInitialized) {
            this.logger.warn('ZoneManager already initialized');
            return;
        }

        this.logger.info('Initializing zone manager...');

        try {
            // Create and initialize zones
            for (const [zoneName, zoneConfig] of Object.entries(this.config.devices)) {
                await this._createZone(zoneName, zoneConfig);
            }

            // Set up MQTT command routing
            this._setupMqttRouting();

            this.isInitialized = true;
            this.logger.info(`Zone manager initialized with ${this.zones.size} zones`);

        } catch (error) {
            this.logger.error('Failed to initialize zone manager:', error);
            throw error;
        }
    }

    /**
     * Create a zone based on its type
     * @private
     */
    async _createZone(zoneName, zoneConfig) {
        this.logger.info(`Creating ${zoneConfig.type} zone: ${zoneName}`);

        // Merge global configuration into zone config
        const mergedConfig = {
            ...zoneConfig,
            mediaBasePath: this.config.global.mediaBasePath,
            // Add other global properties that zones might need
            logLevel: this.config.global.logLevel
        };

        let zone;
        switch (zoneConfig.type) {
            case 'screen':
                zone = new ScreenZone(mergedConfig, this.mqttClient, this);
                break;
            case 'audio':
            case 'combined-audio':
                // Use AudioZone for both single and combined audio zones
                // Combined audio functionality can be implemented within AudioZone
                zone = new AudioZone(mergedConfig, this.mqttClient, this);
                break;
            default:
                throw new Error(`Unknown zone type: ${zoneConfig.type} for zone ${zoneName}`);
        }

        // Initialize the zone
        await zone.initialize();
        
        // Store the zone
        this.zones.set(zoneName, zone);
        this.logger.info(`Initialized ${zoneConfig.type} zone: ${zoneName}`);
    }

    /**
     * Set up MQTT command routing for all zones
     * @private
     */
    _setupMqttRouting() {
        this.logger.info('Setting up MQTT command routing...');

        for (const [zoneName, zone] of this.zones) {
            const commandTopic = `${zone.config.baseTopic}/commands`;
            
            this.logger.debug(`Subscribing to zone commands: ${commandTopic}`);
            
            // Create handler for this zone
            const handler = async (topic, message) => {
                await this._handleZoneCommand(zoneName, zone, message);
            };
            
            // Subscribe with handler
            this.mqttClient.subscribe(commandTopic, handler);
            
            // Store subscription mapping
            this.commandSubscriptions.set(commandTopic, { zoneName, zone });
        }
    }

    /**
     * Handle incoming MQTT command for a specific zone
     * @private
     */
    async _handleZoneCommand(zoneName, zone, message) {
        let command = null;
        let rawMessage = null;
        
        try {
            // Store raw message for error reporting
            rawMessage = typeof message === 'string' ? message : JSON.stringify(message);
            
            // Parse message if needed
            if (typeof message === 'string') {
                try {
                    command = JSON.parse(message);
                } catch (parseError) {
                    this.logger.warn(`Zone ${zoneName} received malformed JSON:`, message);
                    zone.publishMessage('warning', {
                        message: 'Invalid JSON format in command',
                        raw_message: message,
                        error: parseError.message
                    });
                    return; // Exit early for malformed JSON
                }
            } else {
                command = message;
            }
            
            // Validate command structure
            const validationError = this._validateCommand(command);
            if (validationError) {
                this.logger.warn(`Zone ${zoneName} received invalid command:`, validationError);
                zone.publishMessage('warning', {
                    message: 'Invalid command structure',
                    raw_message: rawMessage,
                    validation_error: validationError,
                    received_command: command
                });
                return; // Exit early for invalid commands
            }
            
            // Log the command at INFO level for better visibility, including parameters for playVideo
            const commandName = command.Command || command.command;
            // Build detailed log message
            let logMessage = `Zone ${zoneName} received valid command: ${commandName}`;
            if (commandName === 'playVideo' && command.video) {
                logMessage += ` video=${command.video}`;
                if (command.length != null) {
                    logMessage += ` length=${command.length}`;
                }
            }
            this.logger.info(logMessage);
            
            // Publish event message
            try {
                zone.publishMessage('events', {
                    command_received: commandName,
                    parameters: Object.keys(command).filter(k => k !== 'Command' && k !== 'command')
                });
            } catch (eventError) {
                this.logger.warn(`Failed to publish event for zone ${zoneName}:`, eventError);
            }

            // Handle the command with timeout to prevent hanging
            const commandPromise = zone.handleCommand(command);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Command execution timeout (30s)')), 30000);
            });
            
            await Promise.race([commandPromise, timeoutPromise]);

        } catch (error) {
            this.logger.error(`Error handling command for zone ${zoneName}:`, error);
            
            // Determine error type and publish appropriate message
            let errorType = 'unknown';
            let errorMessage = error.message || 'Unknown error occurred';
            
            if (error instanceof SyntaxError) {
                errorType = 'json_parse_error';
                errorMessage = 'Invalid JSON format in command';
            } else if (error.code === 'ENOENT') {
                errorType = 'file_not_found';
                errorMessage = 'Requested file not found';
            } else if (error.message && error.message.includes('timeout')) {
                errorType = 'command_timeout';
                errorMessage = 'Command execution timed out';
            } else if (error.name && error.name.includes('ValidationError')) {
                errorType = 'validation_error';
                errorMessage = 'Command validation failed';
            }
            
            // Safely publish error message
            try {
                zone.publishMessage('warning', {
                    message: errorMessage,
                    command: command?.Command || command?.command || 'unknown',
                    error_type: errorType,
                    raw_message: rawMessage,
                    timestamp: new Date().toISOString()
                });
            } catch (publishError) {
                this.logger.error(`Failed to publish error message for zone ${zoneName}:`, publishError);
            }
            
            // Do not re-throw error to prevent app crash
        }
    }
    
    /**
     * Validate command structure
     * @private
     */
    _validateCommand(command) {
        if (!command || typeof command !== 'object') {
            return 'Command must be a valid object';
        }
        
        // Check if Command or command field exists
        const hasCommand = 'Command' in command;
        const hasLowerCommand = 'command' in command;
        
        if (!hasCommand && !hasLowerCommand) {
            return 'Command must have a valid "Command" or "command" field';
        }
        
        const commandName = hasCommand ? command.Command : command.command;
        
        if (typeof commandName !== 'string') {
            return 'Command name must be a string';
        }
        
        if (commandName.trim() === '') {
            return 'Command name cannot be empty';
        }
        
        // Check for common required fields based on command type
        if (commandName.toLowerCase().includes('play') || commandName.toLowerCase().includes('audio') || commandName.toLowerCase().includes('video')) {
            const filePath = command.filePath || command.file || command.audio || command.video || command.image;
            if (filePath && typeof filePath !== 'string') {
                return 'File path must be a string';
            }
        }
        
        // Check volume parameter if present
        if (command.volume !== undefined) {
            const volume = parseFloat(command.volume);
            if (isNaN(volume) || volume < 0 || volume > 150) {
                return 'Volume must be a number between 0 and 150';
            }
        }
        
        return null; // No validation errors
    }

    /**
     * Get zone by name
     */
    getZone(zoneName) {
        return this.zones.get(zoneName);
    }

    /**
     * Get all zones
     */
    getAllZones() {
        return Array.from(this.zones.values());
    }

    /**
     * Get zones by type
     */
    getZonesByType(type) {
        return Array.from(this.zones.values()).filter(zone => zone.config.type === type);
    }

    /**
     * Duck audio in all audio zones
     * @param {string} originatingZoneName - The name of the zone requesting the ducking
     */
    duck(originatingZoneName) {
        this.logger.info(`Ducking audio for all zones (requested by ${originatingZoneName})`);
        const audioZones = this.getZonesByType('audio');
        for (const zone of audioZones) {
            if (zone.config.name !== originatingZoneName) {
                zone.duck();
            }
        }
    }

    /**
     * Unduck audio in all audio zones
     * @param {string} originatingZoneName - The name of the zone requesting the unducking
     */
    unduck(originatingZoneName) {
        this.logger.info(`Unducking audio for all zones (requested by ${originatingZoneName})`);
        const audioZones = this.getZonesByType('audio');
        for (const zone of audioZones) {
            if (zone.config.name !== originatingZoneName) {
                zone.unduck();
            }
        }
    }

    /**
     * Shutdown all zones
     */
    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        this.logger.info('Shutting down zone manager...');

        try {
            // Shutdown all zones
            const shutdownPromises = Array.from(this.zones.values()).map(zone => zone.shutdown());
            await Promise.all(shutdownPromises);

            // Unsubscribe from MQTT topics
            for (const commandTopic of this.commandSubscriptions.keys()) {
                this.mqttClient.unsubscribe(commandTopic);
            }
            this.commandSubscriptions.clear();

            this.zones.clear();
            this.isInitialized = false;
            
            this.logger.info('Zone manager shutdown complete');

        } catch (error) {
            this.logger.error('Error during zone manager shutdown:', error);
            throw error;
        }
    }
}

module.exports = ZoneManager;

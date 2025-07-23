/**
 * Zone Manager
 * 
 * Manages all zones in the ParadoxFX system with unified command interface.
 * Replaces the previous DeviceManager with zone-centric architecture.
 */

const ScreenZone = require('../zones/screen-zone');
const AudioZone = require('../zones/audio-zone');
const CombinedAudioZone = require('../zones/combined-audio-zone');
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

        let zone;
        switch (zoneConfig.type) {
            case 'screen':
                zone = new ScreenZone(zoneConfig, this.mqttClient);
                break;
            case 'audio':
                zone = new AudioZone(zoneConfig, this.mqttClient);
                break;
            case 'combined-audio':
                zone = new CombinedAudioZone(zoneConfig, this.mqttClient);
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
            const commandTopic = `${zone.config.baseTopic}/command`;
            
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
        try {
            // Message is already parsed by MqttClient
            const command = typeof message === 'string' ? JSON.parse(message) : message;
            
            // Log the command
            this.logger.debug(`Zone ${zoneName} received command: ${command.Command}`);
            
            // Publish event message
            zone.publishMessage('events', {
                command_received: command.Command,
                parameters: Object.keys(command).filter(k => k !== 'Command')
            });

            // Handle the command
            await zone.handleCommand(command);

        } catch (error) {
            this.logger.error(`Error handling command for zone ${zoneName}:`, error);
            
            // Check if it's a JSON parse error (invalid command format)
            if (error instanceof SyntaxError) {
                zone.publishMessage('warning', {
                    message: 'Invalid command format: Expected valid JSON',
                    raw_message: message.toString(),
                    error: error.message
                });
            } else {
                // Other errors (command execution failures)
                zone.publishMessage('error', {
                    message: error.message,
                    command: command?.Command || 'unknown',
                    error_type: error.constructor.name
                });
            }
        }
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

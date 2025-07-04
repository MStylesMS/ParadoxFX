/**
 * Configuration Loader
 * 
 * Loads and parses the pxfx.ini configuration file.
 */

const fs = require('fs').promises;
const ini = require('ini');
const Logger = require('../utils/logger');

class ConfigLoader {
    constructor() {
        this.logger = new Logger('ConfigLoader');
    }

    /**
     * Load configuration from INI file
     * @param {string} filePath - Path to the INI file
     * @returns {Object} Parsed configuration object
     */
    static async load(filePath) {
        const loader = new ConfigLoader();
        return await loader._load(filePath);
    }

    async _load(filePath) {
        try {
            this.logger.info(`Loading configuration from ${filePath}`);

            const fileContent = await fs.readFile(filePath, 'utf8');
            const rawConfig = ini.parse(fileContent);

            // Separate global config from device configs
            const { global, ...devices } = rawConfig;

            if (!global) {
                throw new Error('No [global] section found in configuration file');
            }

            // Validate global configuration
            this._validateGlobalConfig(global);

            // Process device configurations
            const processedDevices = {};
            for (const [deviceName, deviceConfig] of Object.entries(devices)) {
                processedDevices[deviceName] = this._processDeviceConfig(deviceName, deviceConfig);
            }

            const config = {
                global: this._processGlobalConfig(global),
                devices: processedDevices
            };

            this.logger.info(`Configuration loaded successfully: ${Object.keys(devices).length} devices`);
            return config;

        } catch (error) {
            this.logger.error('Failed to load configuration:', error);
            throw error;
        }
    }

    _validateGlobalConfig(global) {
        const required = ['MQTT_SERVER', 'HEARTBEAT_TOPIC'];
        for (const field of required) {
            if (!global[field]) {
                throw new Error(`Required global configuration field missing: ${field}`);
            }
        }
    }

    _processGlobalConfig(global) {
        return {
            mqttServer: global.MQTT_SERVER,
            mqttPort: parseInt(global.MQTT_PORT) || 1883,
            heartbeatTopic: global.HEARTBEAT_TOPIC,
            heartbeatInterval: parseInt(global.HEARTBEAT_INTERVAL_MS) || 10000
        };
    }

    _processDeviceConfig(deviceName, config) {
        if (!config.DEVICE_TYPE) {
            throw new Error(`Device ${deviceName} missing DEVICE_TYPE`);
        }

        const processed = {
            name: deviceName,
            type: config.DEVICE_TYPE,
            baseTopic: config.BASE_TOPIC,
            statusTopic: config.STATUS_TOPIC
        };

        // Add type-specific configuration
        switch (config.DEVICE_TYPE) {
            case 'screen':
                processed.display = config.DISPLAY;
                processed.mediaDir = config.MEDIA_DIR || '/opt/paradox/media';
                processed.audioChannelMap = config.AUDIO_CHANNEL_MAP;
                processed.videoQueueMax = parseInt(config.VIDEO_QUEUE_MAX) || 5;
                processed.audioQueueMax = parseInt(config.AUDIO_QUEUE_MAX) || 5;
                processed.transitionDelay = parseInt(config.TRANSITION_DELAY_MS) || 100;
                break;

            case 'light':
            case 'light_group':
                processed.controller = config.CONTROLLER;
                processed.deviceId = config.DEVICE_ID;
                processed.deviceList = config.DEVICE_LIST ? config.DEVICE_LIST.split(',').map(s => s.trim()) : null;
                break;

            case 'relay':
                processed.controller = config.CONTROLLER;
                processed.deviceId = config.DEVICE_ID;
                break;

            default:
                this.logger.warn(`Unknown device type: ${config.DEVICE_TYPE} for device ${deviceName}`);
        }

        return processed;
    }
}

module.exports = ConfigLoader;

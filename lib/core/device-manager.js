/**
 * Device Manager
 * 
 * Central registry and manager for all devices.
 * Routes MQTT commands to appropriate devices.
 */

const ScreenDevice = require('../devices/screen-device');
const LightDevice = require('../devices/light-device');
const LightGroupDevice = require('../devices/light-group-device');
const RelayDevice = require('../devices/relay-device');
const MessageRouter = require('./message-router');
const Logger = require('../utils/logger');

class DeviceManager {
    constructor(config, mqttClient) {
        this.logger = new Logger('DeviceManager');
        this.config = config;
        this.mqttClient = mqttClient;
        this.devices = new Map();
        this.messageRouter = new MessageRouter(this.devices, mqttClient);
    }

    async initialize() {
        this.logger.info('Initializing device manager...');

        // Create devices based on configuration
        for (const [deviceName, deviceConfig] of Object.entries(this.config.devices)) {
            try {
                const device = this._createDevice(deviceConfig);
                this.devices.set(deviceName, device);

                // Initialize the device
                await device.initialize();

                // Register for MQTT command routing
                this.messageRouter.registerDevice(device);

                this.logger.info(`Initialized ${deviceConfig.type} device: ${deviceName}`);

            } catch (error) {
                this.logger.error(`Failed to initialize device ${deviceName}:`, error);
                throw error;
            }
        }

        this.logger.info(`Device manager initialized with ${this.devices.size} devices`);
    }

    async shutdown() {
        this.logger.info('Shutting down device manager...');

        for (const [deviceName, device] of this.devices) {
            try {
                await device.shutdown();
                this.logger.debug(`Shut down device: ${deviceName}`);
            } catch (error) {
                this.logger.error(`Error shutting down device ${deviceName}:`, error);
            }
        }

        this.devices.clear();
        this.logger.info('Device manager shutdown complete');
    }

    getDevice(deviceName) {
        return this.devices.get(deviceName);
    }

    getAllDevices() {
        return Array.from(this.devices.values());
    }

    getDevicesByType(deviceType) {
        return Array.from(this.devices.values()).filter(device => device.config.type === deviceType);
    }

    _createDevice(deviceConfig) {
        // Add global config to device config
        const enrichedConfig = {
            ...deviceConfig,
            mediaBasePath: this.config.global.mediaBasePath
        };

        switch (deviceConfig.type) {
            case 'screen':
                return new ScreenDevice(enrichedConfig, this.mqttClient);

            case 'light':
                return new LightDevice(enrichedConfig, this.mqttClient);

            case 'light_group':
                return new LightGroupDevice(enrichedConfig, this.mqttClient);

            case 'relay':
                return new RelayDevice(enrichedConfig, this.mqttClient);

            default:
                throw new Error(`Unknown device type: ${deviceConfig.type}`);
        }
    }
}

module.exports = DeviceManager;

#!/usr/bin/env node

/**
 * Paradox Effects (ParadoxFX) - Main Application Entry Point
 * 
 * Multi-modal media and effect controller for interactive installations.
 * Supports screens, lights, and relays via MQTT commands.
 */

const DeviceManager = require('./lib/core/device-manager');
const ConfigLoader = require('./lib/core/config-loader');
const MqttClient = require('./lib/core/mqtt-client');
const Logger = require('./lib/utils/logger');

class ParadoxFXApplication {
    constructor() {
        this.logger = new Logger('ParadoxFX');
        this.config = null;
        this.deviceManager = null;
        this.mqttClient = null;
    }

    async start() {
        try {
            this.logger.info('Starting Paradox Effects application...');

            // Parse command line for --config or -c
            const argv = require('minimist')(process.argv.slice(2));
            const configFile = argv.config || argv.c || './pfx.ini';
            this.logger.info(`Using config file: ${configFile}`);

            // Load configuration
            this.config = await ConfigLoader.load(configFile);
            this.logger.info(`Loaded configuration for ${Object.keys(this.config.devices).length} devices`);

            // Initialize MQTT client
            this.mqttClient = new MqttClient(this.config.global);
            await this.mqttClient.connect();

            // Initialize device manager
            this.deviceManager = new DeviceManager(this.config, this.mqttClient);
            await this.deviceManager.initialize();

            // Setup graceful shutdown
            this.setupShutdownHandlers();

            this.logger.info('Paradox Effects application started successfully');

        } catch (error) {
            this.logger.error('Failed to start application:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        this.logger.info('Shutting down Paradox Effects application...');

        if (this.deviceManager) {
            await this.deviceManager.shutdown();
        }

        if (this.mqttClient) {
            await this.mqttClient.disconnect();
        }

        this.logger.info('Application shutdown complete');
        process.exit(0);
    }

    setupShutdownHandlers() {
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception:', error);
            this.shutdown();
        });
        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
            this.shutdown();
        });
    }
}

// Start the application if this file is run directly
if (require.main === module) {
    const app = new ParadoxFXApplication();
    app.start();
}

module.exports = ParadoxFXApplication;

#!/usr/bin/env node

/**
 * Paradox Effects (ParadoxFX) - Main Application Entry Point
 * 
 * Multi-modal media and effect controller for interactive installations.
 * Supports screens, lights, and relays via MQTT commands.
 */

const path = require('path');
const fs = require('fs');
const minimist = require('minimist');
const ZoneManager = require('./lib/core/zone-manager');
const ConfigLoader = require('./lib/core/config-loader');
const MqttClient = require('./lib/core/mqtt-client');
const Logger = require('./lib/utils/logger');

class PxFxApplication {
    constructor() {
        this.logger = new Logger('PxFx');
        this.config = null;
        this.zoneManager = null;
        this.mqttClient = null;
    }

    async start() {
        try {
            // Parse command line for --config/-c or positional argument
            const argv = minimist(process.argv.slice(2));
            const configFile = argv.config || argv.c || argv._[0] || 'pfx.ini';
            const configPath = path.resolve(configFile);
            this.logger.info('Starting Paradox Effects application...');
            this.logger.info(`Using configuration: ${configPath}`);
            if (!fs.existsSync(configPath)) {
                this.logger.error(`Configuration file not found: ${configPath}`);
                this.logger.error('Copy pfx.ini.example to pfx.ini and customize your settings.');
                process.exit(1);
            }
            // Load configuration
            this.config = await ConfigLoader.load(configPath);
            this.logger.info(`Loaded configuration for ${Object.keys(this.config.devices).length} devices`);

            // Initialize MQTT client
            this.mqttClient = new MqttClient(this.config.global);
            await this.mqttClient.connect();

            // Initialize zone manager
            this.zoneManager = new ZoneManager(this.config, this.mqttClient);
            await this.zoneManager.initialize();

            // Setup graceful shutdown
            this.setupShutdownHandlers();

            this.logger.info('Paradox Effects application started successfully');

        } catch (error) {
            this.logger.error('Failed to start application:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        this.logger.info('PFX shutting down politely, which may take a few seconds.');

        if (this.zoneManager) {
            await this.zoneManager.shutdown();
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
            this.logger.error('Application will continue running. Please check for underlying issues.');
            // Do NOT shutdown on unhandled rejections - this prevents MQTT message errors from crashing the app
        });
    }
}

// Start the application if this file is run directly
if (require.main === module) {
    const app = new PxFxApplication();
    app.start();
}

module.exports = PxFxApplication;

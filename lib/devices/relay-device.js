/**
 * Relay Device
 * 
 * Controls relay/switch devices through various controllers.
 * Supports simple on/off control with optional monitoring.
 */

const Logger = require('../utils/logger');

class RelayDevice {
    constructor(config, mqttClient) {
        this.config = config;
        this.mqttClient = mqttClient;
        this.logger = new Logger(`RelayDevice:${config.name}`);

        // Initialize state with defaults from config
        this.currentState = {
            status: 'offline',
            state: config.defaultState || 'off', // 'on' or 'off'
            voltage: null,
            current: null,
            power: null,
            lastUpdate: null,
            lockState: false // Prevents accidental changes
        };

        // Controller instance will be set during initialization
        this.controller = null;
        
        // Store command topic for responses
        this.commandTopic = `pxfx/${config.deviceId}/command`;
        this.stateTopic = `pxfx/${config.deviceId}/state`;

        // Safety settings
        this.safeMode = config.safeMode || false;
        this.maxOnTime = config.maxOnTime ? parseInt(config.maxOnTime) * 1000 : null; // Convert to ms
        this.onTimer = null;
    }

    async initialize() {
        this.logger.info(`Initializing relay device: ${this.config.deviceId} (${this.config.controller})`);

        try {
            // Initialize controller based on type
            await this._initializeController();

            // Subscribe to command topic
            this.mqttClient.subscribe(this.commandTopic, this.handleCommand.bind(this));

            this.currentState.status = 'ready';
            this.currentState.lastUpdate = new Date().toISOString();
            this._publishState();

            this.logger.info('Relay device initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize relay device:', error);
            this.currentState.status = 'error';
            this._publishState();
            throw error;
        }
    }

    async _initializeController() {
        switch (this.config.controller?.toLowerCase()) {
            case 'zwave':
                const ZwaveController = require('../controllers/zwave-controller');
                this.controller = new ZwaveController({
                    nodeId: this.config.nodeId,
                    endpoint: this.config.endpoint
                });
                break;
                
            case 'zigbee':
                const ZigbeeController = require('../controllers/zigbee-controller');
                this.controller = new ZigbeeController({
                    coordinator: this.config.coordinator,
                    deviceId: this.config.zigbeeId
                });
                break;
                
            case 'gpio':
                // For Raspberry Pi GPIO control
                this.controller = new GPIOController({
                    pin: this.config.pin,
                    mode: this.config.mode || 'output'
                });
                break;
                
            default:
                // Use mock controller for testing/development
                this.controller = new MockRelayController();
                this.logger.warn(`Using mock controller for ${this.config.controller}`);
        }

        if (this.controller.initialize) {
            await this.controller.initialize();
        }
    }

    async shutdown() {
        this.logger.info('Shutting down relay device...');

        // TODO: Cleanup controller connections
        // Ensure relay is in safe state

        this.logger.info('Relay device shutdown complete');
    }

    async handleCommand(command) {
        this.logger.debug(`Handling relay command: ${command.Command}`);

        try {
            switch (command.Command) {
                case 'turnOn':
                    await this._turnOn();
                    break;

                case 'turnOff':
                    await this._turnOff();
                    break;

                case 'toggle':
                    await this._toggle();
                    break;

                case 'pulse':
                    await this._pulse(command.Duration);
                    break;

                case 'getStatus':
                    this._publishState();
                    break;

                default:
                    throw new Error(`Unknown relay command: ${command.Command}`);
            }

        } catch (error) {
            this.logger.error(`Relay command failed: ${command.Command}`, error);
            this._publishError('COMMAND_FAILED', `${command.Command}: ${error.message}`);
            throw error;
        }
    }

    async _turnOn() {
        this.logger.info('Turning relay on');

        // TODO: Implement relay turn on based on controller type
        this.currentState.state = 'on';
        this.currentState.status = 'on';

        this._publishState();
    }

    async _turnOff() {
        this.logger.info('Turning relay off');

        // TODO: Implement relay turn off
        this.currentState.state = 'off';
        this.currentState.status = 'ready';

        this._publishState();
    }

    async _toggle() {
        this.logger.info('Toggling relay state');

        if (this.currentState.state === 'on') {
            await this._turnOff();
        } else {
            await this._turnOn();
        }
    }

    async _pulse(duration = 1000) {
        this.logger.info(`Pulsing relay for ${duration}ms`);

        // TODO: Implement pulse operation
        await this._turnOn();

        setTimeout(async () => {
            await this._turnOff();
        }, duration);
    }

    _publishState() {
        const stateMessage = {
            timestamp: new Date().toISOString(),
            device: this.config.name,
            type: 'state',
            controller: this.config.controller,
            device_id: this.config.deviceId,
            ...this.currentState
        };

        this.mqttClient.publish(this.config.statusTopic, stateMessage);
    }

    _publishError(errorCode, message) {
        const errorMessage = {
            timestamp: new Date().toISOString(),
            device: this.config.name,
            type: 'error',
            error_code: errorCode,
            message: message,
            source_topic: this.config.baseTopic
        };

        this.mqttClient.publish(this.config.statusTopic, errorMessage);
        this.mqttClient.publish(this.mqttClient.config.heartbeatTopic, errorMessage);
    }
}

module.exports = RelayDevice;

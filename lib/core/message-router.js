/**
 * Message Router
 * 
 * Routes MQTT commands to appropriate device handlers based on topic.
 */

const Logger = require('../utils/logger');

class MessageRouter {
    constructor(devices, mqttClient) {
        this.logger = new Logger('MessageRouter');
        this.devices = devices;
        this.mqttClient = mqttClient;
        this.topicMap = new Map(); // Maps topics to devices
    }

    registerDevice(device) {
        const baseTopic = device.config.baseTopic;
        if (!baseTopic) {
            this.logger.warn(`Device ${device.config.name} has no base topic configured`);
            return;
        }

        // Subscribe to command topic (baseTopic + '/command')
        const commandTopic = `${baseTopic}/command`;
        this.topicMap.set(commandTopic, device);

        this.mqttClient.subscribe(commandTopic, (topic, message) => {
            this._routeMessage(topic, message);
        });

        this.logger.debug(`Registered device ${device.config.name} for topic ${commandTopic}`);
    }

    unregisterDevice(device) {
        const baseTopic = device.config.baseTopic;
        if (!baseTopic) {
            return;
        }

        const commandTopic = `${baseTopic}/command`;
        this.topicMap.delete(commandTopic);
        this.mqttClient.unsubscribe(commandTopic);

        this.logger.debug(`Unregistered device ${device.config.name} from topic ${commandTopic}`);
    }

    _routeMessage(topic, message) {
        try {
            const device = this.topicMap.get(topic);
            if (!device) {
                this.logger.warn(`No device registered for topic: ${topic}`);
                return;
            }

            this.logger.debug(`Routing message to device ${device.config.name}`);

            // Validate message format
            if (typeof message !== 'object' || !message.Command) {
                this.logger.error(`Invalid message format on ${topic}:`, message);
                this._sendError(device, 'INVALID_MESSAGE_FORMAT', 'Message must be JSON with Command field');
                return;
            }

            // Route to device command handler
            device.handleCommand(message)
                .catch(error => {
                    this.logger.error(`Error handling command for device ${device.config.name}:`, error);
                    this._sendError(device, 'COMMAND_HANDLER_ERROR', error.message);
                });

        } catch (error) {
            this.logger.error(`Error routing message on ${topic}:`, error);
        }
    }

    _sendError(device, errorCode, message) {
        const errorMessage = {
            timestamp: new Date().toISOString(),
            device: device.config.name,
            type: 'error',
            error_code: errorCode,
            message: message,
            source_topic: device.config.baseTopic
        };

        // Send to device status topic
        if (device.config.statusTopic) {
            this.mqttClient.publish(device.config.statusTopic, errorMessage);
        }

        // Also send to global heartbeat topic
        this.mqttClient.publish(this.mqttClient.config.heartbeatTopic, errorMessage);
    }
}

module.exports = MessageRouter;

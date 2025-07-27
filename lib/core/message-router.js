/**
 * @fileoverview Message Router for ParadoxFX System
 * @description Routes MQTT messages to appropriate zone handlers
 */

const Logger = require('../utils/logger');

class MessageRouter {
    constructor(mqttClient, zoneManager) {
        this.mqttClient = mqttClient;
        this.zoneManager = zoneManager;
        this.logger = new Logger('MessageRouter');
        
        this.setupRouting();
    }

    setupRouting() {
        this.logger.info('Setting up MQTT message routing...');
        
        // Subscribe to all zone command topics
        this.mqttClient.subscribe('paradox/+/command', (topic, message) => {
            this.logger.info(`Message received on topic: ${topic}`);
            this.logger.info(`Raw message: ${message.toString()}`); // Debug logging
            
            try {
                const payload = JSON.parse(message.toString());
                const topicParts = topic.split('/');
                const zoneId = topicParts[1];

                if (this.zoneManager.zones.has(zoneId)) {
                    this.zoneManager.zones.get(zoneId).handleCommand(payload);
                } else {
                    this.logger.warn(`Received command for unknown zone: ${zoneId}`);
                }
            } catch (error) {
                this.logger.error(`Failed to parse MQTT message: ${message.toString()}`, error);
            }
        });

        this.logger.info('MQTT message routing setup complete');
    }
}

module.exports = MessageRouter;